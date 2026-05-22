-- Function to safely fetch all user emails for the 'Mail All Users' feature
-- This must be SECURITY DEFINER to bypass RLS and access auth.users

CREATE OR REPLACE FUNCTION public.get_all_user_emails()
RETURNS TABLE (email TEXT) AS $$
BEGIN
  -- We only allow authenticated users to call this, or we can restrict it further.
  -- For now, any logged-in user can fetch emails to "mail all users" as requested.
  IF auth.role() = 'authenticated' THEN
    RETURN QUERY SELECT au.email::TEXT FROM auth.users au WHERE au.email IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_all_user_emails() TO authenticated;
 