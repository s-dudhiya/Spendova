-- Allow a group owner to transfer admin ownership to another existing group member.

CREATE OR REPLACE FUNCTION public.transfer_group_admin(
  p_group_id uuid,
  p_new_admin_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.groups
    WHERE id = p_group_id
      AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the current group admin can transfer admin access';
  END IF;

  IF p_new_admin_user_id = auth.uid() THEN
    RAISE EXCEPTION 'This user is already the group admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_new_admin_user_id
  ) THEN
    RAISE EXCEPTION 'New admin must be an existing group member';
  END IF;

  UPDATE public.groups
  SET created_by = p_new_admin_user_id,
      updated_at = now()
  WHERE id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_group_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_group_admin(uuid, uuid) TO authenticated;
