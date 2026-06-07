-- Remove obsolete Tiffin/Delivery-era category constraints from the shared expenses table.
-- This does not delete expense rows or modify shared expense behavior.
DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%tiffin%'
        OR pg_get_constraintdef(oid) ILIKE '%delivery%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END
$$;
