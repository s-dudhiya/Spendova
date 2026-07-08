-- Update Ledger Ephemeral Data Cleanup Logic
-- Keeps up to 10 activities per ledger, and deletes activities older than 10 days.

CREATE OR REPLACE FUNCTION public.cleanup_ledger_activities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  -- First, delete any activity older than 10 days
  DELETE FROM public.ledger_activity
  WHERE created_at < now() - interval '10 days';

  -- Next, strictly keep only the latest 10 activities per ledger
  DELETE FROM public.ledger_activity
  WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY ledger_id ORDER BY created_at DESC) as rn
      FROM public.ledger_activity
    ) t
    WHERE t.rn > 10
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ledger_activities() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ledger_activities() TO service_role;

-- Apply once immediately when this migration is deployed to clean up existing data
SELECT public.cleanup_ledger_ephemeral_data();
