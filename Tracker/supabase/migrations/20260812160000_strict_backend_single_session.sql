-- Enforce a strict single session per user at the database level.
-- When a new session is created in auth.sessions, this trigger will
-- immediately delete all other sessions for the same user.

CREATE OR REPLACE FUNCTION public.enforce_single_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete all other sessions for this user
  DELETE FROM auth.sessions
  WHERE user_id = NEW.user_id AND id != NEW.id;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists to allow re-running safely
DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;

-- Create the trigger
CREATE TRIGGER on_auth_session_created
AFTER INSERT ON auth.sessions
FOR EACH ROW EXECUTE PROCEDURE public.enforce_single_session();
