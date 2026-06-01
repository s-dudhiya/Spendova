-- Add reusable, one-day share links while keeping email invites recipient-bound.

ALTER TABLE public.group_invites
  ADD COLUMN IF NOT EXISTS invite_type text NOT NULL DEFAULT 'email';

ALTER TABLE public.group_invites
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.group_invites
  DROP CONSTRAINT IF EXISTS group_invites_invite_type_check;

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_invite_type_check
  CHECK (invite_type IN ('email', 'link'));

ALTER TABLE public.group_invites
  DROP CONSTRAINT IF EXISTS group_invites_email_required_check;

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_email_required_check
  CHECK (
    (invite_type = 'email' AND email IS NOT NULL)
    OR (invite_type = 'link' AND email IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_group_invites_active_link
ON public.group_invites (group_id, invite_type, expires_at)
WHERE invite_type = 'link' AND status = 'pending';

CREATE OR REPLACE FUNCTION public.generate_group_invite_link(p_group_id uuid)
RETURNS TABLE (
  token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_auth
  ) THEN
    RAISE EXCEPTION 'Only group members can generate invite links';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  DELETE FROM public.group_invites
  WHERE group_id = p_group_id
    AND invite_type = 'link';

  RETURN QUERY
  INSERT INTO public.group_invites (
    group_id,
    invited_by,
    email,
    status,
    invite_type,
    expires_at
  )
  VALUES (
    p_group_id,
    v_auth,
    NULL,
    'pending',
    'link',
    now() + interval '1 day'
  )
  RETURNING group_invites.token, group_invites.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_group_invite_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_group_invite_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_group_invite(invite_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_auth_email text;
  v_invite public.group_invites%ROWTYPE;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_invite
  FROM public.group_invites
  WHERE token = invite_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is already %', v_invite.status;
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF v_invite.invite_type = 'email' THEN
    SELECT email INTO v_auth_email
    FROM auth.users
    WHERE id = v_auth;

    IF v_auth_email IS NULL OR lower(v_auth_email) <> lower(v_invite.email) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address';
    END IF;
  END IF;

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (v_invite.group_id, v_auth)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  IF v_invite.invite_type = 'email'
    AND v_invite.invited_by IS NOT NULL
    AND v_invite.invited_by <> v_auth THEN
    INSERT INTO public.connections (requester_id, receiver_id, status)
    VALUES (v_invite.invited_by, v_auth, 'accepted')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_invite.invite_type = 'email' THEN
    UPDATE public.group_invites
    SET status = 'accepted'
    WHERE id = v_invite.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'group_id', v_invite.group_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_group_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(text) TO authenticated;
