-- Tighten group management rules after earlier broad member-management policies.

DROP POLICY IF EXISTS "Any member can update group" ON public.groups;
DROP POLICY IF EXISTS "Any member can delete group" ON public.groups;
DROP POLICY IF EXISTS "Any member can insert members" ON public.group_members;
DROP POLICY IF EXISTS "Any member can delete members" ON public.group_members;
DROP POLICY IF EXISTS "Group members can update group" ON public.groups;
DROP POLICY IF EXISTS "Group members can add new members" ON public.group_members;
DROP POLICY IF EXISTS "Group creators or the user themselves can insert members" ON public.group_members;
DROP POLICY IF EXISTS "Group creators or the user themselves can remove members" ON public.group_members;
DROP POLICY IF EXISTS "Group owners can update groups" ON public.groups;
DROP POLICY IF EXISTS "Group owners can delete groups" ON public.groups;
DROP POLICY IF EXISTS "Users can join themselves or owners can add members" ON public.group_members;
DROP POLICY IF EXISTS "Users can leave or owners can remove members" ON public.group_members;

CREATE POLICY "Group owners can update groups"
ON public.groups FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Group owners can delete groups"
ON public.groups FOR DELETE
USING (created_by = auth.uid());

CREATE POLICY "Users can join themselves or owners can add members"
ON public.group_members FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.is_group_creator(group_id));

CREATE POLICY "Users can leave or owners can remove members"
ON public.group_members FOR DELETE
USING (
  (user_id = auth.uid() AND NOT public.is_group_creator(group_id))
  OR (user_id <> auth.uid() AND public.is_group_creator(group_id))
);
