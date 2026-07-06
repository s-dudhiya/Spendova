-- ============================================================
-- Relax Ledger Permissions & Role Transfers
-- ============================================================

-- 1. Allow ANY member to invite others
DROP POLICY IF EXISTS "ledger_invites_insert" ON public.ledger_invites;
CREATE POLICY "ledger_invites_insert" ON public.ledger_invites FOR INSERT TO authenticated
  WITH CHECK (is_ledger_member(ledger_id) AND invited_by = auth.uid());

-- 2. Allow ANY member to add a budget
DROP POLICY IF EXISTS "ledger_budget_additions_insert" ON public.ledger_budget_additions;
CREATE POLICY "ledger_budget_additions_insert" ON public.ledger_budget_additions FOR INSERT TO authenticated
  WITH CHECK (is_ledger_member(ledger_id) AND added_by = auth.uid());

-- 3. Secure RPC to transfer ownership
CREATE OR REPLACE FUNCTION public.transfer_ledger_ownership(
  p_ledger_id UUID,
  p_new_owner_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  -- Verify caller is the current owner of the ledger
  SELECT EXISTS (
    SELECT 1 FROM ledgers WHERE id = p_ledger_id AND owner_id = auth.uid()
  ) INTO v_is_owner;
  
  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('error', 'Only the current ledger owner can transfer ownership.');
  END IF;

  -- Ensure the new owner is actually a member of this ledger
  IF NOT EXISTS (SELECT 1 FROM ledger_members WHERE ledger_id = p_ledger_id AND user_id = p_new_owner_id) THEN
    RETURN jsonb_build_object('error', 'The new owner must be a member of the ledger.');
  END IF;

  -- 1. Update the current owner's role to 'admin'
  UPDATE ledger_members
  SET role = 'admin'
  WHERE ledger_id = p_ledger_id AND user_id = auth.uid();

  -- 2. Update the new owner's role to 'owner'
  UPDATE ledger_members
  SET role = 'owner'
  WHERE ledger_id = p_ledger_id AND user_id = p_new_owner_id;

  -- 3. Update the ledgers table owner_id
  UPDATE ledgers
  SET owner_id = p_new_owner_id, updated_at = now()
  WHERE id = p_ledger_id;

  -- Log activity
  INSERT INTO ledger_activity (ledger_id, actor_id, action, entity_type, metadata)
  VALUES (p_ledger_id, auth.uid(), 'ownership_transferred', 'ledger', jsonb_build_object('new_owner_id', p_new_owner_id));

  RETURN jsonb_build_object('success', true);
END;
$$;
