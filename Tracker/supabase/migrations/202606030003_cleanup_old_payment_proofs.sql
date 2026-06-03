-- Remove payment proof screenshots after the retention window without deleting settlements.

CREATE OR REPLACE FUNCTION public.cleanup_old_payment_proofs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_paths text[] := ARRAY[]::text[];
  v_storage_deleted integer := 0;
  v_settlements_updated integer := 0;
BEGIN
  SELECT COALESCE(array_agg(payment_proof_path), ARRAY[]::text[])
  INTO v_paths
  FROM public.split_settlements
  WHERE payment_proof_path IS NOT NULL
    AND payment_proof_deleted_at IS NULL
    AND COALESCE(payment_proof_uploaded_at, created_at) <= now() - interval '90 days';

  IF array_length(v_paths, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'payment_proof_files_deleted', 0,
      'payment_proof_rows_cleared', 0
    );
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = 'payment-proofs'
    AND name = ANY(v_paths);

  GET DIAGNOSTICS v_storage_deleted = ROW_COUNT;

  UPDATE public.split_settlements
  SET payment_proof_path = NULL,
      payment_proof_uploaded_at = NULL,
      payment_proof_deleted_at = now()
  WHERE payment_proof_path = ANY(v_paths);

  GET DIAGNOSTICS v_settlements_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'payment_proof_files_deleted', v_storage_deleted,
    'payment_proof_rows_cleared', v_settlements_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_payment_proofs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_payment_proofs() TO service_role;

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
  v_payment_proof_cleanup jsonb := '{}'::jsonb;
BEGIN
  SELECT public.cleanup_expired_auth_otps() INTO v_otp_deleted;
  SELECT public.cleanup_stale_group_invites() INTO v_invite_deleted;
  SELECT public.cleanup_stale_connections() INTO v_connection_deleted;
  SELECT public.cleanup_old_notifications() INTO v_notification_deleted;
  SELECT public.cleanup_old_payment_proofs() INTO v_payment_proof_cleanup;

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
    'payment_proofs', v_payment_proof_cleanup
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ephemeral_auth_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ephemeral_auth_data() TO service_role;

-- Apply once immediately when this migration is deployed.
SELECT public.cleanup_old_payment_proofs();
