-- Add the new column
ALTER TABLE public.expenses
ADD COLUMN paid_by UUID REFERENCES public.profiles(user_id);

-- Backfill the new column with the existing creator's user_id so history isn't broken
UPDATE public.expenses
SET paid_by = user_id
WHERE paid_by IS NULL;

-- Enforce that it cannot be null going forward
ALTER TABLE public.expenses
ALTER COLUMN paid_by SET NOT NULL;
