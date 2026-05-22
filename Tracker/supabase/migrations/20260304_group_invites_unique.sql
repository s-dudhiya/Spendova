ALTER TABLE group_invites ADD CONSTRAINT unique_email_group UNIQUE (email, group_id);
