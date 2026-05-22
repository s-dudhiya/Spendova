-- Create the site_settings table to hold global application state
CREATE TABLE IF NOT EXISTS public.site_settings (
    id SERIAL PRIMARY KEY,
    is_maintenance_mode BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert the single configuration row if it doesn't exist
INSERT INTO public.site_settings (id, is_maintenance_mode)
SELECT 1, false
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id = 1);

-- Set up Row Level Security
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the site settings (needed for App.tsx before login)
CREATE POLICY "Public Read Access" ON public.site_settings
    FOR SELECT USING (true);

-- Allow authenticated users to update the site settings
-- (In the frontend, we protect the UI toggle with the developer password)
CREATE POLICY "Authenticated users can update site settings" ON public.site_settings
    FOR UPDATE USING (auth.role() = 'authenticated');
