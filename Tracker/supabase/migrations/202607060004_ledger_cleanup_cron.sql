-- Cleanup Ledger Ephemeral Data

CREATE OR REPLACE FUNCTION public.cleanup_stale_ledger_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.ledger_invites
  WHERE expires_at <= now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_ledger_invites() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_ledger_invites() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_ledger_activities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  -- First, delete any activity older than 5 days
  DELETE FROM public.ledger_activity
  WHERE created_at < now() - interval '5 days';

  -- Next, strictly keep only the latest 5 activities per ledger
  DELETE FROM public.ledger_activity
  WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY ledger_id ORDER BY created_at DESC) as rn
      FROM public.ledger_activity
    ) t
    WHERE t.rn > 5
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ledger_activities() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ledger_activities() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_ledger_ephemeral_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invites_deleted integer := 0;
  v_activities_deleted integer := 0;
BEGIN
  SELECT public.cleanup_stale_ledger_invites() INTO v_invites_deleted;
  SELECT public.cleanup_ledger_activities() INTO v_activities_deleted;

  RETURN jsonb_build_object(
    'ledger_invites_deleted', v_invites_deleted,
    'ledger_activities_deleted', v_activities_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ledger_ephemeral_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ledger_ephemeral_data() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'spendova-cleanup-ledger-data'
  ) THEN
    PERFORM cron.unschedule('spendova-cleanup-ledger-data');
  END IF;

  PERFORM cron.schedule(
    'spendova-cleanup-ledger-data',
    '0 * * * *',
    'SELECT public.cleanup_ledger_ephemeral_data();'
  );
END $$;

-- Apply once immediately when this migration is deployed.
SELECT public.cleanup_ledger_ephemeral_data();
