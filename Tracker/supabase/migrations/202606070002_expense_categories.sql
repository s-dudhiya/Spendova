-- Custom expense categories for personal and group expense organization.
-- The existing expenses.category text field remains untouched for legacy expense names.

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'group')),
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.expense_categories
  ADD CONSTRAINT expense_categories_scope_check CHECK (
    (type = 'personal' AND user_id IS NOT NULL AND group_id IS NULL)
    OR
    (type = 'group' AND group_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_personal_active_name_idx
ON public.expense_categories (user_id, lower(name))
WHERE type = 'personal' AND is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_group_active_name_idx
ON public.expense_categories (group_id, lower(name))
WHERE type = 'group' AND is_deleted = false;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_category_id_idx
ON public.expenses (category_id);

CREATE INDEX IF NOT EXISTS expense_categories_personal_lookup_idx
ON public.expense_categories (user_id, is_deleted, name)
WHERE type = 'personal';

CREATE INDEX IF NOT EXISTS expense_categories_group_lookup_idx
ON public.expense_categories (group_id, is_deleted, name)
WHERE type = 'group';

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their personal categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can create their personal categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can update their personal categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can read group categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Group members can create group categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Group creators and category creators can update group categories" ON public.expense_categories;

CREATE POLICY "Users can read their personal categories"
ON public.expense_categories FOR SELECT
USING (type = 'personal' AND user_id = auth.uid());

CREATE POLICY "Users can create their personal categories"
ON public.expense_categories FOR INSERT
WITH CHECK (
  type = 'personal'
  AND user_id = auth.uid()
  AND created_by = auth.uid()
  AND group_id IS NULL
);

CREATE POLICY "Users can update their personal categories"
ON public.expense_categories FOR UPDATE
USING (type = 'personal' AND user_id = auth.uid())
WITH CHECK (
  type = 'personal'
  AND user_id = auth.uid()
  AND created_by = auth.uid()
  AND group_id IS NULL
);

CREATE POLICY "Users can read group categories"
ON public.expense_categories FOR SELECT
USING (type = 'group' AND public.is_group_member(group_id));

CREATE POLICY "Group members can create group categories"
ON public.expense_categories FOR INSERT
WITH CHECK (
  type = 'group'
  AND group_id IS NOT NULL
  AND created_by = auth.uid()
  AND public.is_group_member(group_id)
);

CREATE POLICY "Group creators and category creators can update group categories"
ON public.expense_categories FOR UPDATE
USING (
  type = 'group'
  AND public.is_group_member(group_id)
  AND (created_by = auth.uid() OR public.is_group_creator(group_id))
)
WITH CHECK (
  type = 'group'
  AND group_id IS NOT NULL
  AND public.is_group_member(group_id)
  AND (created_by = auth.uid() OR public.is_group_creator(group_id))
);
