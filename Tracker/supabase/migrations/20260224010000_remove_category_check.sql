-- Remove the strict category check to allow custom expense names like "Goa Trip"
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

-- Remove the split_type check constraint to safely allow "none" for non-split expenses
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%split_type%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.expenses DROP CONSTRAINT ' || quote_ident(constraint_name);
    END IF;
END
$$;
