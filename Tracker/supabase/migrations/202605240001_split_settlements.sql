-- Settlement history for Split tab. Settlements reduce outstanding balances
-- without creating fake expense rows.

CREATE TABLE IF NOT EXISTS public.split_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT split_settlements_no_self_payment CHECK (from_user_id <> to_user_id)
);

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
