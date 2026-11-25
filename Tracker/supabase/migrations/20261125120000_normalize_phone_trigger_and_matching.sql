-- Enforce canonical E.164 phone normalization in database so spaces, leading 0, or missing +91 always match & stay unique

CREATE OR REPLACE FUNCTION public.normalize_phone_sql(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
  digits text;
  has_plus boolean;
BEGIN
  IF raw_phone IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := btrim(regexp_replace(raw_phone, E'[\\u200B-\\u200F\\u202A-\\u202E\\uFEFF]', '', 'g'));
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  has_plus := left(cleaned, 1) = '+';
  digits := regexp_replace(cleaned, '\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;

  IF has_plus THEN
    IF length(digits) < 10 OR length(digits) > 15 THEN
      RETURN NULL;
    END IF;
    RETURN '+' || digits;
  END IF;

  IF left(digits, 2) = '00' THEN
    digits := substr(digits, 3);
    IF length(digits) < 10 OR length(digits) > 15 THEN
      RETURN NULL;
    END IF;
    RETURN '+' || digits;
  END IF;

  IF length(digits) = 11 AND left(digits, 1) = '0' THEN
    digits := substr(digits, 2);
  END IF;

  IF length(digits) = 10 THEN
    RETURN '+91' || digits;
  END IF;

  IF length(digits) = 12 AND left(digits, 2) = '91' THEN
    RETURN '+' || digits;
  END IF;

  IF length(digits) >= 10 AND length(digits) <= 15 THEN
    RETURN '+' || digits;
  END IF;

  RETURN NULL;
END;
$$;

-- Normalize any existing phone numbers stored in profiles
UPDATE public.profiles
SET phone = public.normalize_phone_sql(phone)
WHERE phone IS NOT NULL
  AND phone <> ''
  AND phone IS DISTINCT FROM public.normalize_phone_sql(phone);

-- Trigger to automatically normalize phone before insert or update on profiles
CREATE OR REPLACE FUNCTION public.profiles_normalize_phone_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND btrim(NEW.phone) <> '' THEN
    NEW.phone := COALESCE(public.normalize_phone_sql(NEW.phone), btrim(NEW.phone));
  ELSE
    NEW.phone := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalize_phone ON public.profiles;
CREATE TRIGGER trg_profiles_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_normalize_phone_trigger();

-- Update match_spendova_contacts to normalize input array and stored phone
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
DECLARE
  normalized_list text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF phone_numbers IS NULL OR array_length(phone_numbers, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT n)
  INTO normalized_list
  FROM (
    SELECT public.normalize_phone_sql(x) AS n
    FROM unnest(phone_numbers) AS x
  ) sub
  WHERE n IS NOT NULL;

  IF normalized_list IS NULL OR array_length(normalized_list, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.full_name, p.username, p.phone
  FROM public.profiles p
  WHERE public.normalize_phone_sql(p.phone) = ANY(normalized_list)
    AND p.user_id <> auth.uid()
    AND COALESCE(p.email_verified, true) = true;
END;
$$;

-- Update is_phone_available to normalize both target_phone and stored phone
CREATE OR REPLACE FUNCTION public.is_phone_available(target_phone text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE public.normalize_phone_sql(p.phone) = public.normalize_phone_sql(target_phone)
      AND public.normalize_phone_sql(target_phone) IS NOT NULL
      AND COALESCE(p.email_verified, true) = true
  );
$$;
