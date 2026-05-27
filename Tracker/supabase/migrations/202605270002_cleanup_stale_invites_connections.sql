-- Remove temporary social/auth records that no longer affect product history.

CREATE OR REPLACE FUNCTION public.cleanup_stale_group_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.group_invites
  WHERE status <> 'pending'
     OR expires_at <= now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_group_invites() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_group_invites() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_stale_connections()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.connections
  WHERE status = 'rejected'
     OR (status = 'pending' AND created_at <= now() - interval '30 days');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_connections() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_connections() TO service_role;

CREATE OR REPLACE FUNCTION public.delete_finished_group_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'pending' THEN
    DELETE FROM public.group_invites WHERE id = NEW.id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_finished_group_invite ON public.group_invites;
CREATE TRIGGER trg_delete_finished_group_invite
AFTER UPDATE OF status ON public.group_invites
FOR EACH ROW
WHEN (NEW.status <> 'pending')
EXECUTE FUNCTION public.delete_finished_group_invite();

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
BEGIN
  SELECT public.cleanup_expired_auth_otps() INTO v_otp_deleted;
  SELECT public.cleanup_stale_group_invites() INTO v_invite_deleted;
  SELECT public.cleanup_stale_connections() INTO v_connection_deleted;

  DELETE FROM public.auth_device_sessions
  WHERE active = false
     OR revoked_at IS NOT NULL;

  GET DIAGNOSTICS v_session_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'auth_otps_deleted', v_otp_deleted,
    'auth_device_sessions_deleted', v_session_deleted,
    'group_invites_deleted', v_invite_deleted,
    'connections_deleted', v_connection_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ephemeral_auth_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ephemeral_auth_data() TO service_role;

-- One-time cleanup when this migration is applied.
SELECT public.cleanup_ephemeral_auth_data();
