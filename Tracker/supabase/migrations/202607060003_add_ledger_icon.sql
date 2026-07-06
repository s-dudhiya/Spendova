-- Add icon to ledgers
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS icon TEXT;
