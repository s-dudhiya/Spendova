-- ============================================================
-- Budget Ledger Feature Migration
-- Version: 202607020001
-- ============================================================

-- 1. Storage bucket for ledger receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ledger-receipts',
  'ledger-receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ledger_receipts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ledger-receipts');

CREATE POLICY "ledger_receipts_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ledger-receipts');

CREATE POLICY "ledger_receipts_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ledger-receipts' AND (owner = auth.uid() OR owner IS NULL));

CREATE POLICY "ledger_receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ledger-receipts' AND (owner = auth.uid() OR owner IS NULL));

-- ============================================================
-- 2. Core tables
-- ============================================================

-- Ledgers (no mutable current_budget – calculated from expense data)
CREATE TABLE IF NOT EXISTS public.ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  ledger_type TEXT NOT NULL DEFAULT 'personal' CHECK (ledger_type IN ('personal', 'shared')),
  budget_type TEXT NOT NULL DEFAULT 'one_time' CHECK (budget_type IN ('monthly', 'one_time')),
  total_savings NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_savings >= 0),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Ledger members (with role: owner | admin | member – future multi-admin support)
CREATE TABLE IF NOT EXISTS public.ledger_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ledger_id, user_id)
);

-- Budget additions (additive history – never modify existing rows)
CREATE TABLE IF NOT EXISTS public.ledger_budget_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  added_by UUID NOT NULL REFERENCES public.profiles(user_id),
  month SMALLINT CHECK (month BETWEEN 1 AND 12),
  year SMALLINT CHECK (year BETWEEN 2000 AND 2100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ledger expenses (Pending → Approved → Paid | Rejected)
CREATE TABLE IF NOT EXISTS public.ledger_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  category TEXT CHECK (category IS NULL OR char_length(category) <= 100),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  proof_path TEXT,
  proof_uploaded_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(user_id),
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  month SMALLINT CHECK (month BETWEEN 1 AND 12),
  year SMALLINT CHECK (year BETWEEN 2000 AND 2100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Monthly budget history (populated on rollover for monthly-type ledgers)
CREATE TABLE IF NOT EXISTS public.ledger_monthly_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  budget_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  saved_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  rolled_over_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ledger_id, month, year)
);

-- Ledger invites (email + link-based, mirrors group_invites pattern)
CREATE TABLE IF NOT EXISTS public.ledger_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  email TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invite_type TEXT NOT NULL DEFAULT 'email' CHECK (invite_type IN ('email', 'link')),
  invited_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Activity / audit log (powers timeline, notifications, debugging)
CREATE TABLE IF NOT EXISTS public.ledger_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(user_id),
  action TEXT NOT NULL CHECK (char_length(action) <= 100),
  entity_type TEXT CHECK (entity_type IS NULL OR char_length(entity_type) <= 50),
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Indexes (performance for common queries)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ledgers_owner_id ON public.ledgers(owner_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_is_archived ON public.ledgers(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_ledger_members_ledger_id ON public.ledger_members(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_members_user_id ON public.ledger_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_members_role ON public.ledger_members(ledger_id, role);
CREATE INDEX IF NOT EXISTS idx_ledger_budget_additions_ledger_id ON public.ledger_budget_additions(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_budget_additions_month_year ON public.ledger_budget_additions(ledger_id, month, year);
CREATE INDEX IF NOT EXISTS idx_ledger_expenses_ledger_id ON public.ledger_expenses(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_expenses_user_id ON public.ledger_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_expenses_status ON public.ledger_expenses(ledger_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_expenses_created_at ON public.ledger_expenses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_expenses_month_year ON public.ledger_expenses(ledger_id, month, year);
CREATE INDEX IF NOT EXISTS idx_ledger_monthly_budgets_ledger_id ON public.ledger_monthly_budgets(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_ledger_id ON public.ledger_invites(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_invites_token ON public.ledger_invites(token);
CREATE INDEX IF NOT EXISTS idx_ledger_activity_ledger_id ON public.ledger_activity(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_activity_created_at ON public.ledger_activity(created_at DESC);

-- ============================================================
-- 4. Enable Row Level Security
-- ============================================================

ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_budget_additions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_activity ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Helper functions (SECURITY DEFINER bypasses RLS – no recursion)
-- ============================================================

-- Is the current user a member of this ledger? (includes all roles)
CREATE OR REPLACE FUNCTION public.is_ledger_member(p_ledger_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ledger_members
    WHERE ledger_id = p_ledger_id AND user_id = auth.uid()
  );
$$;

-- Is the current user an owner or admin of this ledger?
CREATE OR REPLACE FUNCTION public.is_ledger_owner_or_admin(p_ledger_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ledger_members
    WHERE ledger_id = p_ledger_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- ============================================================
-- 6. RPC Functions
-- ============================================================

-- Accept a ledger invite by token (called on invite acceptance)
CREATE OR REPLACE FUNCTION public.accept_ledger_invite(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.ledger_invites;
BEGIN
  SELECT * INTO v_invite FROM ledger_invites WHERE token = p_token AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'This invite is unavailable or has already been used.');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    UPDATE ledger_invites SET status = 'expired' WHERE id = v_invite.id;
    RETURN jsonb_build_object('error', 'This invite link has expired.');
  END IF;

  -- Add user to ledger (idempotent)
  INSERT INTO ledger_members (ledger_id, user_id, role)
  VALUES (v_invite.ledger_id, auth.uid(), 'member')
  ON CONFLICT (ledger_id, user_id) DO NOTHING;

  UPDATE ledger_invites SET status = 'accepted' WHERE id = v_invite.id;

  INSERT INTO ledger_activity (ledger_id, actor_id, action, entity_type)
  VALUES (v_invite.ledger_id, auth.uid(), 'member_joined', 'member');

  RETURN jsonb_build_object('success', true, 'ledger_id', v_invite.ledger_id::text);
END;
$$;

-- Perform monthly rollover (owner-only, confirms remaining → savings)
CREATE OR REPLACE FUNCTION public.perform_ledger_monthly_rollover(
  p_ledger_id UUID,
  p_from_month SMALLINT,
  p_from_year SMALLINT,
  p_budget_amount NUMERIC,
  p_paid_amount NUMERIC,
  p_saved_amount NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_ledger_owner_or_admin(p_ledger_id) THEN
    RETURN jsonb_build_object('error', 'Only the ledger owner can perform a monthly rollover.');
  END IF;

  -- Upsert monthly history record
  INSERT INTO ledger_monthly_budgets (ledger_id, month, year, budget_amount, paid_amount, saved_amount, rolled_over_at)
  VALUES (p_ledger_id, p_from_month, p_from_year, p_budget_amount, p_paid_amount, p_saved_amount, now())
  ON CONFLICT (ledger_id, month, year) DO UPDATE SET
    budget_amount = EXCLUDED.budget_amount,
    paid_amount   = EXCLUDED.paid_amount,
    saved_amount  = EXCLUDED.saved_amount,
    rolled_over_at = now();

  -- Accumulate savings
  UPDATE ledgers
  SET total_savings = total_savings + p_saved_amount, updated_at = now()
  WHERE id = p_ledger_id;

  INSERT INTO ledger_activity (ledger_id, actor_id, action, entity_type, metadata)
  VALUES (
    p_ledger_id, auth.uid(), 'monthly_rollover', 'budget',
    jsonb_build_object('month', p_from_month, 'year', p_from_year, 'saved', p_saved_amount)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- 7. RLS Policies
-- ============================================================

-- ledgers --
-- Owner can always see/manage their ledger; members via ledger_members table
CREATE POLICY "ledgers_select" ON public.ledgers FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_ledger_member(id));

CREATE POLICY "ledgers_insert" ON public.ledgers FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "ledgers_update" ON public.ledgers FOR UPDATE TO authenticated
  USING (is_ledger_owner_or_admin(id));

CREATE POLICY "ledgers_delete" ON public.ledgers FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ledger_members --
CREATE POLICY "ledger_members_select" ON public.ledger_members FOR SELECT TO authenticated
  USING (is_ledger_member(ledger_id));

-- Bootstrap: owner can add themselves on creation; then owner can add others
CREATE POLICY "ledger_members_insert" ON public.ledger_members FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND EXISTS (SELECT 1 FROM ledgers WHERE id = ledger_id AND owner_id = auth.uid()))
    OR is_ledger_owner_or_admin(ledger_id)
  );

-- Owner can remove anyone; members can remove themselves (leave)
CREATE POLICY "ledger_members_delete" ON public.ledger_members FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM ledger_members lm WHERE lm.ledger_id = ledger_id AND lm.user_id = auth.uid() AND lm.role = 'owner')
    OR user_id = auth.uid()
  );

-- ledger_budget_additions --
CREATE POLICY "ledger_budget_additions_select" ON public.ledger_budget_additions FOR SELECT TO authenticated
  USING (is_ledger_member(ledger_id));

CREATE POLICY "ledger_budget_additions_insert" ON public.ledger_budget_additions FOR INSERT TO authenticated
  WITH CHECK (is_ledger_owner_or_admin(ledger_id) AND added_by = auth.uid());

-- ledger_expenses --
CREATE POLICY "ledger_expenses_select" ON public.ledger_expenses FOR SELECT TO authenticated
  USING (is_ledger_member(ledger_id));

CREATE POLICY "ledger_expenses_insert" ON public.ledger_expenses FOR INSERT TO authenticated
  WITH CHECK (is_ledger_member(ledger_id) AND user_id = auth.uid());

-- Members can edit/delete only their OWN pending expenses;
-- Owner/admin can modify any expense
CREATE POLICY "ledger_expenses_update" ON public.ledger_expenses FOR UPDATE TO authenticated
  USING (
    is_ledger_owner_or_admin(ledger_id)
    OR (user_id = auth.uid() AND status = 'pending')
  );

CREATE POLICY "ledger_expenses_delete" ON public.ledger_expenses FOR DELETE TO authenticated
  USING (
    is_ledger_owner_or_admin(ledger_id)
    OR (user_id = auth.uid() AND status = 'pending')
  );

-- ledger_monthly_budgets --
CREATE POLICY "ledger_monthly_budgets_select" ON public.ledger_monthly_budgets FOR SELECT TO authenticated
  USING (is_ledger_member(ledger_id));

CREATE POLICY "ledger_monthly_budgets_insert" ON public.ledger_monthly_budgets FOR INSERT TO authenticated
  WITH CHECK (is_ledger_owner_or_admin(ledger_id));

CREATE POLICY "ledger_monthly_budgets_update" ON public.ledger_monthly_budgets FOR UPDATE TO authenticated
  USING (is_ledger_owner_or_admin(ledger_id));

-- ledger_invites --
-- Members see their ledger's invites; token lookup open to any authenticated user
CREATE POLICY "ledger_invites_select" ON public.ledger_invites FOR SELECT TO authenticated
  USING (is_ledger_member(ledger_id) OR true);

CREATE POLICY "ledger_invites_insert" ON public.ledger_invites FOR INSERT TO authenticated
  WITH CHECK (is_ledger_owner_or_admin(ledger_id) AND invited_by = auth.uid());

CREATE POLICY "ledger_invites_update" ON public.ledger_invites FOR UPDATE TO authenticated
  USING (is_ledger_owner_or_admin(ledger_id) OR true);

CREATE POLICY "ledger_invites_delete" ON public.ledger_invites FOR DELETE TO authenticated
  USING (is_ledger_owner_or_admin(ledger_id));

-- ledger_activity --
CREATE POLICY "ledger_activity_select" ON public.ledger_activity FOR SELECT TO authenticated
  USING (is_ledger_member(ledger_id));

CREATE POLICY "ledger_activity_insert" ON public.ledger_activity FOR INSERT TO authenticated
  WITH CHECK (is_ledger_member(ledger_id) AND actor_id = auth.uid());

-- ============================================================
-- 8. Enable Realtime
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.ledgers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_budget_additions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_monthly_budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_activity;
