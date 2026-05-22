-- Add emoji and description columns to groups table for visual identity
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '🏠';
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description TEXT;
