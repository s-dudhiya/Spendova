-- Fix Foreign Keys to point to public.profiles(user_id) instead of public.profiles(id)
-- This allows all RLS policies referencing auth.uid() to match natively.

-- 1. Connections
ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_requester_id_fkey,
  DROP CONSTRAINT IF EXISTS connections_receiver_id_fkey,
  ADD CONSTRAINT connections_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  ADD CONSTRAINT connections_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- 2. Groups
ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_created_by_fkey,
  ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- 3. Group Members
ALTER TABLE public.group_members
  DROP CONSTRAINT IF EXISTS group_members_user_id_fkey,
  ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- 4. Expense Splits
ALTER TABLE public.expense_splits
  DROP CONSTRAINT IF EXISTS expense_splits_user_id_fkey,
  ADD CONSTRAINT expense_splits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Re-apply any broken RLS policies from connections
DROP POLICY IF EXISTS "Users can view their own connections" ON public.connections;
CREATE POLICY "Users can view their own connections" 
ON public.connections FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can update their connections" ON public.connections;
CREATE POLICY "Users can update their connections" 
ON public.connections FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);
