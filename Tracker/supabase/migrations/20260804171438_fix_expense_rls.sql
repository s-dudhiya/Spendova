-- Drop the existing policy
DROP POLICY IF EXISTS "ledger_expenses_update" ON public.ledger_expenses;

-- Re-create the policy with expanded rights for the payer and budget admin
CREATE POLICY "ledger_expenses_update" ON public.ledger_expenses FOR UPDATE TO authenticated
  USING (
    is_ledger_owner_or_admin(ledger_id)
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM ledgers WHERE id = ledger_id AND budget_admin_id = auth.uid())
  );
