-- =====================================================================
-- Universal CRUD: Allow all involved users to edit/delete any expense
-- =====================================================================

-- 1. DROP old restrictive expense UPDATE/DELETE policies
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;

-- 2. New expense UPDATE policy: creator OR payer OR split participant OR group member
CREATE POLICY "Involved users can update expenses"
ON public.expenses FOR UPDATE
USING (
  auth.uid() = user_id
  OR auth.uid() = paid_by
  OR EXISTS (
    SELECT 1 FROM public.expense_splits
    WHERE expense_splits.expense_id = expenses.id
    AND expense_splits.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = expenses.group_id
    AND group_members.user_id = auth.uid()
  )
);

-- 3. New expense DELETE policy: same as UPDATE
CREATE POLICY "Involved users can delete expenses"
ON public.expenses FOR DELETE
USING (
  auth.uid() = user_id
  OR auth.uid() = paid_by
  OR EXISTS (
    SELECT 1 FROM public.expense_splits
    WHERE expense_splits.expense_id = expenses.id
    AND expense_splits.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = expenses.group_id
    AND group_members.user_id = auth.uid()
  )
);

-- 4. expense_splits UPDATE: allow the split user and any group member (not just expense creator)
DROP POLICY IF EXISTS "Users can update their splits (pay) or splits for their expenses" ON public.expense_splits;

CREATE POLICY "Involved users can update splits"
ON public.expense_splits FOR UPDATE
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.expenses
    WHERE expenses.id = expense_splits.expense_id
    AND (expenses.user_id = auth.uid() OR expenses.paid_by = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.group_members gm ON gm.group_id = e.group_id
    WHERE e.id = expense_splits.expense_id
    AND gm.user_id = auth.uid()
  )
);

-- 5. expense_splits DELETE: allow expense creator/payer/group member to remove splits
DROP POLICY IF EXISTS "Users can delete splits for expenses they created" ON public.expense_splits;

CREATE POLICY "Involved users can delete splits"
ON public.expense_splits FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.expenses
    WHERE expenses.id = expense_splits.expense_id
    AND (expenses.user_id = auth.uid() OR expenses.paid_by = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.group_members gm ON gm.group_id = e.group_id
    WHERE e.id = expense_splits.expense_id
    AND gm.user_id = auth.uid()
  )
);

-- 6. Groups UPDATE: any group member can rename/edit (not just creator)
DROP POLICY IF EXISTS "Group creators can update their groups" ON public.groups;

CREATE POLICY "Group members can update group"
ON public.groups FOR UPDATE
USING (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = groups.id
    AND group_members.user_id = auth.uid()
  )
);

-- 7. Group members INSERT: any existing member can add new members
DROP POLICY IF EXISTS "Group creators or the user themselves can insert members" ON public.group_members;

CREATE POLICY "Group members can add new members"
ON public.group_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members existing
    WHERE existing.group_id = group_members.group_id
    AND existing.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.groups
    WHERE groups.id = group_members.group_id
    AND groups.created_by = auth.uid()
  )
);

-- 8. expense_splits INSERT: allow payer or any group member to add splits
DROP POLICY IF EXISTS "Users can insert splits for expenses they created" ON public.expense_splits;

CREATE POLICY "Involved users can insert splits"
ON public.expense_splits FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expenses
    WHERE expenses.id = expense_splits.expense_id
    AND (expenses.user_id = auth.uid() OR expenses.paid_by = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.group_members gm ON gm.group_id = e.group_id
    WHERE e.id = expense_splits.expense_id
    AND gm.user_id = auth.uid()
  )
);
