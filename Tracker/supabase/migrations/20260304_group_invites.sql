-- Group invites table: track email invitations to groups
CREATE TABLE IF NOT EXISTS group_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid REFERENCES groups(id) ON DELETE CASCADE,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email       text NOT NULL,
  token       text UNIQUE DEFAULT gen_random_uuid()::text,
  status      text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;

-- Any group member can view, create, update invites for their group
CREATE POLICY "group members can view invites"
  ON group_invites FOR SELECT
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

CREATE POLICY "group members can create invites"
  ON group_invites FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

CREATE POLICY "group members can update invite status"
  ON group_invites FOR UPDATE
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

-- Token-based lookup (for invite accept page — no auth required)
CREATE POLICY "anyone can lookup by token"
  ON group_invites FOR SELECT
  USING (true);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
CREATE INDEX IF NOT EXISTS idx_group_invites_email ON group_invites(email);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id);
