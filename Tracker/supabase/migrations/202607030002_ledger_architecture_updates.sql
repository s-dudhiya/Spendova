-- ============================================================
-- Budget Ledger - Architecture Updates
-- Implements complete syncing, rollover tracking, and derived value schema
-- ============================================================

-- 1. Rename ledger_monthly_budgets to ledger_monthly_closures to accurately reflect its purpose
ALTER TABLE public.ledger_monthly_budgets RENAME TO ledger_monthly_closures;

-- 2. Drop redundant calculated columns and add deficit
ALTER TABLE public.ledger_monthly_closures
  DROP COLUMN IF EXISTS budget_amount,
  DROP COLUMN IF EXISTS paid_amount,
  ADD COLUMN IF NOT EXISTS deficit NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 3. Add linked_expense_id to ledger_expenses for Personal Ledger syncing
ALTER TABLE public.ledger_expenses
  ADD COLUMN IF NOT EXISTS linked_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL;

-- 4. Add is_savings_rollover flag to budget additions
ALTER TABLE public.ledger_budget_additions
  ADD COLUMN IF NOT EXISTS is_savings_rollover BOOLEAN NOT NULL DEFAULT false;

-- 5. Update policies for ledger_monthly_closures (rename policy targets)
DROP POLICY IF EXISTS "ledger_monthly_budgets_select" ON public.ledger_monthly_closures;
DROP POLICY IF EXISTS "ledger_monthly_budgets_insert" ON public.ledger_monthly_closures;
DROP POLICY IF EXISTS "ledger_monthly_budgets_update" ON public.ledger_monthly_closures;

CREATE POLICY "ledger_monthly_closures_select" ON public.ledger_monthly_closures FOR SELECT TO authenticated
  USING (is_ledger_member(ledger_id));

CREATE POLICY "ledger_monthly_closures_insert" ON public.ledger_monthly_closures FOR INSERT TO authenticated
  WITH CHECK (is_ledger_owner_or_admin(ledger_id));

CREATE POLICY "ledger_monthly_closures_update" ON public.ledger_monthly_closures FOR UPDATE TO authenticated
  USING (is_ledger_owner_or_admin(ledger_id))
  WITH CHECK (is_ledger_owner_or_admin(ledger_id));

-- 6. Update the RPC perform_ledger_monthly_rollover to match new schema
CREATE OR REPLACE FUNCTION public.perform_ledger_monthly_rollover(
  p_ledger_id UUID,
  p_from_month SMALLINT,
  p_from_year SMALLINT,
  p_saved_amount NUMERIC,
  p_deficit NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_ledger_owner_or_admin(p_ledger_id) THEN
    RETURN jsonb_build_object('error', 'Only the ledger owner can perform a monthly rollover.');
  END IF;

  -- Upsert monthly history record
  INSERT INTO ledger_monthly_closures (ledger_id, month, year, saved_amount, deficit, rolled_over_at)
  VALUES (p_ledger_id, p_from_month, p_from_year, p_saved_amount, p_deficit, now())
  ON CONFLICT (ledger_id, month, year) DO UPDATE SET
    saved_amount  = EXCLUDED.saved_amount,
    deficit       = EXCLUDED.deficit,
    rolled_over_at = now();

  INSERT INTO ledger_activity (ledger_id, actor_id, action, entity_type, metadata)
  VALUES (
    p_ledger_id, auth.uid(), 'monthly_rollover', 'budget',
    jsonb_build_object('month', p_from_month, 'year', p_from_year, 'saved', p_saved_amount, 'deficit', p_deficit)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
