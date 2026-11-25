-- Add normalized mobile number to profiles and secure contact matching RPC

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- Securely match a list of normalized phone numbers against registered Spendova users
CREATE OR REPLACE FUNCTION public.match_spendova_contacts(phone_numbers text[])
RETURNS TABLE (
  user_id uuid,
  full_name text,
  username text,
  phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF phone_numbers IS NULL OR array_length(phone_numbers, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.full_name, p.username, p.phone
  FROM public.profiles p
  WHERE p.phone = ANY(phone_numbers)
    AND p.user_id <> auth.uid()
    AND COALESCE(p.email_verified, true) = true;
END;
$$;

REVOKE ALL ON FUNCTION public.match_spendova_contacts(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_spendova_contacts(text[]) TO authenticated;

-- Check if a phone number is already registered (for signup validation before auth)
CREATE OR REPLACE FUNCTION public.is_phone_available(target_phone text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.phone = target_phone
      AND COALESCE(p.email_verified, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_phone_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_phone_available(text) TO anon, authenticated;
