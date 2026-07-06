-- Fix decimal amount issue by altering the amount column to NUMERIC(14,2)
ALTER TABLE public.expenses ALTER COLUMN amount TYPE NUMERIC(14,2);
