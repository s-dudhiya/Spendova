-- ============================================================
-- Midnight Autonomous Ledger Rollover Setup
-- Forces a monthly sweep without waiting for user app opens
-- ============================================================

-- Ensure the extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Create the master sweep procedure
CREATE OR REPLACE FUNCTION public.cron_rollover_all_ledgers()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ledger RECORD;
  v_month SMALLINT;
  v_year SMALLINT;
  v_budget NUMERIC;
  v_paid NUMERIC;
  v_saved NUMERIC;
BEGIN
  -- We roll over the PREVIOUS month's data relative to the current timestamp.
  -- This runs on the 1st day of the new month instantly locking down the past.
  v_month := EXTRACT(MONTH FROM now() - interval '1 month');
  v_year := EXTRACT(YEAR FROM now() - interval '1 month');

  FOR v_ledger IN SELECT id FROM ledgers WHERE budget_type = 'monthly' AND is_archived = false LOOP
    -- Compute total accumulated budget for that specific month
    SELECT COALESCE(SUM(amount), 0) INTO v_budget 
    FROM ledger_budget_additions 
    WHERE ledger_id = v_ledger.id AND month = v_month AND year = v_year;
    
    -- Compute total paid expenses for that month
    SELECT COALESCE(SUM(amount), 0) INTO v_paid 
    FROM ledger_expenses 
    WHERE ledger_id = v_ledger.id AND month = v_month AND year = v_year AND status = 'paid';
    
    -- Safety floor zero
    v_saved := GREATEST(v_budget - v_paid, 0);

    -- Call our safe atomic closure function
    PERFORM public.auto_perform_monthly_closures(
      v_ledger.id,
      v_month,
      v_year,
      v_saved,
      0
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('spendova-midnight-ledger-rollover');
EXCEPTION WHEN others THEN
  -- Skip if it didn't exist
END
$$;

-- Schedule the sweep to run on the 1st of every month at 00:05 (5 minutes buffer past midnight)
SELECT cron.schedule(
  'spendova-midnight-ledger-rollover',
  '5 0 1 * *', 
  'SELECT public.cron_rollover_all_ledgers();'
);
