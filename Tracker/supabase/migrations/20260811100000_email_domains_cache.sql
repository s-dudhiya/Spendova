-- Create the email_domains table for caching Gemini API results
CREATE TABLE public.email_domains (
    domain TEXT PRIMARY KEY,
    is_fake BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.email_domains ENABLE ROW LEVEL SECURITY;

-- No standard users should be able to read/write this table. 
-- Only the service_role key (used by the edge function) bypasses RLS and can access this table.
-- But if we want to be explicit, we can add a service role policy.
CREATE POLICY "Service role can read email_domains" 
ON public.email_domains FOR SELECT 
USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "Service role can insert email_domains" 
ON public.email_domains FOR INSERT 
WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- (Actually, Supabase service_role key automatically bypasses RLS, so policies are not strictly necessary,
-- but adding them or simply not adding any other policies ensures it is fully locked down for anon/authenticated users.)
