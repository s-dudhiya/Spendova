-- Security hardening and split consistency fixes.

-- Admin membership is intentionally separate from profiles. Normal users can
-- update their profile rows, but they cannot insert/update/delete admin_users.
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can update site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can update site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can insert site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can delete site settings" ON public.site_settings;

CREATE POLICY "Admins can update site settings"
ON public.site_settings FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert site settings"
ON public.site_settings FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete site settings"
ON public.site_settings FOR DELETE
USING (public.is_admin());

ALTER TABLE public.group_invites
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days');

DROP POLICY IF EXISTS "anyone can lookup by token" ON public.group_invites;

CREATE OR REPLACE FUNCTION public.lookup_group_invite(invite_token text)
RETURNS TABLE (
  group_id uuid,
  invited_by uuid,
  status text,
  expires_at timestamptz,
  groups jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gi.group_id,
    gi.invited_by,
    gi.status,
    gi.expires_at,
    jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'emoji', g.emoji,
      'description', g.description
    ) AS groups
  FROM public.group_invites gi
  JOIN public.groups g ON g.id = gi.group_id
  WHERE gi.token = invite_token
    AND gi.status = 'pending'
    AND gi.expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_group_invite(text) TO anon, authenticated;

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_no_self_request,
  ADD CONSTRAINT connections_no_self_request CHECK (requester_id <> receiver_id);

CREATE UNIQUE INDEX IF NOT EXISTS connections_one_active_pair_idx
ON public.connections (LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))
WHERE status IN ('pending', 'accepted');

DROP POLICY IF EXISTS "Users can insert connections as requester" ON public.connections;
CREATE POLICY "Users can insert connections as requester"
ON public.connections FOR INSERT
WITH CHECK (auth.uid() = requester_id AND requester_id <> receiver_id);

CREATE OR REPLACE FUNCTION public.mark_splits_paid_when_expense_cleared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cleared' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'expense_splits'
        AND column_name = 'updated_at'
    ) THEN
      UPDATE public.expense_splits
      SET has_paid = true,
          updated_at = now()
      WHERE expense_id = NEW.id
        AND COALESCE(has_paid, false) = false;
    ELSE
      UPDATE public.expense_splits
      SET has_paid = true
      WHERE expense_id = NEW.id
        AND COALESCE(has_paid, false) = false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_splits_paid_when_expense_cleared ON public.expenses;
CREATE TRIGGER trg_mark_splits_paid_when_expense_cleared
AFTER UPDATE OF status ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.mark_splits_paid_when_expense_cleared();

-- After running this migration, manually add admin from Supabase SQL editor:
-- INSERT INTO public.admin_users (user_id)
-- VALUES ('YOUR_SUPABASE_AUTH_USER_ID');
