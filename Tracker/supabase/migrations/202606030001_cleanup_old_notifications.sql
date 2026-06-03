-- Remove product notifications older than the retention window.

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.notifications
  WHERE created_at <= now() - interval '5 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_ephemeral_auth_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_deleted integer := 0;
  v_session_deleted integer := 0;
  v_invite_deleted integer := 0;
  v_connection_deleted integer := 0;
  v_notification_deleted integer := 0;
BEGIN
  SELECT public.cleanup_expired_auth_otps() INTO v_otp_deleted;
  SELECT public.cleanup_stale_group_invites() INTO v_invite_deleted;
  SELECT public.cleanup_stale_connections() INTO v_connection_deleted;
  SELECT public.cleanup_old_notifications() INTO v_notification_deleted;

  DELETE FROM public.auth_device_sessions
  WHERE active = false
     OR revoked_at IS NOT NULL
     OR last_seen_at <= now() - interval '7 days';

  GET DIAGNOSTICS v_session_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'auth_otps_deleted', v_otp_deleted,
    'auth_device_sessions_deleted', v_session_deleted,
    'group_invites_deleted', v_invite_deleted,
    'connections_deleted', v_connection_deleted,
    'notifications_deleted', v_notification_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ephemeral_auth_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ephemeral_auth_data() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'spendova-cleanup-ephemeral-data'
  ) THEN
    PERFORM cron.unschedule('spendova-cleanup-ephemeral-data');
  END IF;

  PERFORM cron.schedule(
    'spendova-cleanup-ephemeral-data',
    '0 * * * *',
    'SELECT public.cleanup_ephemeral_auth_data();'
  );
END $$;

-- Apply once immediately when this migration is deployed.
SELECT public.cleanup_ephemeral_auth_data();
