-- 1. Connections Table for friends/friend requests
CREATE TABLE public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(requester_id, receiver_id)
);

-- 2. Groups Table for grouped expense tracking (trips, apartments, etc)
CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Group Members Join Table 
CREATE TABLE public.group_members (
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY(group_id, user_id)
);

-- 4. Modifying existing Expenses Table to support groups and splitting strategies
ALTER TABLE public.expenses 
  ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN split_type TEXT DEFAULT 'equal' CHECK (split_type IN ('equal', 'exact', 'percentage', 'shares'));

-- 5. Expense Splits Table tracking individual amounts owed
CREATE TABLE public.expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_owed NUMERIC NOT NULL,
    has_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- --- RLS Security Policies ---

-- Enable RLS
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Connections
CREATE POLICY "Users can view their own connections" 
ON public.connections FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can insert connections as requester" 
ON public.connections FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update their connections" 
ON public.connections FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- Groups
CREATE POLICY "Users can view groups they belong to" 
ON public.groups FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_members.group_id = groups.id AND group_members.user_id = auth.uid()));

CREATE POLICY "Authenticated users can create groups" 
ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group creators can update their groups" 
ON public.groups FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Group creators can delete their groups" 
ON public.groups FOR DELETE USING (auth.uid() = created_by);

-- Group Members
CREATE POLICY "Users can view members of their groups" 
ON public.group_members FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()));

CREATE POLICY "Group creators or the user themselves can insert members" 
ON public.group_members FOR INSERT 
WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.groups WHERE groups.id = group_members.group_id AND groups.created_by = auth.uid())
);

CREATE POLICY "Group creators or the user themselves can remove members" 
ON public.group_members FOR DELETE 
USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.groups WHERE groups.id = group_members.group_id AND groups.created_by = auth.uid())
);

-- Expanded capability for Expenses Table 
-- (Assuming standard RLS exists showing users their own expenses, 
-- we add grants for group members and split targets)
CREATE POLICY "Users can view group expenses"
ON public.expenses FOR SELECT
USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_members.group_id = expenses.group_id AND group_members.user_id = auth.uid()));

CREATE POLICY "Users can view expenses they represent a split in"
ON public.expenses FOR SELECT
USING (EXISTS (SELECT 1 FROM public.expense_splits WHERE expense_splits.expense_id = expenses.id AND expense_splits.user_id = auth.uid()));

-- Expense Splits
CREATE POLICY "Users can view their splits or splits for expenses they created" 
ON public.expense_splits FOR SELECT 
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND expenses.user_id = auth.uid()));

CREATE POLICY "Users can insert splits for expenses they created" 
ON public.expense_splits FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND expenses.user_id = auth.uid()));

CREATE POLICY "Users can update their splits (pay) or splits for their expenses" 
ON public.expense_splits FOR UPDATE 
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND expenses.user_id = auth.uid()));

CREATE POLICY "Users can delete splits for expenses they created" 
ON public.expense_splits FOR DELETE 
USING (EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND expenses.user_id = auth.uid()));
