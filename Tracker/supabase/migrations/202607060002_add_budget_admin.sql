-- Add budget_admin_id to ledgers
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS budget_admin_id UUID REFERENCES public.profiles(user_id);

-- Set default budget admin to owner for existing ledgers
UPDATE public.ledgers SET budget_admin_id = owner_id WHERE budget_admin_id IS NULL;
