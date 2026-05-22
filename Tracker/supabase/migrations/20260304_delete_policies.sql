-- =========================================================================
-- THE ULTIMATE FREEDOM POLICY SCRIPT FOR GROUPS, EXPENSES, AND FRIENDS
-- =========================================================================

-- 1. GROUPS: Any member can Update or Delete the group
DROP POLICY IF EXISTS "Group members can update group" ON public.groups;
DROP POLICY IF EXISTS "Creators can delete groups" ON public.groups;
DROP POLICY IF EXISTS "Any member can delete groups" ON public.groups;

CREATE POLICY "Any member can update group" ON public.groups FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = groups.id AND user_id = auth.uid()));

CREATE POLICY "Any member can delete group" ON public.groups FOR DELETE
USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = groups.id AND user_id = auth.uid()));

-- 2. GROUP MEMBERS: Any member can Insert or Delete anyone else
DROP POLICY IF EXISTS "Group members can add new members" ON public.group_members;
DROP POLICY IF EXISTS "Members can leave or creator can remove" ON public.group_members;
DROP POLICY IF EXISTS "Members can leave or remove others" ON public.group_members;

CREATE POLICY "Any member can insert members" ON public.group_members FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.group_members existing WHERE existing.group_id = group_members.group_id AND existing.user_id = auth.uid()));

CREATE POLICY "Any member can delete members" ON public.group_members FOR DELETE
USING (EXISTS (SELECT 1 FROM public.group_members existing WHERE existing.group_id = group_members.group_id AND existing.user_id = auth.uid()));


-- 3. EXPENSES: Any involved user (creator, payer, participant, or ANY group member) can Update or Delete
DROP POLICY IF EXISTS "Involved users can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Involved users can delete expenses" ON public.expenses;

CREATE POLICY "Any involved user or group member can update expenses" ON public.expenses FOR UPDATE
USING (
  auth.uid() = user_id OR auth.uid() = paid_by
  OR EXISTS (SELECT 1 FROM public.expense_splits WHERE expense_id = expenses.id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = expenses.group_id AND user_id = auth.uid())
);

CREATE POLICY "Any involved user or group member can delete expenses" ON public.expenses FOR DELETE
USING (
  auth.uid() = user_id OR auth.uid() = paid_by
  OR EXISTS (SELECT 1 FROM public.expense_splits WHERE expense_id = expenses.id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = expenses.group_id AND user_id = auth.uid())
);


-- 4. EXPENSE SPLITS: Any involved user or group member can Insert, Update, or Delete
DROP POLICY IF EXISTS "Involved users can insert splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Involved users can update splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Involved users can delete splits" ON public.expense_splits;

CREATE POLICY "Any involved user or group member can insert splits" ON public.expense_splits FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_splits.expense_id AND (user_id = auth.uid() OR paid_by = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.expenses e JOIN public.group_members gm ON gm.group_id = e.group_id WHERE e.id = expense_splits.expense_id AND gm.user_id = auth.uid())
);

CREATE POLICY "Any involved user or group member can update splits" ON public.expense_splits FOR UPDATE
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_splits.expense_id AND (user_id = auth.uid() OR paid_by = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.expenses e JOIN public.group_members gm ON gm.group_id = e.group_id WHERE e.id = expense_splits.expense_id AND gm.user_id = auth.uid())
);

CREATE POLICY "Any involved user or group member can delete splits" ON public.expense_splits FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_splits.expense_id AND (user_id = auth.uid() OR paid_by = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.expenses e JOIN public.group_members gm ON gm.group_id = e.group_id WHERE e.id = expense_splits.expense_id AND gm.user_id = auth.uid())
);

-- 5. GROUP INVITES: Any member can DELETE an invite to cancel it
DROP POLICY IF EXISTS "group members can delete invites" ON public.group_invites;
CREATE POLICY "group members can delete invites" ON public.group_invites FOR DELETE
USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_invites.group_id AND user_id = auth.uid()));


-- 6. CONNECTIONS (FRIENDS): Either the requester or the receiver can explicitly delete their connection
DROP POLICY IF EXISTS "Users can delete their connections" ON public.connections;
CREATE POLICY "Users can delete their connections" ON public.connections FOR DELETE
USING (auth.uid() = requester_id OR auth.uid() = receiver_id);
