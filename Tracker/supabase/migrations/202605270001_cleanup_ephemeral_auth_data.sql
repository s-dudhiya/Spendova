-- Keep temporary auth data small and private.

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;

-- auth_otps must stay service-role only. No browser/client policies.
DROP POLICY IF EXISTS "Users can view auth otps" ON public.auth_otps;
DROP POLICY IF EXISTS "Users can insert auth otps" ON public.auth_otps;
DROP POLICY IF EXISTS "Users can update auth otps" ON public.auth_otps;
DROP POLICY IF EXISTS "Users can delete auth otps" ON public.auth_otps;

CREATE INDEX IF NOT EXISTS auth_otps_reset_token_idx
  ON public.auth_otps (reset_token)
  WHERE reset_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cleanup_expired_auth_otps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.auth_otps
  WHERE (reset_token IS NULL AND expires_at <= now())
     OR (reset_token_expires_at IS NOT NULL AND reset_token_expires_at <= now())
     OR (used = true AND reset_token IS NULL)
     OR created_at <= now() - interval '1 day';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_auth_otps() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_auth_otps() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_ephemeral_auth_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_deleted integer := 0;
  v_session_deleted integer := 0;
BEGIN
  SELECT public.cleanup_expired_auth_otps() INTO v_otp_deleted;

  DELETE FROM public.auth_device_sessions
  WHERE active = false
     OR revoked_at IS NOT NULL;

  GET DIAGNOSTICS v_session_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'auth_otps_deleted', v_otp_deleted,
    'auth_device_sessions_deleted', v_session_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ephemeral_auth_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ephemeral_auth_data() TO service_role;

-- One-time cleanup when this migration is applied.
SELECT public.cleanup_ephemeral_auth_data();
