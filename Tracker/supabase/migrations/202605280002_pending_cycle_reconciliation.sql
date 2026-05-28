-- Pending split rows should keep behaving like a running ledger cycle.
-- When opposite open balances cancel each other out, freeze only that active
-- pair/group cycle. Already-settled rows are ignored forever.

CREATE OR REPLACE FUNCTION public.reconcile_pending_split_cycle(
  p_group_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a_owes_b numeric := 0;
  v_b_owes_a numeric := 0;
BEGIN
  IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(es.amount_owed - COALESCE(es.amount_paid, 0)), 0)
  INTO v_a_owes_b
  FROM public.expense_splits es
  JOIN public.expenses e ON e.id = es.expense_id
  WHERE es.user_id = p_user_a
    AND e.paid_by = p_user_b
    AND ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
    AND COALESCE(es.amount_paid, 0) < es.amount_owed;

  SELECT COALESCE(SUM(es.amount_owed - COALESCE(es.amount_paid, 0)), 0)
  INTO v_b_owes_a
  FROM public.expense_splits es
  JOIN public.expenses e ON e.id = es.expense_id
  WHERE es.user_id = p_user_b
    AND e.paid_by = p_user_a
    AND ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
    AND COALESCE(es.amount_paid, 0) < es.amount_owed;

  IF v_a_owes_b <= 0 OR v_b_owes_a <= 0 OR ABS(v_a_owes_b - v_b_owes_a) > 0.01 THEN
    RETURN;
  END IF;

  UPDATE public.expense_splits es
  SET amount_paid = es.amount_owed,
      has_paid = true,
      updated_at = now()
  FROM public.expenses e
  WHERE e.id = es.expense_id
    AND ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
    AND COALESCE(es.amount_paid, 0) < es.amount_owed
    AND (
      (es.user_id = p_user_a AND e.paid_by = p_user_b)
      OR
      (es.user_id = p_user_b AND e.paid_by = p_user_a)
    );

  UPDATE public.expenses e
  SET status = 'cleared',
      updated_at = now()
  WHERE ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
    AND EXISTS (
      SELECT 1
      FROM public.expense_splits es
      WHERE es.expense_id = e.id
        AND (
          (es.user_id = p_user_a AND e.paid_by = p_user_b)
          OR
          (es.user_id = p_user_b AND e.paid_by = p_user_a)
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_splits es
      WHERE es.expense_id = e.id
        AND COALESCE(es.amount_paid, 0) < es.amount_owed
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_pending_split_cycle_for_split()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense record;
BEGIN
  SELECT paid_by, group_id
  INTO v_expense
  FROM public.expenses
  WHERE id = NEW.expense_id;

  IF NOT FOUND OR v_expense.paid_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.reconcile_pending_split_cycle(v_expense.group_id, NEW.user_id, v_expense.paid_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_pending_split_cycle ON public.expense_splits;
CREATE TRIGGER trg_reconcile_pending_split_cycle
AFTER INSERT OR UPDATE OF expense_id, user_id, amount_owed
ON public.expense_splits
FOR EACH ROW
WHEN (COALESCE(NEW.amount_paid, 0) < NEW.amount_owed)
EXECUTE FUNCTION public.reconcile_pending_split_cycle_for_split();
