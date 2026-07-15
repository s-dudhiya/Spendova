-- Fix infinite recursion in RLS policy by using SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.is_group_member_for_expense(check_expense_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.expenses e
        JOIN public.group_members gm ON e.group_id = gm.group_id
        WHERE e.id = check_expense_id
        AND gm.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_involved_in_expense(check_expense_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.expense_splits 
        WHERE expense_id = check_expense_id 
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Users can view their splits or splits for expenses they created" ON public.expense_splits;

CREATE POLICY "Users can view their splits or splits for expenses they created" 
ON public.expense_splits FOR SELECT 
USING (
  user_id = auth.uid() 
  OR public.is_expense_creator(expense_id)
  OR public.is_group_member_for_expense(expense_id)
  OR public.is_involved_in_expense(expense_id)
);
