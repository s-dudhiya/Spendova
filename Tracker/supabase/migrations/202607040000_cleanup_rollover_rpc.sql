-- ============================================================
-- Rollover Concurrency Fix & Cleanup
-- Drops stale functions and creates a race-condition-safe automated rollover
-- ============================================================

-- 1. Drop the old function with the 6 arguments that references the non-existent table
DROP FUNCTION IF EXISTS public.perform_ledger_monthly_rollover(
  UUID,
  SMALLINT,
  SMALLINT,
  NUMERIC,
  NUMERIC,
  NUMERIC
);

-- 2. Drop the 5-argument version which will be replaced by the automated one
DROP FUNCTION IF EXISTS public.perform_ledger_monthly_rollover(
  UUID,
  SMALLINT,
  SMALLINT,
  NUMERIC,
  NUMERIC
);

-- 3. Create the robust, automated rollover function
CREATE OR REPLACE FUNCTION public.auto_perform_monthly_closures(
  p_ledger_id UUID,
  p_month SMALLINT,
  p_year SMALLINT,
  p_saved_amount NUMERIC,
  p_deficit NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- We don't restrict to just owner/admin because it's automated. Anyone viewing can trigger the cleanup.
  IF NOT is_ledger_member(p_ledger_id) THEN
    RETURN jsonb_build_object('error', 'Only members can trigger rollover.');
  END IF;

  -- Attempt to insert the closure record. 
  -- The UNIQUE constraint (ledger_id, month, year) ensures only ONE client's request succeeds.
  INSERT INTO ledger_monthly_closures (ledger_id, month, year, saved_amount, deficit, rolled_over_at)
  VALUES (p_ledger_id, p_month, p_year, p_saved_amount, p_deficit, now())
  ON CONFLICT (ledger_id, month, year) DO NOTHING;

  -- IF FOUND is true ONLY if the row was actually inserted (i.e. first time rolling over)
  IF FOUND THEN
      -- Safely increment savings in a concurrent-friendly way
      IF p_saved_amount > 0 THEN
         UPDATE ledgers
         SET total_savings = total_savings + p_saved_amount,
             updated_at = now()
         WHERE id = p_ledger_id;
      END IF;

      INSERT INTO ledger_activity (ledger_id, actor_id, action, entity_type, metadata)
      VALUES (
        p_ledger_id, auth.uid(), 'monthly_rollover', 'budget',
        jsonb_build_object('month', p_month, 'year', p_year, 'saved', p_saved_amount, 'deficit', p_deficit, 'automated', true)
      );
      
      RETURN jsonb_build_object('success', true, 'rolled_over', true);
  END IF;

  -- If it wasn't inserted, another client beat us to it, meaning it's already safely rolled over.
  RETURN jsonb_build_object('success', true, 'rolled_over', false);
END;
$$;

-- 4. Safe Budget Addition with Savings Funding
CREATE OR REPLACE FUNCTION public.add_ledger_budget(
  p_ledger_id UUID,
  p_amount NUMERIC,
  p_note TEXT,
  p_use_savings BOOLEAN,
  p_month SMALLINT,
  p_year SMALLINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_available_savings NUMERIC;
  v_savings_to_use NUMERIC := 0;
  v_remaining_addition NUMERIC;
BEGIN
  IF NOT is_ledger_owner_or_admin(p_ledger_id) THEN
    RETURN jsonb_build_object('error', 'Only owners or admins can add budgets.');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Amount must be greater than zero.');
  END IF;

  -- Lock the ledger row for safe deduction
  SELECT total_savings INTO v_available_savings FROM ledgers WHERE id = p_ledger_id FOR UPDATE;

  IF p_use_savings AND v_available_savings > 0 THEN
    -- Use as much savings as possible up to the requested budget amount
    v_savings_to_use := LEAST(v_available_savings, p_amount);
    
    -- Deduct from the ledger's savings pool
    UPDATE ledgers SET total_savings = total_savings - v_savings_to_use, updated_at = now() WHERE id = p_ledger_id;

    -- Log the savings-derived budget addition
    INSERT INTO ledger_budget_additions (ledger_id, amount, note, added_by, month, year, is_savings_rollover)
    VALUES (p_ledger_id, v_savings_to_use, 'Funded from savings', auth.uid(), p_month, p_year, true);
  END IF;

  v_remaining_addition := p_amount - v_savings_to_use;

  IF v_remaining_addition > 0 THEN
    -- Log the remaining explicit addition
    INSERT INTO ledger_budget_additions (ledger_id, amount, note, added_by, month, year, is_savings_rollover)
    VALUES (p_ledger_id, v_remaining_addition, p_note, auth.uid(), p_month, p_year, false);
  END IF;
  
  RETURN jsonb_build_object('success', true, 'savings_used', v_savings_to_use, 'addition', v_remaining_addition);
END;
$$;

-- 5. Notify PostgREST to reload the schema cache so Supabase API picks up the changes instantly
NOTIFY pgrst, 'reload schema';
