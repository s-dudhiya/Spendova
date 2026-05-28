-- Make settlement status immutable per split/expense lifecycle.
-- Current balances may recalculate, but historical paid state is stored on
-- expense_splits.amount_paid and settlement application rows.

ALTER TABLE public.expense_splits
ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.split_settlement_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.split_settlements(id) ON DELETE CASCADE,
  split_id uuid NOT NULL REFERENCES public.expense_splits(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_split_settlement_applications_settlement_id
ON public.split_settlement_applications(settlement_id);

CREATE INDEX IF NOT EXISTS idx_split_settlement_applications_split_id
ON public.split_settlement_applications(split_id);

UPDATE public.expense_splits
SET amount_paid = amount_owed
WHERE COALESCE(has_paid, false) = true
  AND COALESCE(amount_paid, 0) < amount_owed;

CREATE OR REPLACE FUNCTION public.mark_splits_paid_when_expense_cleared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cleared' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.expense_splits
    SET amount_paid = amount_owed,
        has_paid = true,
        updated_at = now()
    WHERE expense_id = NEW.id
      AND COALESCE(amount_paid, 0) < amount_owed;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_split_settlement(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_group_id uuid DEFAULT NULL,
  p_expense_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_remaining numeric := p_amount;
  v_split record;
  v_apply numeric;
  v_settlement_id uuid;
  v_forward_open numeric := 0;
  v_reverse_open numeric := 0;
  v_is_full_net_settlement boolean := false;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;
  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Settlement payer and receiver must be different';
  END IF;
  IF v_auth <> p_from_user_id AND v_auth <> p_to_user_id THEN
    RAISE EXCEPTION 'Only involved users can record this settlement';
  END IF;

  INSERT INTO public.split_settlements (from_user_id, to_user_id, amount, group_id, expense_id, note)
  VALUES (p_from_user_id, p_to_user_id, p_amount, p_group_id, p_expense_id, p_note)
  RETURNING id INTO v_settlement_id;

  IF p_expense_id IS NULL THEN
    SELECT COALESCE(SUM(es.amount_owed - COALESCE(es.amount_paid, 0)), 0) INTO v_forward_open
    FROM public.expense_splits es
    JOIN public.expenses e ON e.id = es.expense_id
    WHERE es.user_id = p_from_user_id
      AND e.paid_by = p_to_user_id
      AND ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
      AND COALESCE(es.amount_paid, 0) < es.amount_owed;

    SELECT COALESCE(SUM(es.amount_owed - COALESCE(es.amount_paid, 0)), 0) INTO v_reverse_open
    FROM public.expense_splits es
    JOIN public.expenses e ON e.id = es.expense_id
    WHERE es.user_id = p_to_user_id
      AND e.paid_by = p_from_user_id
      AND ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
      AND COALESCE(es.amount_paid, 0) < es.amount_owed;

    v_is_full_net_settlement :=
      v_forward_open > 0
      AND v_forward_open >= v_reverse_open
      AND ABS(p_amount - (v_forward_open - v_reverse_open)) <= 0.01;

    IF v_is_full_net_settlement THEN
      FOR v_split IN
        SELECT es.id, es.amount_owed, COALESCE(es.amount_paid, 0) AS amount_paid
        FROM public.expense_splits es
        JOIN public.expenses e ON e.id = es.expense_id
        WHERE ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
          AND (
            (es.user_id = p_from_user_id AND e.paid_by = p_to_user_id)
            OR
            (es.user_id = p_to_user_id AND e.paid_by = p_from_user_id)
          )
          AND COALESCE(es.amount_paid, 0) < es.amount_owed
        ORDER BY e.created_at ASC, es.created_at ASC
      LOOP
        v_apply := v_split.amount_owed - v_split.amount_paid;

        UPDATE public.expense_splits
        SET amount_paid = amount_owed,
            has_paid = true,
            updated_at = now()
        WHERE id = v_split.id;

        INSERT INTO public.split_settlement_applications (settlement_id, split_id, amount)
        VALUES (v_settlement_id, v_split.id, v_apply);
      END LOOP;

      UPDATE public.expenses e
      SET status = 'cleared',
          updated_at = now()
      WHERE ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
        AND EXISTS (
          SELECT 1
          FROM public.split_settlement_applications app
          JOIN public.expense_splits es ON es.id = app.split_id
          WHERE app.settlement_id = v_settlement_id
            AND es.expense_id = e.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.expense_splits es
          WHERE es.expense_id = e.id
            AND COALESCE(es.amount_paid, 0) < es.amount_owed
        );

      RETURN v_settlement_id;
    END IF;
  END IF;

  FOR v_split IN
    SELECT es.id, es.amount_owed, COALESCE(es.amount_paid, 0) AS amount_paid
    FROM public.expense_splits es
    JOIN public.expenses e ON e.id = es.expense_id
    WHERE es.user_id = p_from_user_id
      AND e.paid_by = p_to_user_id
      AND ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
      AND (p_expense_id IS NULL OR e.id = p_expense_id)
      AND COALESCE(es.amount_paid, 0) < es.amount_owed
    ORDER BY e.created_at ASC, es.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_split.amount_owed - v_split.amount_paid);

    UPDATE public.expense_splits
    SET amount_paid = COALESCE(amount_paid, 0) + v_apply,
        has_paid = COALESCE(amount_paid, 0) + v_apply >= amount_owed,
        updated_at = now()
    WHERE id = v_split.id;

    INSERT INTO public.split_settlement_applications (settlement_id, split_id, amount)
    VALUES (v_settlement_id, v_split.id, v_apply);

    v_remaining := v_remaining - v_apply;
  END LOOP;

  UPDATE public.expenses e
  SET status = 'cleared',
      updated_at = now()
  WHERE (p_expense_id IS NULL OR e.id = p_expense_id)
    AND ((p_group_id IS NULL AND e.group_id IS NULL) OR e.group_id = p_group_id)
    AND EXISTS (
      SELECT 1
      FROM public.split_settlement_applications app
      JOIN public.expense_splits es ON es.id = app.split_id
      WHERE app.settlement_id = v_settlement_id
        AND es.expense_id = e.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_splits es
      WHERE es.expense_id = e.id
        AND COALESCE(es.amount_paid, 0) < es.amount_owed
    );

  RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_split_settlement(p_settlement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_settlement public.split_settlements%ROWTYPE;
  v_split record;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_settlement
  FROM public.split_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found';
  END IF;
  IF v_auth <> v_settlement.from_user_id AND v_auth <> v_settlement.to_user_id THEN
    RAISE EXCEPTION 'Only involved users can delete this settlement';
  END IF;

  FOR v_split IN
    SELECT app.split_id AS id, app.amount
    FROM public.split_settlement_applications app
    WHERE app.settlement_id = p_settlement_id
  LOOP
    UPDATE public.expense_splits
    SET amount_paid = GREATEST(COALESCE(amount_paid, 0) - v_split.amount, 0),
        has_paid = GREATEST(COALESCE(amount_paid, 0) - v_split.amount, 0) >= amount_owed,
        updated_at = now()
    WHERE id = v_split.id;
  END LOOP;

  UPDATE public.expenses e
  SET status = 'pending',
      updated_at = now()
  WHERE EXISTS (
    SELECT 1
    FROM public.split_settlement_applications app
    JOIN public.expense_splits es ON es.id = app.split_id
    WHERE app.settlement_id = p_settlement_id
      AND es.expense_id = e.id
      AND COALESCE(es.amount_paid, 0) < es.amount_owed
  );

  DELETE FROM public.split_settlements
  WHERE id = p_settlement_id;

  RETURN true;
END;
$$;
