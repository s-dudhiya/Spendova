-- Drop polymorphic foreign key constraint on ledger_expenses.category_id

ALTER TABLE public.ledger_expenses
  DROP CONSTRAINT IF EXISTS ledger_expenses_category_id_fkey;
