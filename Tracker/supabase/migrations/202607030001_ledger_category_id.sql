-- Add category_id to ledger_expenses for custom category mapping
-- Note: We do not add a REFERENCES constraint here because category_id is polymorphic.
-- It can point to either public.expense_categories (for personal ledgers) or public.ledger_categories (for shared ledgers).
ALTER TABLE public.ledger_expenses
  ADD COLUMN category_id UUID;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS ledger_expenses_category_id_idx ON public.ledger_expenses(category_id);
