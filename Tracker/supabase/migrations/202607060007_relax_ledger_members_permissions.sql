-- ============================================================
-- Relax Ledger Members Permissions
-- ============================================================

-- Allow ANY member to add other members directly
DROP POLICY IF EXISTS "ledger_members_insert" ON public.ledger_members;
CREATE POLICY "ledger_members_insert" ON public.ledger_members FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND EXISTS (SELECT 1 FROM ledgers WHERE id = ledger_id AND owner_id = auth.uid()))
    OR is_ledger_member(ledger_id)
  );
