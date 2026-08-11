-- Update the cleanup cron function to also delete unverified users older than 24 hours.

CREATE OR REPLACE FUNCTION public.cleanup_unverified_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  -- Delete users who haven't verified their email in public.profiles within 24 hours of creation
  DELETE FROM auth.users
  WHERE id IN (
    SELECT user_id
    FROM public.profiles
    WHERE (email_verified = false OR email_verified IS NULL)
      AND created_at <= now() - interval '24 hours'
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_unverified_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_unverified_users() TO service_role;

-- Replace the existing cleanup_ephemeral_auth_data function to include the new cleanup
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
  v_unverified_users_deleted integer := 0;
BEGIN
  SELECT public.cleanup_expired_auth_otps() INTO v_otp_deleted;
  SELECT public.cleanup_stale_group_invites() INTO v_invite_deleted;
  SELECT public.cleanup_stale_connections() INTO v_connection_deleted;
  SELECT public.cleanup_old_notifications() INTO v_notification_deleted;
  SELECT public.cleanup_unverified_users() INTO v_unverified_users_deleted;

  DELETE FROM public.auth_device_sessions
  WHERE active = false
     OR revoked_at IS NOT NULL
     OR last_seen_at <= now() - interval '30 days'
     OR created_at <= now() - interval '6 months';

  GET DIAGNOSTICS v_session_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'auth_otps_deleted', v_otp_deleted,
    'auth_device_sessions_deleted', v_session_deleted,
    'group_invites_deleted', v_invite_deleted,
    'connections_deleted', v_connection_deleted,
    'notifications_deleted', v_notification_deleted,
    'unverified_users_deleted', v_unverified_users_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ephemeral_auth_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ephemeral_auth_data() TO service_role;
