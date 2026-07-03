-- Add category_id to ledger_expenses for custom category mapping
ALTER TABLE public.ledger_expenses
  ADD COLUMN category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS ledger_expenses_category_id_idx ON public.ledger_expenses(category_id);
