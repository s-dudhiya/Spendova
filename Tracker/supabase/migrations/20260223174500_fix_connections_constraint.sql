-- Fixes the 409 error on public.connections where sending a reverse connection request
-- violates the unique constraint or the RLS policy.

-- 1. We drop the strict UNIQUE constraint on (requester_id, receiver_id)
-- because A requesting B and B requesting A shouldn't necessarily hard-crash postgres if accidental.
-- We'll handle it via an improved unique index that ignores order.

ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_requester_id_receiver_id_key;

-- Create a unique index where the order of requester and receiver doesn't matter
CREATE UNIQUE INDEX IF NOT EXISTS connections_unique_users_idx ON public.connections (
    LEAST(requester_id, receiver_id),
    GREATEST(requester_id, receiver_id)
);

-- 2. Let's make sure the INSERT policy is flawless. 
-- The user MUST be the requester to insert.
DROP POLICY IF EXISTS "Users can insert connections as requester" ON public.connections;
CREATE POLICY "Users can insert connections as requester" 
ON public.connections FOR INSERT 
WITH CHECK (auth.uid() = requester_id);
