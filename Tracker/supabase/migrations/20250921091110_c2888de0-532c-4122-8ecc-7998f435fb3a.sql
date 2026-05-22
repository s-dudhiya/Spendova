-- Update the category check constraint to allow 'miscellaneous' instead of 'basic'
ALTER TABLE public.expenses DROP CONSTRAINT expenses_category_check;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check 
CHECK (category = ANY (ARRAY['tiffin'::text, 'delivery'::text, 'miscellaneous'::text]));