import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kmllvchwuhrnnahksurt.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Cannot run admin migrations.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const sql = `
-- 1. Connections: Allow either user (requester or receiver) to delete the connection
DROP POLICY IF EXISTS "Users can delete their connections" ON public.connections;
CREATE POLICY "Users can delete their connections"
ON public.connections FOR DELETE
USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- 2. Group Members: Allow a user to leave a group (delete their own membership)
--    OR allow the group creator to remove anyone
DROP POLICY IF EXISTS "Members can leave or creator can remove" ON public.group_members;
CREATE POLICY "Members can leave or creator can remove"
ON public.group_members FOR DELETE
USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM public.groups 
    WHERE groups.id = group_members.group_id 
    AND groups.created_by = auth.uid()
  )
);

-- 3. Groups: Allow the group creator to delete the entire group
DROP POLICY IF EXISTS "Creators can delete groups" ON public.groups;
CREATE POLICY "Creators can delete groups"
ON public.groups FOR DELETE
USING (auth.uid() = created_by);
`

async function apply() {
    // We can't use .rpc with raw sql easily sometimes unless setup, but wait, there is no generic function for arbitrary sql normally.
    // Actually, supabase JS client cannot execute arbitrary SQL easily without an RPC. 
    console.log("We need to use postgres.js or a direct connection string to run arbitrary SQL since supabase-js does not support raw SQL execution directly, unless there is an RPC 'exec_sql'.")
}

apply()
