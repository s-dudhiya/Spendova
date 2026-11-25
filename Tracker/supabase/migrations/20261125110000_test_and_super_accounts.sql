-- Add test account and super account flags to profiles so they bypass the mandatory phone gate

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_super_account boolean NOT NULL DEFAULT false;

-- Automatically flag all existing admin accounts as super accounts
UPDATE public.profiles p
SET is_super_account = true
WHERE EXISTS (
  SELECT 1
  FROM public.admin_users a
  WHERE a.user_id = p.user_id
);

-- Secure RPC for admins to toggle test/super account flags
CREATE OR REPLACE FUNCTION public.admin_set_account_flags(
  target_user_id uuid,
  next_is_test boolean DEFAULT NULL,
  next_is_super boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.profiles
  SET
    is_test_account = COALESCE(next_is_test, is_test_account),
    is_super_account = COALESCE(next_is_super, is_super_account),
    updated_at = now()
  WHERE user_id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_account_flags(uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_account_flags(uuid, boolean, boolean) TO authenticated;
