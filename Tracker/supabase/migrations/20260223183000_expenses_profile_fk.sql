-- Add foreign key constraint from expenses.user_id to profiles.user_id
-- This is necessary to allow Supabase (PostgREST) to do relational joins like `profiles!expenses_user_id_fkey`
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_user_id_fkey,
  ADD CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
