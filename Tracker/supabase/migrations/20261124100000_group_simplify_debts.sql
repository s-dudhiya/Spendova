-- =====================================================================
-- Migration: Group-Level Synchronized Simplify Debts
-- Description: Adds simplify_debts to public.groups so that any member
-- toggling Simplify Debts will sync the state to all group members.
-- =====================================================================

-- 1. Add simplify_debts column to public.groups with default true
ALTER TABLE public.groups 
ADD COLUMN IF NOT EXISTS simplify_debts BOOLEAN NOT NULL DEFAULT true;

-- 2. Backfill existing groups to ensure simplify_debts is true
UPDATE public.groups 
SET simplify_debts = true 
WHERE simplify_debts IS NULL;

-- 3. Confirm RLS policy allows group members to update the group row
DROP POLICY IF EXISTS "Group members can update group" ON public.groups;

CREATE POLICY "Group members can update group"
ON public.groups FOR UPDATE
USING (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = groups.id
    AND group_members.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = groups.id
    AND group_members.user_id = auth.uid()
  )
);

-- 4. Notify PostgREST to reload the schema cache immediately
NOTIFY pgrst, 'reload schema';
