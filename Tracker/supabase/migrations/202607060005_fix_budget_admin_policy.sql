-- Update is_ledger_owner_or_admin to include budget_admin_id
CREATE OR REPLACE FUNCTION public.is_ledger_owner_or_admin(p_ledger_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ledgers
    WHERE id = p_ledger_id
      AND budget_admin_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM ledger_members
    WHERE ledger_id = p_ledger_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;
