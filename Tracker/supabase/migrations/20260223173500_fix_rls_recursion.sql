-- 1. Create SECURITY DEFINER functions to handle RLS safely without recursion.
-- These bypass RLS checks to prevent infinite loops when policies reference each other.

CREATE OR REPLACE FUNCTION public.is_group_member(check_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = check_group_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_group_creator(check_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups WHERE id = check_group_id AND created_by = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_expense_participant(check_expense_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.expense_splits WHERE expense_id = check_expense_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_expense_creator(check_expense_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.expenses WHERE id = check_expense_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 2. Drop the original recursive policies

DROP POLICY IF EXISTS "Users can view groups they belong to" ON public.groups;
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.group_members;
DROP POLICY IF EXISTS "Group creators or the user themselves can insert members" ON public.group_members;
DROP POLICY IF EXISTS "Group creators or the user themselves can remove members" ON public.group_members;
DROP POLICY IF EXISTS "Users can view group expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view expenses they represent a split in" ON public.expenses;
DROP POLICY IF EXISTS "Users can view their splits or splits for expenses they created" ON public.expense_splits;
DROP POLICY IF EXISTS "Users can insert splits for expenses they created" ON public.expense_splits;
DROP POLICY IF EXISTS "Users can update their splits (pay) or splits for their expenses" ON public.expense_splits;
DROP POLICY IF EXISTS "Users can delete splits for expenses they created" ON public.expense_splits;

-- 3. Re-create the policies using the safe functions

-- groups
CREATE POLICY "Users can view groups they belong to" 
ON public.groups FOR SELECT 
USING ( created_by = auth.uid() OR public.is_group_member(id) );

-- group_members
CREATE POLICY "Users can view members of their groups" 
ON public.group_members FOR SELECT 
USING ( user_id = auth.uid() OR public.is_group_member(group_id) );

CREATE POLICY "Group creators or the user themselves can insert members" 
ON public.group_members FOR INSERT 
WITH CHECK ( user_id = auth.uid() OR public.is_group_creator(group_id) );

CREATE POLICY "Group creators or the user themselves can remove members" 
ON public.group_members FOR DELETE 
USING ( user_id = auth.uid() OR public.is_group_creator(group_id) );

-- expenses
CREATE POLICY "Users can view group expenses"
ON public.expenses FOR SELECT
USING ( public.is_group_member(group_id) );

CREATE POLICY "Users can view expenses they represent a split in"
ON public.expenses FOR SELECT
USING ( public.is_expense_participant(id) );

-- expense_splits
CREATE POLICY "Users can view their splits or splits for expenses they created" 
ON public.expense_splits FOR SELECT 
USING ( user_id = auth.uid() OR public.is_expense_creator(expense_id) );

CREATE POLICY "Users can insert splits for expenses they created" 
ON public.expense_splits FOR INSERT 
WITH CHECK ( public.is_expense_creator(expense_id) );

CREATE POLICY "Users can update their splits (pay) or splits for their expenses" 
ON public.expense_splits FOR UPDATE 
USING ( user_id = auth.uid() OR public.is_expense_creator(expense_id) );

CREATE POLICY "Users can delete splits for expenses they created" 
ON public.expense_splits FOR DELETE 
USING ( public.is_expense_creator(expense_id) );
