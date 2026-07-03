-- ==============================================================================
-- Migration: Ledger Categories isolation
-- ==============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.ledger_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    created_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_deleted BOOLEAN DEFAULT false NOT NULL
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ledger_categories_ledger_id ON public.ledger_categories(ledger_id);

-- 2. Setup RLS
ALTER TABLE public.ledger_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view categories of ledgers they are members of" ON public.ledger_categories;
CREATE POLICY "Users can view categories of ledgers they are members of"
    ON public.ledger_categories FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_members.ledger_id = ledger_id
            AND ledger_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.ledgers
            WHERE ledgers.id = ledger_id
            AND ledgers.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert categories in ledgers they are members of" ON public.ledger_categories;
CREATE POLICY "Users can insert categories in ledgers they are members of"
    ON public.ledger_categories FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_members.ledger_id = ledger_id
            AND ledger_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.ledgers
            WHERE ledgers.id = ledger_id
            AND ledgers.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update categories in ledgers they are members of" ON public.ledger_categories;
CREATE POLICY "Users can update categories in ledgers they are members of"
    ON public.ledger_categories FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_members.ledger_id = ledger_id
            AND ledger_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.ledgers
            WHERE ledgers.id = ledger_id
            AND ledgers.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete categories in ledgers they are members of" ON public.ledger_categories;
CREATE POLICY "Users can delete categories in ledgers they are members of"
    ON public.ledger_categories FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.ledger_members
            WHERE ledger_members.ledger_id = ledger_id
            AND ledger_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.ledgers
            WHERE ledgers.id = ledger_id
            AND ledgers.owner_id = auth.uid()
        )
    );

-- 3. Types update function (optional, but good practice for updated_at)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS handle_updated_at_ledger_categories ON public.ledger_categories;
CREATE TRIGGER handle_updated_at_ledger_categories
    BEFORE UPDATE ON public.ledger_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
