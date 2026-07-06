-- Update ledger_expenses linked_expense_id constraint to CASCADE
ALTER TABLE public.ledger_expenses
  DROP CONSTRAINT IF EXISTS ledger_expenses_linked_expense_id_fkey;

ALTER TABLE public.ledger_expenses
  ADD CONSTRAINT ledger_expenses_linked_expense_id_fkey 
  FOREIGN KEY (linked_expense_id) 
  REFERENCES public.expenses(id) 
  ON DELETE CASCADE;

-- Create RPC to delete ledger and clean up personal expenses
CREATE OR REPLACE FUNCTION public.delete_ledger(p_ledger_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ledger_type TEXT;
  v_is_owner_or_admin BOOLEAN;
BEGIN
  -- Check permission
  IF NOT is_ledger_owner_or_admin(p_ledger_id) THEN
    RETURN jsonb_build_object('error', 'Unauthorized: Only owners or admins can delete ledgers');
  END IF;

  SELECT ledger_type INTO v_ledger_type FROM ledgers WHERE id = p_ledger_id;

  -- If personal, we must also clean up the main 'expenses' table
  IF v_ledger_type = 'personal' THEN
    DELETE FROM expenses 
    WHERE id IN (
      SELECT linked_expense_id 
      FROM ledger_expenses 
      WHERE ledger_id = p_ledger_id AND linked_expense_id IS NOT NULL
    );
  END IF;

  -- Delete the ledger (this will cascade to ledger_members, ledger_expenses, etc.)
  DELETE FROM ledgers WHERE id = p_ledger_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
