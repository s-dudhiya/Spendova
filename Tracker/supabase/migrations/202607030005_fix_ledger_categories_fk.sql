-- Fix foreign key constraint on ledger_categories to point to user_id instead of id

ALTER TABLE public.ledger_categories
  DROP CONSTRAINT IF EXISTS ledger_categories_created_by_fkey;

ALTER TABLE public.ledger_categories
  ADD CONSTRAINT ledger_categories_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
