-- First-class settlements, partial split payments, and atomic invite acceptance.

CREATE TABLE IF NOT EXISTS public.split_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  from_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT split_settlements_no_self_payment CHECK (from_user_id <> to_user_id)
);

ALTER TABLE public.split_settlements
ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

ALTER TABLE public.expense_splits
ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

UPDATE public.expense_splits
SET amount_paid = amount_owed
WHERE COALESCE(has_paid, false) = true
  AND COALESCE(amount_paid, 0) = 0;

ALTER TABLE public.split_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view involved settlements" ON public.split_settlements;
CREATE POLICY "Users can view involved settlements"
ON public.split_settlements FOR SELECT
USING (
  auth.uid() = from_user_id
  OR auth.uid() = to_user_id
  OR EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = split_settlements.group_id
      AND gm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id = split_settlements.expense_id
      AND (e.user_id = auth.uid() OR e.paid_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can insert involved settlements" ON public.split_settlements;
CREATE POLICY "Users can insert involved settlements"
ON public.split_settlements FOR INSERT
WITH CHECK (
  auth.uid() = from_user_id
  OR auth.uid() = to_user_id
  OR EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = split_settlements.group_id
      AND gm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update involved settlements" ON public.split_settlements;
CREATE POLICY "Users can update involved settlements"
ON public.split_settlements FOR UPDATE
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id)
WITH CHECK (auth.uid() = from_user_id OR auth.uid() = to_user_id);

DROP POLICY IF EXISTS "Users can delete involved settlements" ON public.split_settlements;
CREATE POLICY "Users can delete involved settlements"
ON public.split_settlements FOR DELETE
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

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

  FOR v_split IN
    SELECT es.id, es.amount_owed, COALESCE(es.amount_paid, 0) AS amount_paid
    FROM public.expense_splits es
    JOIN public.expenses e ON e.id = es.expense_id
    WHERE es.user_id = p_from_user_id
      AND e.paid_by = p_to_user_id
      AND (p_group_id IS NULL OR e.group_id = p_group_id)
      AND (p_expense_id IS NULL OR e.id = p_expense_id)
      AND COALESCE(es.amount_paid, 0) < es.amount_owed
    ORDER BY e.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_split.amount_owed - v_split.amount_paid);
    UPDATE public.expense_splits
    SET amount_paid = COALESCE(amount_paid, 0) + v_apply,
        has_paid = COALESCE(amount_paid, 0) + v_apply >= amount_owed,
        updated_at = now()
    WHERE id = v_split.id;
    v_remaining := v_remaining - v_apply;
  END LOOP;

  UPDATE public.expenses e
  SET status = 'cleared',
      updated_at = now()
  WHERE (p_expense_id IS NOT NULL AND e.id = p_expense_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.expense_splits es
      WHERE es.expense_id = e.id
        AND COALESCE(es.amount_paid, 0) < es.amount_owed
    );

  RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_group_invite(invite_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_invite public.group_invites%ROWTYPE;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_invite
  FROM public.group_invites
  WHERE token = invite_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is already %', v_invite.status;
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (v_invite.group_id, v_auth)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  IF v_invite.invited_by IS NOT NULL AND v_invite.invited_by <> v_auth THEN
    INSERT INTO public.connections (requester_id, receiver_id, status)
    VALUES (v_invite.invited_by, v_auth, 'accepted')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.group_invites
  SET status = 'accepted'
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'group_id', v_invite.group_id);
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
  v_remaining numeric;
  v_split record;
  v_reverse numeric;
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

  v_remaining := v_settlement.amount;

  FOR v_split IN
    SELECT es.id, COALESCE(es.amount_paid, 0) AS amount_paid, es.amount_owed
    FROM public.expense_splits es
    JOIN public.expenses e ON e.id = es.expense_id
    WHERE es.user_id = v_settlement.from_user_id
      AND e.paid_by = v_settlement.to_user_id
      AND (v_settlement.group_id IS NULL OR e.group_id = v_settlement.group_id)
      AND (v_settlement.expense_id IS NULL OR e.id = v_settlement.expense_id)
      AND COALESCE(es.amount_paid, 0) > 0
    ORDER BY e.created_at DESC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_reverse := LEAST(v_remaining, v_split.amount_paid);
    UPDATE public.expense_splits
    SET amount_paid = GREATEST(COALESCE(amount_paid, 0) - v_reverse, 0),
        has_paid = GREATEST(COALESCE(amount_paid, 0) - v_reverse, 0) >= amount_owed,
        updated_at = now()
    WHERE id = v_split.id;
    v_remaining := v_remaining - v_reverse;
  END LOOP;

  IF v_settlement.expense_id IS NOT NULL THEN
    UPDATE public.expenses
    SET status = 'pending',
        updated_at = now()
    WHERE id = v_settlement.expense_id
      AND EXISTS (
        SELECT 1
        FROM public.expense_splits es
        WHERE es.expense_id = v_settlement.expense_id
          AND COALESCE(es.amount_paid, 0) < es.amount_owed
      );
  END IF;

  DELETE FROM public.split_settlements
  WHERE id = p_settlement_id;

  RETURN true;
END;
$$;
