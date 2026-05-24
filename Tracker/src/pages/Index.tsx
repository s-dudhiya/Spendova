import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Bell,
  Car,
  Check,
  ChevronRight,
  CircleDollarSign,
  Coffee,
  Copy,
  Crown,
  Filter,
  Home,
  Link as LinkIcon,
  MoreVertical,
  Moon,
  Pencil,
  Plus,
  Search,
  Split,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  UserMinus,
  UserPlus,
  UtensilsCrossed,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY } from "@/hooks/useTheme";

type TabKey = "home" | "split" | "personal" | "tiffin";
type ContentKey = TabKey | "profile";
type Theme = "light" | "dark";
type SplitStrategy = "equal" | "exact" | "percentage";
type ModalType =
  | "notifications"
  | "add-expense"
  | "log-tiffin"
  | "chart-details"
  | "edit-expense"
  | "delete-expense"
  | "clear-expense"
  | "create-group"
  | "group-details"
  | "edit-group"
  | "delete-group"
  | "invite-members"
  | "group-expense"
  | "choose-friend-expense"
  | "choose-group-expense"
  | "friend-details"
  | "add-friend"
  | "remove-friend"
  | "friend-requests"
  | "settle-up"
  | "logout"
  | "saved"
  | null;

type ModalState = { type: ModalType; item?: string };

type Profile = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  email?: string | null;
};

type ExpenseSplitRow = {
  id: string;
  user_id: string;
  amount_owed: number;
  amount_paid?: number | null;
  has_paid: boolean | null;
  profiles?: Profile | null;
};

type ExpenseRow = {
  id: string;
  user_id: string;
  paid_by: string;
  amount: number;
  category: string | null;
  note: string | null;
  status: string | null;
  split_type: string | null;
  group_id: string | null;
  created_at: string | null;
  expense_splits?: ExpenseSplitRow[];
  profiles?: Profile | null;
  payer_profile?: Profile | null;
};

type ConnectionRow = {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string | null;
  profiles: Profile;
};

type GroupMemberRow = {
  user_id: string;
  joined_at: string | null;
  profiles: Profile;
};

type GroupRow = {
  id: string;
  name: string;
  emoji?: string | null;
  description?: string | null;
  created_by: string;
  created_at: string | null;
  group_members: GroupMemberRow[];
};

type InviteRow = {
  id: string;
  email: string;
  token: string;
  status: string;
  created_at: string;
};

type SplitSettlementRow = {
  id: string;
  group_id: string | null;
  expense_id?: string | null;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  note: string | null;
  created_at: string;
  from_profile?: Profile | null;
  to_profile?: Profile | null;
};

type ExpensePayload = {
  user_id: string;
  paid_by: string;
  category: string;
  amount: number;
  note?: string | null;
  status: string;
  split_type: string;
  group_id?: string | null;
  created_at: string;
};

type ConnectionQueryRow = Omit<ConnectionRow, "profiles"> & { profiles: Profile | null };
type GroupQueryRow = GroupRow;

type FriendProfile = Profile & {
  connection_id: string;
  requester_id: string;
  receiver_id: string;
};

type AppData = {
  expenses: ExpenseRow[];
  friends: FriendProfile[];
  incomingRequests: ConnectionRow[];
  outgoingRequests: ConnectionRow[];
  groups: GroupRow[];
  groupInvites: Record<string, InviteRow[]>;
  settlements: SplitSettlementRow[];
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "Home", icon: Home },
  { key: "split", label: "Split", icon: Split },
  { key: "personal", label: "Personal", icon: WalletCards },
  { key: "tiffin", label: "Tiffin", icon: UtensilsCrossed },
];

const emojiChoices = ["Home", "Trip", "Food", "Party", "Beach", "Movie", "Sports", "Books", "Work", "Cart"];
const emojiMap: Record<string, string> = {
  Home: "🏠",
  Trip: "✈️",
  Food: "🍽️",
  Party: "🎉",
  Beach: "🏖️",
  Movie: "🎬",
  Sports: "⚽",
  Books: "📚",
  Work: "💼",
  Cart: "🛒",
};

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacy === "light" || legacy === "dark") {
    window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return legacy;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const money = (amount: number) => {
  const value = Number.isFinite(amount) ? amount : 0;
  const hasPaise = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(value);
};
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Today";
const displayName = (profile?: Profile | null) => profile?.full_name || profile?.username || profile?.email || "User";
const toPaise = (amount: number) => Math.round((Number.isFinite(amount) ? amount : 0) * 100);
const fromPaise = (paise: number) => Number((paise / 100).toFixed(2));
const allocateEqualSplitDebts = (amount: number, participantIds: string[], payerId: string) => {
  const totalPaise = toPaise(amount);
  const count = participantIds.length;
  if (!count) return [];
  const baseShare = Math.floor(totalPaise / count);
  let remainder = totalPaise % count;
  return participantIds
    .map((user_id) => {
      const share = baseShare + (remainder > 0 ? 1 : 0);
      remainder -= 1;
      return { user_id, amount_owed: fromPaise(share) };
    })
    .filter((split) => split.user_id !== payerId && split.amount_owed > 0);
};
const filterExpensesByRange = (expenses: ExpenseRow[], range: "week" | "month" | "year") => {
  const now = new Date();
  const start = new Date(now);
  if (range === "week") start.setDate(now.getDate() - 7);
  if (range === "month") start.setMonth(now.getMonth() - 1);
  if (range === "year") start.setFullYear(now.getFullYear() - 1);
  return expenses.filter((expense) => !expense.created_at || new Date(expense.created_at) >= start);
};

const StatusPill = ({ status }: { status: string }) => {
  const cleared = ["cleared", "paid", "accepted", "settled"].includes(status.toLowerCase());
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cleared ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{status}</span>;
};

const SectionHeader = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
    {action ? <button onClick={onAction} className="text-sm font-semibold text-primary">{action}</button> : null}
  </div>
);

type DateFilter = "all" | "today" | "week" | "month" | "year";
type AmountSort = "newest" | "oldest" | "amount-desc" | "amount-asc";

const filterByDate = (value: string | null | undefined, filter: DateFilter) => {
  if (filter === "all") return true;
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return false;
  if (filter === "today") return date.toDateString() === now.toDateString();
  const start = new Date(now);
  if (filter === "week") start.setDate(now.getDate() - 7);
  if (filter === "month") start.setMonth(now.getMonth() - 1);
  if (filter === "year") start.setFullYear(now.getFullYear() - 1);
  return date >= start;
};

const sortByDateOrAmount = <T,>(items: T[], sort: AmountSort, getDate: (item: T) => string | null | undefined, getAmount: (item: T) => number) => {
  return [...items].sort((a, b) => {
    if (sort === "amount-desc") return getAmount(b) - getAmount(a);
    if (sort === "amount-asc") return getAmount(a) - getAmount(b);
    const dateA = new Date(getDate(a) || 0).getTime();
    const dateB = new Date(getDate(b) || 0).getTime();
    return sort === "oldest" ? dateA - dateB : dateB - dateA;
  });
};

const FilterTrigger = ({ count, onClick }: { count: number; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-bold text-primary">
    <Filter className="size-3.5" />Filter{count > 0 ? ` (${count})` : ""}
  </button>
);

const FilterSheet = ({ open, onOpenChange, title, onClear, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; onClear: () => void; children: ReactNode }) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="mx-auto max-w-3xl rounded-t-3xl border-border bg-card px-4 pb-5">
      <DrawerHeader className="px-0 pb-2 text-left">
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>Filters update the list immediately.</DrawerDescription>
      </DrawerHeader>
      <div className="space-y-4">
        {children}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="quiet" className="flex-1" onClick={onClear}>Clear filters</Button>
          <Button type="button" className="flex-1" onClick={() => onOpenChange(false)}>Apply</Button>
        </div>
      </div>
    </DrawerContent>
  </Drawer>
);

const FilterField = ({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) => (
  <label className="block text-sm font-semibold text-foreground">
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-full border border-input bg-background px-4 py-3 text-sm font-medium">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
);

const FilterEmptyState = ({ onClear }: { onClear: () => void }) => (
  <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
    <p className="text-sm font-medium text-muted-foreground">No results match your filters.</p>
    <Button type="button" variant="quiet" className="mt-4" onClick={onClear}>Clear filters</Button>
  </div>
);

const Field = ({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
}) => (
  <label className="block text-sm font-semibold text-foreground">
    {label}
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-full border border-input bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" placeholder={placeholder} />
    {hint ? <span className="mt-1 block text-xs font-medium text-muted-foreground">{hint}</span> : null}
  </label>
);

const Textarea = ({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (value: string) => void }) => (
  <label className="block text-sm font-semibold text-foreground">
    {label}
    <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" placeholder={placeholder} />
  </label>
);

const AppHeader = ({ title, theme, onThemeToggle, onProfile, openModal }: { title: string; theme: Theme; onThemeToggle: () => void; onProfile: () => void; openModal: (type: ModalType, item?: string) => void }) => (
  <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
    <div className="mx-auto flex max-w-3xl items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Spendova</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => openModal("notifications")} className="grid size-10 place-items-center rounded-full bg-card text-muted-foreground shadow-soft" aria-label="Notifications">
          <Bell className="size-4" />
        </button>
        <button onClick={onThemeToggle} className="grid size-10 place-items-center rounded-full bg-card text-foreground shadow-soft" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button onClick={onProfile} className="grid size-10 place-items-center rounded-full bg-card text-foreground shadow-soft" aria-label="Profile">
          <User className="size-4" />
        </button>
      </div>
    </div>
  </header>
);

function useSpendovaData(userId?: string) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AppData>({
    expenses: [],
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    groups: [],
    groupInvites: {},
    settlements: [],
  });

  const refresh = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [expensesRes, reqRes, recRes, groupsRes, settlementsRes] = await Promise.all([
        supabase
          .from("expenses")
          .select(`
            id, user_id, paid_by, amount, category, note, status, split_type, group_id, created_at,
            profiles!expenses_user_id_fkey(user_id, full_name, username),
            payer_profile:profiles!expenses_paid_by_fkey(user_id, full_name, username),
            expense_splits(id, user_id, amount_owed, amount_paid, has_paid, profiles!expense_splits_user_id_fkey(user_id, full_name, username))
          `)
          .order("created_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id, requester_id, receiver_id, status, created_at, profiles!connections_receiver_id_fkey(user_id, full_name, username)")
          .eq("requester_id", userId),
        supabase
          .from("connections")
          .select("id, requester_id, receiver_id, status, created_at, profiles!connections_requester_id_fkey(user_id, full_name, username)")
          .eq("receiver_id", userId),
        supabase
          .from("groups")
          .select("id, name, emoji, description, created_by, created_at, group_members(user_id, joined_at, profiles!group_members_user_id_fkey(user_id, full_name, username))")
          .order("created_at", { ascending: false }),
        supabase
          .from("split_settlements" as never)
          .select("id, group_id, expense_id, from_user_id, to_user_id, amount, note, created_at, from_profile:profiles!split_settlements_from_user_id_fkey(user_id, full_name, username), to_profile:profiles!split_settlements_to_user_id_fkey(user_id, full_name, username)")
          .order("created_at", { ascending: false }),
      ]);

      if (expensesRes.error) throw expensesRes.error;
      if (reqRes.error) throw reqRes.error;
      if (recRes.error) throw recRes.error;
      if (groupsRes.error) throw groupsRes.error;
      if (settlementsRes.error) console.warn("Could not load settlement history", settlementsRes.error);

      const requested = ((reqRes.data || []) as unknown as ConnectionQueryRow[]).map((row) => ({ ...row, profiles: row.profiles || { user_id: "", full_name: null, username: null } })) as ConnectionRow[];
      const received = ((recRes.data || []) as unknown as ConnectionQueryRow[]).map((row) => ({ ...row, profiles: row.profiles || { user_id: "", full_name: null, username: null } })) as ConnectionRow[];
      const accepted = [...requested, ...received].filter((row) => row.status === "accepted");

      const groupInvites: Record<string, InviteRow[]> = {};
      await Promise.all(((groupsRes.data || []) as unknown as GroupQueryRow[]).map(async (group) => {
        const { data: invites } = await supabase
          .from("group_invites" as never)
          .select("id, email, token, status, created_at")
          .eq("group_id", group.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        groupInvites[group.id] = (invites || []) as InviteRow[];
      }));

      setData({
        expenses: (expensesRes.data || []) as unknown as ExpenseRow[],
        friends: accepted.map((row) => ({
          ...row.profiles,
          connection_id: row.id,
          requester_id: row.requester_id,
          receiver_id: row.receiver_id,
        })),
        incomingRequests: received.filter((row) => row.status === "pending"),
        outgoingRequests: requested.filter((row) => row.status === "pending"),
        groups: (groupsRes.data || []) as unknown as GroupRow[],
        groupInvites,
        settlements: settlementsRes.error ? [] : (settlementsRes.data || []) as unknown as SplitSettlementRow[],
      });
    } catch (error: unknown) {
      toast({ title: "Could not load data", description: error instanceof Error ? error.message : "Unexpected error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // refresh is intentionally not a dependency; it is recreated with the latest user/toast state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { data, loading, refresh };
}

function getExpenseShare(expense: ExpenseRow, userId: string) {
  const isPayer = expense.paid_by === userId;
  if (isPayer) {
    const owedByOthers = expense.expense_splits?.reduce((sum, split) => sum + Number(split.amount_owed || 0), 0) || 0;
    return expense.expense_splits?.length ? expense.amount - owedByOthers : expense.amount;
  }
  return expense.expense_splits?.find((split) => split.user_id === userId)?.amount_owed || 0;
}

function isPersonalOnlyExpense(expense: ExpenseRow) {
  return !expense.group_id
    && expense.category !== "tiffin"
    && expense.category !== "delivery"
    && (!expense.expense_splits || expense.expense_splits.length === 0);
}

function splitRemaining(split?: ExpenseSplitRow) {
  if (!split) return 0;
  const paid = Number(split.amount_paid || (split.has_paid ? split.amount_owed : 0) || 0);
  return Math.max(Number(split.amount_owed || 0) - paid, 0);
}

function getExpenseSettlementState(expense: ExpenseRow, relevantSplits = expense.expense_splits || []) {
  if (isPersonalOnlyExpense(expense)) {
    const cleared = expense.status === "cleared";
    return {
      originalAmount: Number(expense.amount || 0),
      totalOwed: Number(expense.amount || 0),
      totalPaid: cleared ? Number(expense.amount || 0) : 0,
      remainingAmount: cleared ? 0 : Number(expense.amount || 0),
      status: cleared ? "cleared" as const : "pending" as const,
    };
  }
  const totalOwed = relevantSplits.reduce((sum, split) => sum + Number(split.amount_owed || 0), 0);
  const totalPaid = relevantSplits.reduce((sum, split) => sum + Math.min(Number(split.amount_paid || (split.has_paid ? split.amount_owed : 0) || 0), Number(split.amount_owed || 0)), 0);
  const remainingAmount = Math.max(totalOwed - totalPaid, 0);
  const status = remainingAmount <= 0.009 ? "cleared" as const : totalPaid > 0 ? "partial" as const : "pending" as const;
  return { originalAmount: Number(expense.amount || 0), totalOwed, totalPaid, remainingAmount, status };
}

function getSplitExpenseDisplayStatus(expense: ExpenseRow, currentUserId: string) {
  if (expense.paid_by === currentUserId) {
    return getExpenseSettlementState(expense, (expense.expense_splits || []).filter((split) => split.user_id !== currentUserId));
  }
  const mySplit = expense.expense_splits?.find((split) => split.user_id === currentUserId);
  return getExpenseSettlementState(expense, mySplit ? [mySplit] : []);
}

function getFriendNetSettled(expense: ExpenseRow, currentUserId: string, allExpenses: ExpenseRow[], settlements: SplitSettlementRow[]) {
  if (expense.group_id) return false;
  const otherSplit = (expense.expense_splits || []).find((split) => split.user_id !== currentUserId);
  const friendId = expense.paid_by === currentUserId ? otherSplit?.user_id : expense.paid_by;
  if (!friendId || friendId === currentUserId) return false;
  const balances = buildDebtBalances(allExpenses, settlements, { currentUserId, friendId, groupId: null });
  const net = balances.reduce((sum, balance) => {
    if (balance.toUserId === currentUserId) return sum + balance.amount;
    if (balance.fromUserId === currentUserId) return sum - balance.amount;
    return sum;
  }, 0);
  return Math.abs(net) <= 0.009;
}

function getPersonalExpenseDisplay(expense: ExpenseRow, currentUserId: string, groups: GroupRow[], friends: FriendProfile[], allExpenses: ExpenseRow[], settlements: SplitSettlementRow[]) {
  const personalOnly = isPersonalOnlyExpense(expense);
  if (personalOnly) {
    const state = getExpenseSettlementState(expense);
    return {
      amount: Number(expense.amount || 0),
      status: state.status,
      context: expense.note || "",
      canClear: expense.status !== "cleared",
      remainingAmount: state.remainingAmount,
      originalAmount: state.originalAmount,
    };
  }

  const payerName = expense.paid_by === currentUserId
    ? "You"
    : displayName(expense.payer_profile || friends.find((friend) => friend.user_id === expense.paid_by));
  const otherSplits = (expense.expense_splits || []).filter((split) => split.user_id !== currentUserId);
  const otherRemaining = otherSplits.reduce((sum, split) => sum + splitRemaining(split), 0);
  const source = expense.group_id ? "Group" : "Split";
  const friendNetSettled = getFriendNetSettled(expense, currentUserId, allExpenses, settlements);

  if (expense.paid_by === currentUserId) {
    const group = groups.find((item) => item.id === expense.group_id);
    const state = getSplitExpenseDisplayStatus(expense, currentUserId);
    const receivableImpact = otherSplits.reduce((sum, split) => sum + Number(split.amount_owed || 0), 0);
    const context = expense.group_id
      ? `${source} · You paid${group?.name ? ` · ${group.name}` : ""}`
      : `${source} · You paid`;
    return { amount: receivableImpact, status: friendNetSettled ? "cleared" as const : state.status, context, canClear: false, remainingAmount: friendNetSettled ? 0 : otherRemaining, originalAmount: state.originalAmount };
  }

  const mySplit = expense.expense_splits?.find((split) => split.user_id === currentUserId);
  const state = getSplitExpenseDisplayStatus(expense, currentUserId);
  const myRemaining = splitRemaining(mySplit);
  const amount = Number(mySplit?.amount_owed || getExpenseShare(expense, currentUserId) || expense.amount || 0);
  return {
    amount,
    status: friendNetSettled ? "cleared" as const : state.status,
    context: `${source} · ${payerName} paid`,
    canClear: false,
    remainingAmount: friendNetSettled ? 0 : myRemaining,
    originalAmount: state.originalAmount,
  };
}

type DebtBalance = { fromUserId: string; toUserId: string; fromName: string; toName: string; amount: number };

function getProfileName(userId: string, profiles: Record<string, string>, currentUserId?: string) {
  if (currentUserId && userId === currentUserId) return "You";
  return profiles[userId] || "Unknown";
}

function buildDebtBalances(expenses: ExpenseRow[], _settlements: SplitSettlementRow[], options: { currentUserId?: string; groupId?: string | null; friendId?: string } = {}) {
  const profiles: Record<string, string> = {};
  const pairTotals: Record<string, number> = {};
  const addName = (profile?: Profile | null) => {
    if (profile?.user_id) profiles[profile.user_id] = displayName(profile);
  };
  const addDebt = (from: string, to: string, amount: number) => {
    if (!from || !to || from === to || Math.abs(amount) < 0.01) return;
    const key = `${from}|${to}`;
    pairTotals[key] = (pairTotals[key] || 0) + amount;
  };

  expenses.forEach((expense) => {
    if (options.groupId !== undefined && expense.group_id !== options.groupId) return;
    addName(expense.payer_profile);
    addName(expense.profiles);
    expense.expense_splits?.forEach((split) => {
      if (Number(split.amount_paid || 0) >= Number(split.amount_owed || 0) || split.has_paid) return;
      if (options.friendId && expense.paid_by !== options.friendId && split.user_id !== options.friendId) return;
      addName(split.profiles);
      addDebt(split.user_id, expense.paid_by, Math.max(Number(split.amount_owed || 0) - Number(split.amount_paid || 0), 0));
    });
  });

  const normalized: Record<string, number> = {};
  Object.entries(pairTotals).forEach(([key, amount]) => {
    const [from, to] = key.split("|");
    const reverseKey = `${to}|${from}`;
    if (normalized[key] !== undefined || normalized[reverseKey] !== undefined) return;
    const net = amount - (pairTotals[reverseKey] || 0);
    if (Math.abs(net) < 0.01) return;
    if (net > 0) normalized[key] = net;
    else normalized[reverseKey] = Math.abs(net);
  });

  return Object.entries(normalized).map(([key, amount]) => {
    const [fromUserId, toUserId] = key.split("|");
    return {
      fromUserId,
      toUserId,
      fromName: getProfileName(fromUserId, profiles, options.currentUserId),
      toName: getProfileName(toUserId, profiles, options.currentUserId),
      amount: Number(amount.toFixed(2)),
    };
  });
}

function getSummary(expenses: ExpenseRow[], userId: string, settlements: SplitSettlementRow[] = []) {
  let totalLent = 0;
  let totalOwed = 0;
  let personal = 0;
  let personalPending = 0;
  let personalCleared = 0;
  let tiffinPending = 0;
  let tiffinCleared = 0;

  expenses.forEach((expense) => {
    const isFood = expense.category === "tiffin" || expense.category === "delivery";
    const isPayer = expense.paid_by === userId;
    const mySplit = expense.expense_splits?.find((split) => split.user_id === userId);
    const personalOnly = isPersonalOnlyExpense(expense);
    const otherSplits = (expense.expense_splits || []).filter((split) => split.user_id !== userId);

    if (!isFood) {
      const share = personalOnly
        ? Number(expense.amount || 0)
        : isPayer
          ? otherSplits.reduce((sum, split) => sum + Number(split.amount_owed || 0), 0)
          : Number(mySplit?.amount_owed || 0);
      personal += share;
      const state = personalOnly ? getExpenseSettlementState(expense) : getSplitExpenseDisplayStatus(expense, userId);
      const friendNetSettled = !personalOnly && !expense.group_id && getFriendNetSettled(expense, userId, expenses, settlements);
      if (friendNetSettled || state.status === "cleared") personalCleared += share;
      else personalPending += share;
    } else if (expense.status === "cleared") {
      tiffinCleared += expense.amount;
    } else {
      tiffinPending += expense.amount;
    }
  });

  buildDebtBalances(expenses, settlements, { currentUserId: userId }).forEach((balance) => {
    if (balance.toUserId === userId) totalLent += balance.amount;
    if (balance.fromUserId === userId) totalOwed += balance.amount;
  });

  return { totalLent, totalOwed, net: totalLent - totalOwed, personal, personalPending, personalCleared, tiffinPending, tiffinCleared };
}

type ChartMode = "day" | "week" | "month" | "year" | "custom";
type ChartRange = "7d" | "30d" | "3m" | "6m" | "1y";

const expenseImpactForUser = (expense: ExpenseRow, userId: string) => Math.max(Number(getExpenseShare(expense, userId) || 0), 0);
const expenseSpendType = (expense: ExpenseRow) => {
  if (expense.category === "tiffin" || expense.category === "delivery") return "tiffin";
  if (expense.group_id) return "group";
  if (expense.expense_splits?.length) return "split";
  return "personal";
};

const getRangeStart = (range: ChartRange) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "7d") start.setDate(start.getDate() - 6);
  if (range === "30d") start.setDate(start.getDate() - 29);
  if (range === "3m") start.setMonth(start.getMonth() - 3);
  if (range === "6m") start.setMonth(start.getMonth() - 6);
  if (range === "1y") start.setFullYear(start.getFullYear() - 1);
  return start;
};

const bucketKey = (date: Date, mode: ChartMode) => {
  if (mode === "day") return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
  if (mode === "year") return `${date.getFullYear()}-${date.getMonth()}`;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const bucketLabel = (date: Date, mode: ChartMode) => {
  if (mode === "day") return date.toLocaleTimeString("en-IN", { hour: "numeric" });
  if (mode === "week") return date.toLocaleDateString("en-IN", { weekday: "short" });
  if (mode === "month" || mode === "custom") return String(date.getDate());
  return date.toLocaleDateString("en-IN", { month: "short" });
};

function buildSpendingChart(expenses: ExpenseRow[], userId: string, mode: ChartMode, range: ChartRange, customStart: string, customEnd: string) {
  const now = new Date();
  const start = mode === "custom" && customStart ? new Date(`${customStart}T00:00:00`) : getRangeStart(range);
  const end = mode === "custom" && customEnd ? new Date(`${customEnd}T23:59:59`) : now;
  const buckets = new Map<string, { label: string; value: number; date: Date }>();
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  while (cursor <= end) {
    const key = bucketKey(cursor, mode);
    buckets.set(key, { label: bucketLabel(cursor, mode), value: 0, date: new Date(cursor) });
    if (mode === "day") cursor.setHours(cursor.getHours() + 1);
    else if (mode === "year") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  expenses.forEach((expense) => {
    if (!expense.created_at) return;
    const date = new Date(expense.created_at);
    if (date < start || date > end) return;
    const key = bucketKey(date, mode);
    const existing = buckets.get(key) || { label: bucketLabel(date, mode), value: 0, date };
    existing.value += expenseImpactForUser(expense, userId);
    buckets.set(key, existing);
  });
  return [...buckets.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getSpendingAnalytics(expenses: ExpenseRow[], userId: string) {
  const totals = { personal: 0, split: 0, tiffin: 0, group: 0 };
  const byCategory: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let total = 0;
  expenses.forEach((expense) => {
    const impact = expenseImpactForUser(expense, userId);
    if (impact <= 0) return;
    const type = expenseSpendType(expense);
    totals[type] += impact;
    total += impact;
    const category = expense.category || type;
    byCategory[category] = (byCategory[category] || 0) + impact;
    const date = expense.created_at ? new Date(expense.created_at) : new Date();
    const dayKey = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const monthKey = date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    byDay[dayKey] = (byDay[dayKey] || 0) + impact;
    byMonth[monthKey] = (byMonth[monthKey] || 0) + impact;
  });
  const topEntry = (items: Record<string, number>, dir: "high" | "low") => Object.entries(items).sort((a, b) => dir === "high" ? b[1] - a[1] : a[1] - b[1])[0];
  const days = Math.max(Object.keys(byDay).length, 1);
  const months = Math.max(Object.keys(byMonth).length, 1);
  const weekly = total / Math.max(days / 7, 1);
  const currentMonth = new Date();
  const previousMonth = new Date(currentMonth);
  previousMonth.setMonth(currentMonth.getMonth() - 1);
  const currentMonthTotal = expenses.filter((expense) => expense.created_at && new Date(expense.created_at).getMonth() === currentMonth.getMonth() && new Date(expense.created_at).getFullYear() === currentMonth.getFullYear()).reduce((sum, expense) => sum + expenseImpactForUser(expense, userId), 0);
  const previousMonthTotal = expenses.filter((expense) => expense.created_at && new Date(expense.created_at).getMonth() === previousMonth.getMonth() && new Date(expense.created_at).getFullYear() === previousMonth.getFullYear()).reduce((sum, expense) => sum + expenseImpactForUser(expense, userId), 0);
  const trend = previousMonthTotal > 0 ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100 : currentMonthTotal > 0 ? 100 : 0;
  return { total, totals, highestCategory: topEntry(byCategory, "high"), lowestCategory: topEntry(byCategory, "low"), averageDaily: total / days, averageWeekly: weekly, averageMonthly: total / months, topDay: topEntry(byDay, "high"), topMonth: topEntry(byMonth, "high"), trend };
}

function computeGroupBalances(expenses: ExpenseRow[], settlements: SplitSettlementRow[], group: GroupRow, currentUserId?: string) {
  const balances = buildDebtBalances(expenses, settlements, { currentUserId, groupId: group.id });
  const memberNames = Object.fromEntries(group.group_members.map((member) => [member.user_id, member.user_id === currentUserId ? "You" : displayName(member.profiles)]));
  return balances.map((balance) => ({ ...balance, fromName: memberNames[balance.fromUserId] || balance.fromName, toName: memberNames[balance.toUserId] || balance.toName }));
}

const HomeView = ({ expenses, settlements, userId, setTab, openModal }: { expenses: ExpenseRow[]; settlements: SplitSettlementRow[]; userId: string; setTab: (tab: TabKey) => void; openModal: (type: ModalType, item?: string) => void }) => {
  const [range, setRange] = useState<"week" | "month" | "year">("month");
  const [status, setStatus] = useState<"all" | "pending" | "cleared">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("week");
  const [chartRange, setChartRange] = useState<ChartRange>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const clear = () => { setRange("month"); setStatus("all"); };
  const activeFilterCount = (range !== "month" ? 1 : 0) + (status !== "all" ? 1 : 0);
  const rangedExpenses = filterExpensesByRange(expenses, range);
  const filteredExpenses = rangedExpenses.filter((expense) => status === "all" || expense.status === status);
  const summary = getSummary(filteredExpenses, userId, settlements);
  const recent = filteredExpenses.slice(0, 3);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (value: string | null | undefined, date: Date) => {
    if (!value) return false;
    const itemDate = new Date(value);
    return itemDate.getFullYear() === date.getFullYear() && itemDate.getMonth() === date.getMonth() && itemDate.getDate() === date.getDate();
  };
  const daySpend = (date: Date) => expenses
    .filter((expense) => isSameDay(expense.created_at, date))
    .reduce((sum, expense) => sum + getExpenseShare(expense, userId), 0);
  const todayTotalSpend = daySpend(today);
  const yesterdayTotalSpend = daySpend(yesterday);
  const rawTrend = yesterdayTotalSpend > 0 ? ((todayTotalSpend - yesterdayTotalSpend) / yesterdayTotalSpend) * 100 : todayTotalSpend > 0 ? 100 : 0;
  const trendDirection = yesterdayTotalSpend === 0 && todayTotalSpend > 0 ? "up" : rawTrend > 0 ? "up" : rawTrend < 0 ? "down" : "flat";
  const trendLabel = `${rawTrend > 0 ? "+" : ""}${Number(rawTrend.toFixed(1)).toString().replace(".0", "")}%`;
  const TrendIcon = trendDirection === "up" ? TrendingUp : trendDirection === "down" ? TrendingDown : ArrowRight;
  const trendClass = trendDirection === "up" ? "bg-warning/15 text-warning" : trendDirection === "down" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground";
  const chartData = useMemo(() => buildSpendingChart(expenses, userId, chartMode, chartRange, customStart, customEnd), [expenses, userId, chartMode, chartRange, customStart, customEnd]);
  const chartMax = Math.max(...chartData.map((item) => item.value), 1);

  return (
    <main className="space-y-6">
      <section className="rounded-[1.4rem] bg-card p-5 shadow-panel">
        <p className="text-sm font-medium text-muted-foreground">Net balance</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div><p className="text-4xl font-bold tracking-tight text-foreground">{money(Math.abs(summary.net))}</p><p className="mt-1 text-sm text-muted-foreground">Across personal, tiffin, and splits</p></div>
          <span title="Compared with yesterday" className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${trendClass}`} aria-label={`${trendLabel} compared with yesterday`}><TrendIcon className="size-3.5" />{trendLabel}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 items-start gap-3">
          <button onClick={() => openModal("chart-details")} className="grid content-start rounded-2xl bg-elevated p-4 text-left shadow-soft"><p className="text-xs font-semibold leading-none text-muted-foreground">Total lent</p><p className="mt-2 text-xl font-bold leading-none text-foreground">{money(summary.totalLent)}</p></button>
          <button onClick={() => openModal("chart-details")} className="grid content-start rounded-2xl bg-elevated p-4 text-left shadow-soft"><p className="text-xs font-semibold leading-none text-muted-foreground">Total owed</p><p className="mt-2 text-xl font-bold leading-none text-foreground">{money(summary.totalOwed)}</p></button>
        </div>
      </section>

      <section>
        <SectionHeader title="Quick actions" />
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => openModal("add-expense")} className="h-12 shadow-primary-action"><Plus />Add Expense</Button>
          <Button onClick={() => openModal("log-tiffin")} variant="quiet" className="h-12"><CircleDollarSign />Log Tiffin</Button>
        </div>
      </section>

      <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
        <SectionHeader title="Spending chart" action="Details" onAction={() => openModal("chart-details")} />
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-full bg-elevated p-1">
          {(["day", "week", "month", "year", "custom"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setChartMode(mode)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize ${chartMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{mode}</button>
          ))}
        </div>
        <div className="mb-3 flex gap-1 overflow-x-auto">
          {[
            ["7d", "Last 7 Days"],
            ["30d", "Last 30 Days"],
            ["3m", "Last 3 Months"],
            ["6m", "Last 6 Months"],
            ["1y", "Last Year"],
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setChartRange(value as ChartRange)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${chartRange === value ? "bg-primary text-primary-foreground" : "bg-elevated text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
        {chartMode === "custom" ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="rounded-full border border-input bg-background px-3 py-2 text-xs font-semibold" />
            <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="rounded-full border border-input bg-background px-3 py-2 text-xs font-semibold" />
          </div>
        ) : null}
        {chartData.every((item) => item.value <= 0) ? (
          <div className="grid h-32 place-items-center rounded-2xl bg-elevated p-4 text-center">
            <div><CircleDollarSign className="mx-auto mb-2 size-6 text-muted-foreground" /><p className="text-sm font-bold text-muted-foreground">No spending data available</p></div>
          </div>
        ) : (
          <>
            <button onClick={() => openModal("chart-details")} className="flex h-32 w-full items-end gap-2 overflow-x-auto rounded-2xl bg-elevated p-4" aria-label="Spending bar chart">
              {chartData.map((item) => (
                <span key={`${item.label}-${item.date.toISOString()}`} className="flex min-w-5 flex-1 flex-col items-center gap-2">
                  <span title={`${item.label}: ${money(item.value)}`} className="w-full rounded-full bg-primary/80" style={{ height: `${Math.max(8, (item.value / chartMax) * 100)}%` }} />
                </span>
              ))}
            </button>
            <div className="mt-3 flex justify-between gap-2 overflow-hidden text-xs font-medium text-muted-foreground">
              {chartData.slice(0, 6).map((item) => <span key={item.date.toISOString()} className="truncate">{item.label}</span>)}
            </div>
          </>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground">Recent activity</h2>
          <FilterTrigger count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
        </div>
        <div className="space-y-3">
          {recent.length === 0 ? (expenses.length === 0 ? <EmptyCard text="No activity yet." /> : <FilterEmptyState onClear={clear} />) : recent.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft">
              <div><h3 className="font-bold text-foreground">{expense.category || "Expense"}</h3><p className="text-sm text-muted-foreground">{dateLabel(expense.created_at)}</p></div>
              <div className="text-right"><p className="font-bold text-foreground">{money(expense.amount)}</p><StatusPill status={expense.status || "pending"} /></div>
            </div>
          ))}
        </div>
      </section>

      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Overview activity filters" onClear={clear}>
        <FilterField label="Date" value={range} onChange={(value) => setRange(value as "week" | "month" | "year")} options={[{ value: "week", label: "This week" }, { value: "month", label: "This month" }, { value: "year", label: "This year" }]} />
        <FilterField label="Status" value={status} onChange={(value) => setStatus(value as "all" | "pending" | "cleared")} options={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "cleared", label: "Cleared" }]} />
      </FilterSheet>

      <section>
        <SectionHeader title="Shortcuts" />
        <div className="space-y-3">
          {[
            { title: "Split", value: money(summary.totalLent + summary.totalOwed), icon: Split, tab: "split" as TabKey },
            { title: "Personal", value: money(summary.personal), icon: WalletCards, tab: "personal" as TabKey },
            { title: "Tiffin", value: money(summary.tiffinPending + summary.tiffinCleared), icon: UtensilsCrossed, tab: "tiffin" as TabKey },
          ].map((item) => <button key={item.title} onClick={() => setTab(item.tab)} className="flex w-full items-center justify-between rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel"><span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-elevated text-primary"><item.icon className="size-4" /></span><span><span className="block font-bold text-foreground">{item.title}</span><span className="text-sm text-muted-foreground">Current data</span></span></span><span className="flex items-center gap-2 font-bold text-foreground">{item.value}<ChevronRight className="size-4 text-muted-foreground" /></span></button>)}
        </div>
      </section>
    </main>
  );
};

const EmptyCard = ({ text }: { text: string }) => <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-medium text-muted-foreground">{text}</div>;

const PersonalView = ({ expenses, settlements, summary, currentUserId, groups, friends, openModal }: { expenses: ExpenseRow[]; settlements: SplitSettlementRow[]; summary: ReturnType<typeof getSummary>; currentUserId: string; groups: GroupRow[]; friends: FriendProfile[]; openModal: (type: ModalType, item?: string) => void }) => {
  const defaultFilters = { status: "all", date: "all", sort: "newest", category: "all" };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const personalExpenses = expenses.filter((expense) => expense.category !== "tiffin" && expense.category !== "delivery" && (expense.paid_by === currentUserId || expense.expense_splits?.some((split) => split.user_id === currentUserId)));
  const categories = Array.from(new Set(personalExpenses.map((expense) => expense.category || "Other"))).sort();
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== defaultFilters[key as keyof typeof defaultFilters]).length;
  const clearFilters = () => setFilters(defaultFilters);
  const visibleExpenses = sortByDateOrAmount(
    personalExpenses.filter((expense) => {
      const display = getPersonalExpenseDisplay(expense, currentUserId, groups, friends, expenses, settlements);
      const expenseStatus = display.status;
      if (filters.status !== "all" && expenseStatus !== filters.status) return false;
      if (filters.category !== "all" && (expense.category || "Other") !== filters.category) return false;
      return filterByDate(expense.created_at, filters.date as DateFilter);
    }),
    filters.sort as AmountSort,
    (expense) => expense.created_at,
    (expense) => Number(getPersonalExpenseDisplay(expense, currentUserId, groups, friends, expenses, settlements).amount || 0),
  );
  return (
    <main className="space-y-6">
      <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
        <p className="text-sm font-medium text-muted-foreground">Personal spend</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{money(summary.personal)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[["Total", money(summary.personal)], ["Pending", money(summary.personalPending)], ["Cleared", money(summary.personalCleared)]].map(([label, value]) => <div key={label} className="rounded-2xl bg-elevated p-3 shadow-soft"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold text-foreground">{value}</p></div>)}
        </div>
      </section>
      <section className="pb-16">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground">Personal expenses</h2>
          <FilterTrigger count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
        </div>
        <div className="space-y-3">
          {personalExpenses.length === 0 ? <EmptyCard text="No personal expenses yet." /> : visibleExpenses.length === 0 ? <FilterEmptyState onClear={clearFilters} /> : visibleExpenses.map((expense) => {
            const display = getPersonalExpenseDisplay(expense, currentUserId, groups, friends, expenses, settlements);
            return (
              <article key={expense.id} className="rounded-2xl bg-card p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-foreground">{expense.category || "Expense"}</h3>
                    {display.context ? <p className="mt-1 text-sm font-medium text-muted-foreground">{display.context}</p> : null}
                    <p className="mt-1 text-sm text-muted-foreground">{dateLabel(expense.created_at)}</p>
                  </div>
                  <div className="text-right"><p className="font-bold text-foreground">{money(display.amount)}</p><StatusPill status={display.status} /></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => openModal("edit-expense", expense.id)} variant="quiet" size="sm"><Pencil />Edit</Button>
                  <Button onClick={() => openModal("delete-expense", expense.id)} variant="quiet" size="sm"><Trash2 />Delete</Button>
                  {display.canClear && <Button onClick={() => openModal("clear-expense", expense.id)} variant="quiet" size="sm"><Check />Clear</Button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Personal expense filters" onClear={clearFilters}>
        <FilterField label="Status" value={filters.status} onChange={(status) => setFilters((current) => ({ ...current, status }))} options={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "cleared", label: "Cleared" }]} />
        <FilterField label="Date" value={filters.date} onChange={(date) => setFilters((current) => ({ ...current, date }))} options={[{ value: "all", label: "All dates" }, { value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }, { value: "year", label: "This year" }]} />
        <FilterField label="Sort" value={filters.sort} onChange={(sort) => setFilters((current) => ({ ...current, sort }))} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "amount-desc", label: "Amount high to low" }, { value: "amount-asc", label: "Amount low to high" }]} />
        <FilterField label="Category" value={filters.category} onChange={(category) => setFilters((current) => ({ ...current, category }))} options={[{ value: "all", label: "All categories" }, ...categories.map((category) => ({ value: category, label: category }))]} />
      </FilterSheet>
      <button onClick={() => openModal("add-expense")} className="fixed bottom-28 right-4 z-20 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-primary-action sm:right-8">
        <Plus className="size-4" />Add expense
      </button>
    </main>
  );
};

const SplitView = ({ data, currentUserId, openModal }: { data: AppData; currentUserId: string; openModal: (type: ModalType, item?: string) => void }) => {
  const navigate = useNavigate();
  const [subTab, setSubTabState] = useState<"friends" | "groups">(() => (sessionStorage.getItem("spendova-split-tab") === "groups" ? "groups" : "friends"));
  const [query, setQuery] = useState("");
  const defaultFilters = { balance: "all", sort: "highest" };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const summary = getSummary(data.expenses, currentUserId, data.settlements);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== defaultFilters[key as keyof typeof defaultFilters]).length;
  const clearFilters = () => setFilters(defaultFilters);
  const matchesBalanceFilter = (net: number) => {
    if (filters.balance === "owed") return net > 0.009;
    if (filters.balance === "owe") return net < -0.009;
    if (filters.balance === "settled") return Math.abs(net) <= 0.009;
    return true;
  };
  const friendItems = data.friends.map((friend) => {
    const balances = buildDebtBalances(data.expenses, data.settlements, { currentUserId, friendId: friend.user_id, groupId: null });
    const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
    const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
    const latest = data.expenses.filter((expense) => !expense.group_id && (expense.paid_by === friend.user_id || expense.expense_splits?.some((split) => split.user_id === friend.user_id))).reduce((max, expense) => Math.max(max, new Date(expense.created_at || 0).getTime()), 0);
    return { friend, net: owedToMe - iOwe, latest };
  });
  const groupItems = data.groups.map((group) => {
    const balances = computeGroupBalances(data.expenses, data.settlements, group, currentUserId);
    const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
    const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
    const latest = data.expenses.filter((expense) => expense.group_id === group.id).reduce((max, expense) => Math.max(max, new Date(expense.created_at || 0).getTime()), 0);
    return { group, net: owedToMe - iOwe, latest };
  });
  const sortSplitItems = <T extends { net: number; latest: number }>(items: T[], getName: (item: T) => string) => [...items].sort((a, b) => {
    if (filters.sort === "lowest") return Math.abs(a.net) - Math.abs(b.net);
    if (filters.sort === "az") return getName(a).localeCompare(getName(b));
    if (filters.sort === "recent") return b.latest - a.latest;
    return Math.abs(b.net) - Math.abs(a.net);
  });
  const filteredFriends = sortSplitItems(
    friendItems.filter(({ friend, net }) => (displayName(friend).toLowerCase().includes(query.toLowerCase()) || (friend.username || "").toLowerCase().includes(query.toLowerCase())) && matchesBalanceFilter(net)),
    ({ friend }) => displayName(friend),
  );
  const filteredGroups = sortSplitItems(
    groupItems.filter(({ group, net }) => group.name.toLowerCase().includes(query.toLowerCase()) && matchesBalanceFilter(net)),
    ({ group }) => group.name,
  );
  const setSubTab = (value: "friends" | "groups") => {
    sessionStorage.setItem("spendova-split-tab", value);
    setSubTabState(value);
  };
  const openDetail = (kind: "friend" | "group", id: string) => {
    sessionStorage.setItem("spendova-split-tab", kind === "friend" ? "friends" : "groups");
    sessionStorage.setItem("spendova-split-scroll", String(window.scrollY));
    navigate(`/split/${kind}/${id}`);
  };
  useEffect(() => {
    const saved = Number(sessionStorage.getItem("spendova-split-scroll") || 0);
    if (saved > 0) {
      window.requestAnimationFrame(() => window.scrollTo({ top: saved }));
      sessionStorage.removeItem("spendova-split-scroll");
    }
  }, []);

  return (
    <main className="space-y-6">
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <div className="flex rounded-full bg-elevated p-1">
          {(["friends", "groups"] as const).map((key) => (
            <button key={key} onClick={() => setSubTab(key)} className={`flex-1 rounded-full px-4 py-2.5 text-sm font-bold capitalize transition-colors ${subTab === key ? "bg-primary text-primary-foreground shadow-primary-action" : "text-muted-foreground"}`}>{key}</button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-4 shadow-soft"><p className="text-xs font-semibold text-muted-foreground">You are owed</p><p className="mt-1 text-xl font-bold text-success">{money(summary.totalLent)}</p></div>
        <div className="rounded-2xl bg-card p-4 shadow-soft"><p className="text-xs font-semibold text-muted-foreground">You owe</p><p className="mt-1 text-xl font-bold text-warning">{money(summary.totalOwed)}</p></div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button onClick={() => subTab === "friends" ? openModal(data.friends.length === 0 ? "add-friend" : data.friends.length === 1 ? "add-expense" : "choose-friend-expense", data.friends[0]?.user_id) : openModal(data.groups.length === 0 ? "create-group" : data.groups.length === 1 ? "group-expense" : "choose-group-expense", data.groups[0]?.id)} className="h-12 shadow-primary-action">
          <Plus />{subTab === "friends" ? "Add Expense" : "Add Group Expense"}
        </Button>
        {subTab === "friends" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => openModal("add-friend")} variant="quiet" className="h-12"><UserPlus />Add Friend</Button>
            <Button onClick={() => openModal("friend-requests")} variant="quiet" className="h-12">Requests</Button>
          </div>
        ) : (
          <Button onClick={() => openModal("create-group")} variant="quiet" className="h-12"><Plus />Create Group</Button>
        )}
      </section>

      {subTab === "friends" ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-foreground">Friends</h2>
            <FilterTrigger count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-full border border-input bg-background px-4 py-3 shadow-soft">
            <Search className="size-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search friends" />
          </div>
          <div className="space-y-3">
            {filteredFriends.length === 0 ? (data.friends.length === 0 ? <EmptyCard text="Add friends to start splitting expenses" /> : <FilterEmptyState onClear={clearFilters} />) : filteredFriends.map(({ friend, net }) => {
              return (
              <button key={friend.user_id} onClick={() => openDetail("friend", friend.user_id)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-elevated font-bold text-primary">{displayName(friend).charAt(0).toUpperCase()}</span>
                  <div><h3 className="font-bold text-foreground">{displayName(friend)}</h3><p className="text-sm text-muted-foreground">@{friend.username || "user"}</p></div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-bold ${net > 0 ? "text-success" : net < 0 ? "text-warning" : "text-muted-foreground"}`}>{net > 0 ? `You are owed ${money(net)}` : net < 0 ? `You owe ${money(Math.abs(net))}` : "Settled"}</p>
                  <ChevronRight className="ml-auto mt-1 size-4 text-muted-foreground" />
                </div>
              </button>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight text-foreground">Groups</h2>
              <FilterTrigger count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
            </div>
            <div className="space-y-3">
              {data.groups.length === 0 ? <EmptyCard text="Create a group to split shared expenses" /> : filteredGroups.length === 0 ? <FilterEmptyState onClear={clearFilters} /> : filteredGroups.map(({ group, net }) => {
                return (
                  <button onClick={() => openDetail("group", group.id)} key={group.id} className="w-full rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-11 place-items-center rounded-full bg-elevated text-xl">{group.emoji || "🏠"}</span>
                        <div><h3 className="font-bold text-foreground">{group.name}</h3><p className="text-sm text-muted-foreground">{group.group_members.length} members</p></div>
                      </div>
                      <p className={`shrink-0 text-right text-sm font-bold ${net > 0 ? "text-success" : net < 0 ? "text-warning" : "text-muted-foreground"}`}>{net > 0 ? `You are owed ${money(net)}` : net < 0 ? `You owe ${money(Math.abs(net))}` : "Settled"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title={`${subTab === "friends" ? "Friend" : "Group"} filters`} onClear={clearFilters}>
        <FilterField label="Balance" value={filters.balance} onChange={(balance) => setFilters((current) => ({ ...current, balance }))} options={[{ value: "all", label: "All" }, { value: "owe", label: "You owe" }, { value: "owed", label: "You are owed" }, { value: "settled", label: "Settled" }]} />
        <FilterField label="Sort" value={filters.sort} onChange={(sort) => setFilters((current) => ({ ...current, sort }))} options={[{ value: "highest", label: "Highest balance first" }, { value: "lowest", label: "Lowest balance first" }, { value: "az", label: "A to Z" }, { value: "recent", label: "Recently active" }]} />
      </FilterSheet>
    </main>
  );
};

const GroupSummaryCard = ({ group, expenses, currentUserId, openModal }: { group: GroupRow; expenses: ExpenseRow[]; currentUserId: string; openModal: (type: ModalType, item?: string) => void }) => {
  const balances = computeGroupBalances(expenses, [], group, currentUserId);
  const groupExpenses = expenses.filter((expense) => expense.group_id === group.id);
  const mine = balances.filter((balance) => balance.toUserId === currentUserId);
  const owed = mine.reduce((sum, balance) => sum + balance.amount, 0);
  return (
    <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
      <SectionHeader title={`${group.name} summary`} action="Settle up" onAction={() => openModal("settle-up", group.id)} />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-elevated p-4 shadow-soft"><p className="text-xs text-muted-foreground">Balance</p><p className="mt-1 font-bold text-success">You get {money(owed)}</p></div>
        <div className="rounded-2xl bg-elevated p-4 shadow-soft"><p className="text-xs text-muted-foreground">Latest</p><p className="mt-1 font-bold text-foreground">{groupExpenses[0]?.category || "No expenses"}</p></div>
      </div>
      <div className="mt-4 space-y-2 rounded-2xl bg-elevated p-4 shadow-soft">
        {balances.length === 0 ? <p className="text-sm text-muted-foreground">All settled.</p> : balances.slice(0, 3).map((balance) => (
          <div key={`${balance.fromUserId}-${balance.toUserId}`} className="flex items-center justify-between text-sm"><span className="font-semibold text-foreground">{balance.fromName} to {balance.toName}</span><span className="font-bold text-success">{money(balance.amount)}</span></div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => openModal("group-expense", group.id)} className="h-11 flex-1 shadow-primary-action"><Plus />Add group expense</Button>
        <Button onClick={() => openModal("invite-members", group.id)} variant="quiet" className="h-11"><LinkIcon />Invite</Button>
        <Button onClick={() => openModal("settle-up", group.id)} variant="quiet" className="h-11"><ArrowRight />Settle</Button>
      </div>
    </section>
  );
};

type HistoryItem = { id: string; created_at: string | null; kind: "expense" | "settlement"; title: string; detail: string; amount: number };
type FriendActivityStatus = "pending" | "partial" | "paid";
type FriendActivityItem = HistoryItem & { impact: number; remainingImpact: number; status: FriendActivityStatus; paidById: string; icon: typeof CircleDollarSign };
type SettlementPayload = { from_user_id: string; to_user_id: string; amount: number; group_id?: string | null; note?: string | null; created_at?: string; settlementId?: string };

const BalanceLabel = ({ amount }: { amount: number }) => (
  <p className={`text-sm font-bold ${amount > 0 ? "text-success" : amount < 0 ? "text-warning" : "text-muted-foreground"}`}>
    {amount > 0 ? `You are owed ${money(amount)}` : amount < 0 ? `You owe ${money(Math.abs(amount))}` : "Settled"}
  </p>
);

const DetailHeader = ({ title, subtitle, balance, onBack }: { title: string; subtitle: string; balance: number; onBack: () => void }) => (
  <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
    <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-primary"><ArrowLeft className="size-4" />Back to Split</button>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right"><BalanceLabel amount={balance} /></div>
    </div>
  </section>
);

const getFriendActivityIcon = (item: { kind: "expense" | "settlement"; title: string }) => {
  if (item.kind === "settlement") return Check;
  const title = item.title.toLowerCase();
  if (title.includes("taxi") || title.includes("cab") || title.includes("ride")) return Car;
  if (title.includes("coffee") || title.includes("tea")) return Coffee;
  if (title.includes("dinner") || title.includes("lunch") || title.includes("food")) return UtensilsCrossed;
  return CircleDollarSign;
};

const FriendDetailView = ({ friend, data, currentUserId, theme, onThemeToggle, openModal, onBack, refresh }: { friend: FriendProfile; data: AppData; currentUserId: string; theme: Theme; onThemeToggle: () => void; openModal: (type: ModalType, item?: string) => void; onBack: () => void; refresh: () => Promise<void> }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [actionItem, setActionItem] = useState<FriendActivityItem | null>(null);
  const [quickSettleItem, setQuickSettleItem] = useState<FriendActivityItem | null>(null);
  const [quickSettling, setQuickSettling] = useState(false);
  const defaultFilters = { type: "all", status: "all", date: "all", sort: "newest", paidBy: "anyone" };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const balances = buildDebtBalances(data.expenses, data.settlements, { currentUserId, friendId: friend.user_id, groupId: null });
  const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const net = owedToMe - iOwe;
  const friendNetSettled = Math.abs(net) <= 0.009;
  const balanceText = net > 0 ? `You are owed ${money(net)}` : net < 0 ? `You owe ${money(Math.abs(net))}` : "Settled";
  const balanceClass = net > 0 ? "text-success" : net < 0 ? "text-warning" : "text-muted-foreground";
  const expenses = data.expenses.filter((expense) => !expense.group_id && (expense.paid_by === friend.user_id || expense.paid_by === currentUserId) && expense.expense_splits?.some((split) => split.user_id === friend.user_id || split.user_id === currentUserId));
  const settlements = data.settlements.filter((settlement) => !settlement.group_id && [settlement.from_user_id, settlement.to_user_id].includes(friend.user_id) && [settlement.from_user_id, settlement.to_user_id].includes(currentUserId));
  const activity: FriendActivityItem[] = [
    ...expenses.map((expense) => {
      const friendShare = expense.expense_splits?.find((split) => split.user_id === friend.user_id)?.amount_owed || 0;
      const myShare = expense.expense_splits?.find((split) => split.user_id === currentUserId)?.amount_owed || 0;
      const impact = expense.paid_by === currentUserId ? Number(friendShare) : -Number(myShare);
      const targetSplit = expense.paid_by === currentUserId
        ? expense.expense_splits?.find((split) => split.user_id === friend.user_id)
        : expense.expense_splits?.find((split) => split.user_id === currentUserId);
      const paidAmount = Number(targetSplit?.amount_paid || (targetSplit?.has_paid ? targetSplit.amount_owed : 0) || 0);
      const remaining = Math.max(Number(targetSplit?.amount_owed || 0) - paidAmount, 0);
      const remainingImpact = friendNetSettled ? 0 : impact < 0 ? -remaining : remaining;
      const status: FriendActivityStatus = friendNetSettled || remaining <= 0.009 ? "paid" : paidAmount > 0 ? "partial" : "pending";
      const item = {
        id: expense.id,
        created_at: expense.created_at,
        kind: "expense" as const,
        title: expense.category || "Expense",
        detail: `${expense.paid_by === currentUserId ? "You" : displayName(friend)} paid ${money(expense.amount)}${expense.split_type ? ` • ${expense.split_type} split` : ""}`,
        amount: expense.amount,
        impact,
        remainingImpact: Number(remainingImpact.toFixed(2)),
        status,
        paidById: expense.paid_by,
      };
      return { ...item, icon: getFriendActivityIcon(item) };
    }),
    ...settlements.map((settlement) => {
      const item = {
        id: settlement.id,
        created_at: settlement.created_at,
        kind: "settlement" as const,
        title: "Settlement",
        detail: `${settlement.from_user_id === currentUserId ? "You" : displayName(friend)} paid ${settlement.to_user_id === currentUserId ? "you" : displayName(friend)} ${money(settlement.amount)}${settlement.note ? ` • ${settlement.note}` : ""}`,
        amount: settlement.amount,
        impact: settlement.from_user_id === currentUserId ? -Number(settlement.amount) : Number(settlement.amount),
        remainingImpact: 0,
        status: "paid" as const,
        paidById: settlement.from_user_id,
      };
      return { ...item, icon: getFriendActivityIcon(item) };
    }),
  ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== defaultFilters[key as keyof typeof defaultFilters]).length;
  const clearFilters = () => setFilters(defaultFilters);
  const filteredActivity = sortByDateOrAmount(
    activity.filter((item) => {
      if (filters.type !== "all" && item.kind !== (filters.type === "expenses" ? "expense" : "settlement")) return false;
      if (filters.status !== "all" && item.status !== filters.status) return false;
      if (filters.paidBy === "me" && item.paidById !== currentUserId) return false;
      if (filters.paidBy === "friend" && item.paidById !== friend.user_id) return false;
      return filterByDate(item.created_at, filters.date as DateFilter);
    }),
    filters.sort as AmountSort,
    (item) => item.created_at,
    (item) => Math.abs(item.impact || item.amount || 0),
  );
  const openActivity = (item: FriendActivityItem) => {
    navigate(item.kind === "settlement" ? `/split/settlement/${item.id}` : `/split/expense/${item.id}`);
  };
  const closeActions = () => setActionItem(null);
  const openActionMenu = (event: React.MouseEvent, item: FriendActivityItem) => {
    event.stopPropagation();
    setActionItem(item);
  };
  const handleActivityKeyDown = (event: React.KeyboardEvent, item: FriendActivityItem) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openActivity(item);
  };
  const selectedExpense = actionItem?.kind === "expense" ? data.expenses.find((expense) => expense.id === actionItem.id) : undefined;
  const selectedSettlement = actionItem?.kind === "settlement" ? data.settlements.find((settlement) => settlement.id === actionItem.id) : undefined;
  const selectedExpenseRemaining = actionItem?.kind === "expense" ? Math.abs(actionItem.remainingImpact) : 0;
  const runAction = (action: () => void) => {
    closeActions();
    action();
  };
  const confirmQuickSettle = async () => {
    if (!quickSettleItem || quickSettling) return;
    const amount = Number(Math.abs(quickSettleItem.remainingImpact).toFixed(2));
    if (amount <= 0) return;
    const expense = data.expenses.find((item) => item.id === quickSettleItem.id);
    const split = expense?.paid_by === currentUserId
      ? expense.expense_splits?.find((item) => item.user_id === friend.user_id)
      : expense?.expense_splits?.find((item) => item.user_id === currentUserId);
    if (!expense || !split) {
      toast({ title: "Could not settle expense", description: "No unpaid split was found for this activity.", variant: "destructive" });
      return;
    }
    setQuickSettling(true);
    const fromUserId = quickSettleItem.impact > 0 ? friend.user_id : currentUserId;
    const toUserId = quickSettleItem.impact > 0 ? currentUserId : friend.user_id;
    const { error } = await supabase.rpc("record_split_settlement" as never, {
      p_from_user_id: fromUserId,
      p_to_user_id: toUserId,
      p_amount: amount,
      p_group_id: null,
      p_expense_id: expense.id,
      p_note: `Settled ${quickSettleItem.title}`,
    } as never);
    setQuickSettling(false);
    if (error) {
      toast({ title: "Settlement failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Expense marked settled", description: `${money(amount)} was settled for ${quickSettleItem.title}.` });
    setQuickSettleItem(null);
    await refresh();
  };

  return (
    <>
      <main className="space-y-5 pt-4">
        <header className="flex items-center justify-between">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary"><ArrowLeft className="size-4" />Back to Split</button>
          <div className="flex items-center gap-2">
            <button onClick={() => openModal("notifications")} className="grid size-9 place-items-center rounded-full bg-card text-muted-foreground shadow-soft" aria-label="Notifications">
              <Bell className="size-4" />
            </button>
            <button onClick={onThemeToggle} className="grid size-9 place-items-center rounded-full bg-card text-foreground shadow-soft" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </header>

      <section className="flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-primary-action">
          {displayName(friend).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight text-foreground">{displayName(friend)}</h2>
          <p className="text-sm font-medium text-muted-foreground">@{friend.username || "user"}</p>
          <p className={`mt-1 text-sm font-bold ${balanceClass}`}>{balanceText}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Button onClick={() => openModal("add-expense", friend.user_id)} className="h-11 rounded-2xl shadow-primary-action"><Plus />Add Expense</Button>
        <Button onClick={() => net !== 0 && openModal("settle-up", friend.user_id)} disabled={net === 0} variant="outline" className="h-11 rounded-2xl border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary">
          <Check />{net === 0 ? "Settled" : `Settle ${money(Math.abs(net))}`}
        </Button>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Activity</h2>
          <FilterTrigger count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
        </div>
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          {activity.length === 0 ? (
            <div className="grid min-h-44 place-items-center px-4 py-8 text-center">
              <div>
                <p className="font-bold text-foreground">No activity yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your first expense</p>
                <Button onClick={() => openModal("add-expense", friend.user_id)} className="mt-4 h-10 rounded-2xl shadow-primary-action"><Plus />Add Expense</Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <span className="absolute left-9 top-8 bottom-8 w-px bg-border/70" aria-hidden="true" />
              {filteredActivity.length === 0 ? (
                <div className="p-4"><FilterEmptyState onClear={clearFilters} /></div>
              ) : filteredActivity.map((item, index) => {
                const Icon = item.icon;
                const impactClass = item.impact > 0 ? "text-success" : item.impact < 0 ? "text-destructive" : "text-muted-foreground";
                const statusLabel = item.status === "paid" ? "Paid" : item.status === "partial" ? "Partial" : "Pending";
                const statusClass = item.status === "paid" ? "bg-success/15 text-success" : item.status === "partial" ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning";
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label="Open activity details"
                    onClick={() => openActivity(item)}
                    onKeyDown={(event) => handleActivityKeyDown(event, item)}
                    className={`relative flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-elevated/70 active:bg-elevated ${index < activity.length - 1 ? "border-b border-border/60" : ""}`}
                  >
                    <span className={`z-10 grid size-10 shrink-0 place-items-center rounded-full ${item.kind === "settlement" ? "bg-success/15 text-success" : item.impact < 0 ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-foreground">{item.title}</h3>
                      <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{item.detail}</p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{dateLabel(item.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${impactClass}`}>{item.impact > 0 ? "+" : item.impact < 0 ? "-" : ""}{money(Math.abs(item.impact))}</p>
                        {item.kind === "expense" ? (
                          <div className="mt-1 flex flex-col items-end gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                            {item.status === "partial" ? <span className="text-[10px] font-semibold text-muted-foreground">{money(Math.abs(item.remainingImpact))} pending</span> : null}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label="Open activity actions"
                        onClick={(event) => openActionMenu(event, item)}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreVertical className="pointer-events-none size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <button onClick={() => openModal("remove-friend", friend.user_id)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-soft">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-destructive">Remove Friend</span>
          <span className="mt-0.5 block text-xs font-medium text-muted-foreground">This will not delete any existing expenses.</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      </main>

      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Activity filters" onClear={clearFilters}>
        <FilterField label="Type" value={filters.type} onChange={(type) => setFilters((current) => ({ ...current, type }))} options={[{ value: "all", label: "All" }, { value: "expenses", label: "Expenses" }, { value: "settlements", label: "Settlements" }]} />
        <FilterField label="Status" value={filters.status} onChange={(status) => setFilters((current) => ({ ...current, status }))} options={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "partial", label: "Partial" }, { value: "paid", label: "Paid / Settled" }]} />
        <FilterField label="Date" value={filters.date} onChange={(date) => setFilters((current) => ({ ...current, date }))} options={[{ value: "all", label: "All dates" }, { value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }, { value: "year", label: "This year" }]} />
        <FilterField label="Sort" value={filters.sort} onChange={(sort) => setFilters((current) => ({ ...current, sort }))} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "amount-desc", label: "Amount high to low" }, { value: "amount-asc", label: "Amount low to high" }]} />
        <FilterField label="Paid by" value={filters.paidBy} onChange={(paidBy) => setFilters((current) => ({ ...current, paidBy }))} options={[{ value: "anyone", label: "Anyone" }, { value: "me", label: "Me" }, { value: "friend", label: displayName(friend) }]} />
      </FilterSheet>

      <Drawer open={Boolean(actionItem)} onOpenChange={(open) => !open && closeActions()}>
        <DrawerContent className="mx-auto max-w-3xl rounded-t-3xl border-border bg-card px-4 pb-5">
          <DrawerHeader className="px-0 pb-2 text-left">
            <DrawerTitle>{actionItem?.kind === "settlement" ? "Settlement actions" : "Expense actions"}</DrawerTitle>
            <DrawerDescription>{actionItem?.title || "Activity"}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-hidden rounded-2xl bg-elevated/70">
            <button type="button" className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-background/70" onClick={() => actionItem && runAction(() => openActivity(actionItem))}>
              View details
              <ArrowRight className="size-4 text-muted-foreground" />
            </button>
            {actionItem?.kind === "expense" && selectedExpense ? (
              <>
                <button type="button" className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-background/70" onClick={() => runAction(() => openModal("edit-expense", selectedExpense.id))}>
                  Edit expense
                  <Pencil className="size-4 text-muted-foreground" />
                </button>
                {selectedExpenseRemaining > 0.009 ? (
                  <button type="button" className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-background/70" onClick={() => runAction(() => setQuickSettleItem(actionItem))}>
                    {actionItem.status === "partial" ? `Settle remaining ${money(selectedExpenseRemaining)}` : "Mark this expense as settled"}
                    <Check className="size-4 text-muted-foreground" />
                  </button>
                ) : actionItem?.kind === "expense" ? (
                  <div className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-sm font-bold text-muted-foreground">
                    Already settled
                    <Check className="size-4" />
                  </div>
                ) : null}
                <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-destructive hover:bg-destructive/10" onClick={() => runAction(() => openModal("delete-expense", selectedExpense.id))}>
                  Delete expense
                  <Trash2 className="size-4" />
                </button>
              </>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={Boolean(quickSettleItem)} onOpenChange={(open) => !open && setQuickSettleItem(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-[1.25rem] border-border bg-card shadow-panel">
          <DialogHeader>
            <DialogTitle className="text-foreground">Mark expense as settled?</DialogTitle>
            <DialogDescription>
              {quickSettleItem ? `This will mark ${money(Math.abs(quickSettleItem.remainingImpact))} as paid for "${quickSettleItem.title}".` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="quiet" className="flex-1" onClick={() => setQuickSettleItem(null)}>Cancel</Button>
            <Button type="button" className="flex-1" onClick={confirmQuickSettle} disabled={quickSettling}>{quickSettling ? "Saving..." : "Mark Settled"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
    <span className="text-sm font-medium text-muted-foreground">{label}</span>
    <span className="max-w-[62%] text-right text-sm font-bold text-foreground">{value}</span>
  </div>
);

const ExpenseDetailView = ({ expense, settlements, currentUserId, openModal, onBack, refresh }: { expense: ExpenseRow; settlements: SplitSettlementRow[]; currentUserId: string; openModal: (type: ModalType, item?: string) => void; onBack: () => void; refresh: () => Promise<void> }) => {
  const { toast } = useToast();
  const [settling, setSettling] = useState(false);
  const isPayer = expense.paid_by === currentUserId;
  const mySplit = expense.expense_splits?.find((split) => split.user_id === currentUserId);
  const expenseSettlements = settlements.filter((settlement) => settlement.expense_id === expense.id);
  const paidBy = isPayer ? "You" : displayName(expense.payer_profile || expense.profiles);
  const totalOwed = expense.expense_splits?.reduce((sum, split) => sum + Number(split.amount_owed || 0), 0) || 0;
  const totalPaid = expense.expense_splits?.reduce((sum, split) => sum + Number(split.amount_paid || (split.has_paid ? split.amount_owed : 0) || 0), 0) || 0;
  const remainingUnpaid = Math.max(totalOwed - totalPaid, 0);
  const expenseStatus = remainingUnpaid <= 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Pending";
  const myRemaining = mySplit ? Math.max(Number(mySplit.amount_owed || 0) - Number(mySplit.amount_paid || (mySplit.has_paid ? mySplit.amount_owed : 0) || 0), 0) : 0;
  const balanceImpact = isPayer
    ? totalOwed
    : -Number(mySplit?.amount_owed || 0);
  const participants = [
    { id: expense.paid_by, name: paidBy, amount: expense.amount, role: "Paid" },
    ...(expense.expense_splits || []).map((split) => ({
      id: split.user_id,
      name: split.user_id === currentUserId ? "You" : displayName(split.profiles),
      amount: Number(split.amount_owed || 0),
      role: Number(split.amount_paid || (split.has_paid ? split.amount_owed : 0) || 0) >= Number(split.amount_owed || 0) ? "Settled share" : "Share",
    })),
  ];
  const settleMyShare = async () => {
    if (!mySplit || myRemaining <= 0 || settling) return;
    setSettling(true);
    const { error } = await supabase.rpc("record_split_settlement" as never, {
      p_from_user_id: currentUserId,
      p_to_user_id: expense.paid_by,
      p_amount: myRemaining,
      p_group_id: expense.group_id,
      p_expense_id: expense.id,
      p_note: `Settled ${expense.category || "expense"}`,
    } as never);
    setSettling(false);
    if (error) {
      toast({ title: "Settlement failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Expense settled", description: "Your share and balances were updated." });
    await refresh();
  };

  return (
    <main className="space-y-5 pt-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary"><ArrowLeft className="size-4" />Back to Split</button>
      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted-foreground">Expense Detail</p>
            <h1 className="mt-1 truncate text-2xl font-bold text-foreground">{expense.category || "Expense"}</h1>
            {expense.note ? <p className="mt-1 text-sm text-muted-foreground">{expense.note}</p> : null}
          </div>
          <p className="shrink-0 text-xl font-bold text-foreground">{money(expense.amount)}</p>
        </div>
      </section>

      <section className="rounded-2xl bg-card px-4 shadow-soft">
        <DetailRow label="Description" value={expense.note || expense.category || "Expense"} />
        <DetailRow label="Amount" value={money(expense.amount)} />
        <DetailRow label="Paid by" value={paidBy} />
        <DetailRow label="Split type" value={expense.split_type || "none"} />
        <DetailRow label="Date" value={dateLabel(expense.created_at)} />
        <DetailRow label="Status" value={<StatusPill status={expenseStatus} />} />
        <DetailRow label="Remaining unpaid" value={money(remainingUnpaid)} />
        <DetailRow label="Balance impact" value={<span className={balanceImpact > 0 ? "text-success" : balanceImpact < 0 ? "text-destructive" : "text-muted-foreground"}>{balanceImpact > 0 ? "+" : balanceImpact < 0 ? "-" : ""}{money(Math.abs(balanceImpact))}</span>} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-foreground">Participants</h2>
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          {participants.map((participant, index) => (
            <div key={`${participant.id}-${participant.role}-${index}`} className={`flex items-center justify-between gap-3 px-4 py-3 ${index < participants.length - 1 ? "border-b border-border/60" : ""}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{participant.name}</p>
                <p className="text-xs font-medium text-muted-foreground">{participant.role}</p>
              </div>
              <p className="text-sm font-bold text-foreground">{money(participant.amount)}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-foreground">Settlement history</h2>
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          {expenseSettlements.length === 0 ? (
            <div className="px-4 py-5 text-sm font-medium text-muted-foreground">No settlements recorded for this expense.</div>
          ) : expenseSettlements.map((settlement, index) => (
            <div key={settlement.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${index < expenseSettlements.length - 1 ? "border-b border-border/60" : ""}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{settlement.from_user_id === currentUserId ? "You" : displayName(settlement.from_profile)} paid {settlement.to_user_id === currentUserId ? "you" : displayName(settlement.to_profile)}</p>
                <p className="text-xs font-medium text-muted-foreground">{dateLabel(settlement.created_at)}{settlement.note ? ` - ${settlement.note}` : ""}</p>
              </div>
              <p className="text-sm font-bold text-success">{money(settlement.amount)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {myRemaining > 0 ? <Button onClick={settleMyShare} className="col-span-2 h-11 rounded-2xl shadow-primary-action" disabled={settling}><Check />{settling ? "Saving..." : `Settle this expense (${money(myRemaining)})`}</Button> : null}
        <Button onClick={() => openModal("edit-expense", expense.id)} className="h-11 rounded-2xl shadow-primary-action"><Pencil />Edit expense</Button>
        <Button onClick={() => openModal("delete-expense", expense.id)} variant="destructive" className="h-11 rounded-2xl"><Trash2 />Delete expense</Button>
      </section>
    </main>
  );
};

const SettlementDetailView = ({ settlement, currentUserId, onBack, onDelete }: { settlement: SplitSettlementRow; currentUserId: string; onBack: () => void; onDelete: (settlementId: string) => Promise<void> }) => {
  const paidBy = settlement.from_user_id === currentUserId ? "You" : displayName(settlement.from_profile);
  const paidTo = settlement.to_user_id === currentUserId ? "you" : displayName(settlement.to_profile);
  return (
    <main className="space-y-5 pt-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary"><ArrowLeft className="size-4" />Back to Split</button>
      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <p className="text-xs font-bold uppercase text-muted-foreground">Settlement Detail</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{money(settlement.amount)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{paidBy} paid {paidTo}</p>
      </section>
      <section className="rounded-2xl bg-card px-4 shadow-soft">
        <DetailRow label="Amount" value={money(settlement.amount)} />
        <DetailRow label="Paid by" value={paidBy} />
        <DetailRow label="Paid to" value={paidTo} />
        <DetailRow label="Date" value={dateLabel(settlement.created_at)} />
        <DetailRow label="Linked expense" value={settlement.expense_id ? "Specific expense" : "Balance settlement"} />
        {settlement.note ? <DetailRow label="Note" value={settlement.note} /> : null}
      </section>
      <Button onClick={() => onDelete(settlement.id)} variant="destructive" className="h-11 w-full rounded-2xl"><Trash2 />Delete settlement</Button>
    </main>
  );
};

const NotificationsList = ({ data, currentUserId }: { data: AppData; currentUserId: string }) => {
  const items = [
    ...data.incomingRequests.map((request) => ({
      id: `incoming-${request.id}`,
      title: `${displayName(request.profiles)} sent a friend request`,
      subtitle: dateLabel(request.created_at),
    })),
    ...data.outgoingRequests.map((request) => ({
      id: `outgoing-${request.id}`,
      title: `Friend request pending for ${displayName(request.profiles)}`,
      subtitle: dateLabel(request.created_at),
    })),
    ...Object.values(data.groupInvites).flat().map((invite) => ({
      id: `invite-${invite.id}`,
      title: `Group invite pending for ${invite.email}`,
      subtitle: dateLabel(invite.created_at),
    })),
    ...data.settlements.slice(0, 6).map((settlement) => ({
      id: `settlement-${settlement.id}`,
      title: settlement.to_user_id === currentUserId
        ? `${displayName(settlement.from_profile)} paid you ${money(settlement.amount)}`
        : `You paid ${displayName(settlement.to_profile)} ${money(settlement.amount)}`,
      subtitle: dateLabel(settlement.created_at),
    })),
  ];

  if (!items.length) return <EmptyCard text="No notifications yet." />;
  return (
    <div className="overflow-hidden rounded-2xl bg-elevated/70">
      {items.map((item, index) => (
        <div key={item.id} className={`px-4 py-3 text-sm ${index < items.length - 1 ? "border-b border-border/60" : ""}`}>
          <p className="font-bold text-foreground">{item.title}</p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{item.subtitle}</p>
        </div>
      ))}
    </div>
  );
};

const SpendingDetails = ({ expenses, currentUserId }: { expenses: ExpenseRow[]; currentUserId: string }) => {
  const analytics = useMemo(() => getSpendingAnalytics(expenses, currentUserId), [expenses, currentUserId]);
  if (analytics.total <= 0) return <EmptyCard text="No spending data available" />;
  const trendUp = analytics.trend >= 0;
  const rows = [
    ["Highest spending category", analytics.highestCategory ? `${analytics.highestCategory[0]} · ${money(analytics.highestCategory[1])}` : "None"],
    ["Lowest spending category", analytics.lowestCategory ? `${analytics.lowestCategory[0]} · ${money(analytics.lowestCategory[1])}` : "None"],
    ["Average daily spend", money(analytics.averageDaily)],
    ["Average weekly spend", money(analytics.averageWeekly)],
    ["Average monthly spend", money(analytics.averageMonthly)],
    ["Total personal", money(analytics.totals.personal)],
    ["Total split", money(analytics.totals.split)],
    ["Total tiffin", money(analytics.totals.tiffin)],
    ["Total group", money(analytics.totals.group)],
    ["Top spending day", analytics.topDay ? `${analytics.topDay[0]} · ${money(analytics.topDay[1])}` : "None"],
    ["Top spending month", analytics.topMonth ? `${analytics.topMonth[0]} · ${money(analytics.topMonth[1])}` : "None"],
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-elevated p-4">
        <span className="text-sm font-bold text-foreground">Spending trend</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${trendUp ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
          {trendUp ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}{trendUp ? "+" : ""}{Number(analytics.trend.toFixed(1)).toString().replace(".0", "")}%
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl bg-elevated/70">
        {rows.map(([label, value], index) => (
          <div key={label} className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${index < rows.length - 1 ? "border-b border-border/60" : ""}`}>
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-bold text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const GroupDetailView = ({ group, data, currentUserId, openModal, onBack, refresh }: { group: GroupRow; data: AppData; currentUserId: string; openModal: (type: ModalType, item?: string) => void; onBack: () => void; refresh: () => Promise<void> }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [actionExpense, setActionExpense] = useState<ExpenseRow | null>(null);
  const [participantsExpense, setParticipantsExpense] = useState<ExpenseRow | null>(null);
  const defaultFilters = { status: "all", paidBy: "anyone", date: "all", sort: "newest", splitType: "all" };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const groupExpenses = data.expenses.filter((expense) => expense.group_id === group.id).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const totalSpent = groupExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const balances = computeGroupBalances(data.expenses, data.settlements, group, currentUserId);
  const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const net = owedToMe - iOwe;
  const balanceChipText = net > 0 ? `You are owed ${money(net)}` : net < 0 ? `You owe ${money(Math.abs(net))}` : "Settled";
  const balanceChipClass = net > 0 ? "bg-success/15 text-success" : net < 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
  const memberMap = Object.fromEntries(group.group_members.map((member) => [member.user_id, member]));
  const getExpenseStatus = (expense: ExpenseRow) => {
    const splits = expense.expense_splits || [];
    if (splits.length === 0) return expense.status === "cleared" ? "settled" as const : "pending" as const;
    if (splits.every((split) => Number(split.amount_paid || 0) >= Number(split.amount_owed || 0) || split.has_paid)) return "settled" as const;
    if (splits.some((split) => Number(split.amount_paid || 0) > 0 || split.has_paid)) return "partial" as const;
    return "pending" as const;
  };
  const getRemaining = (expense: ExpenseRow) => (expense.expense_splits || []).reduce((sum, split) => sum + Math.max(Number(split.amount_owed || 0) - Number(split.amount_paid || (split.has_paid ? split.amount_owed : 0) || 0), 0), 0);
  const settleExpense = async (expense: ExpenseRow) => {
    const unpaidSplits = (expense.expense_splits || [])
      .map((split) => ({ ...split, remaining: Math.max(Number(split.amount_owed || 0) - Number(split.amount_paid || (split.has_paid ? split.amount_owed : 0) || 0), 0) }))
      .filter((split) => split.remaining > 0 && (currentUserId === expense.paid_by || split.user_id === currentUserId));
    if (!unpaidSplits.length) return;
    const results = await Promise.all(unpaidSplits.map((split) => supabase.rpc("record_split_settlement" as never, {
      p_from_user_id: split.user_id,
      p_to_user_id: expense.paid_by,
      p_amount: split.remaining,
      p_group_id: group.id,
      p_expense_id: expense.id,
      p_note: `Settled ${expense.category || "expense"}`,
    } as never)));
    const error = results.find((result) => result.error)?.error;
    if (error) {
      toast({ title: "Settlement failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Expense settled", description: "Group balances were updated." });
    setActionExpense(null);
    await refresh();
  };
  const actionStatus = actionExpense ? getExpenseStatus(actionExpense) : "pending";
  const getSettleableRemaining = (expense: ExpenseRow) => (expense.expense_splits || []).reduce((sum, split) => {
    const canSettle = currentUserId === expense.paid_by || split.user_id === currentUserId;
    if (!canSettle) return sum;
    return sum + Math.max(Number(split.amount_owed || 0) - Number(split.amount_paid || (split.has_paid ? split.amount_owed : 0) || 0), 0);
  }, 0);
  const actionRemaining = actionExpense ? getSettleableRemaining(actionExpense) : 0;
  const getPayerShare = (expense: ExpenseRow) => Math.max(Number(expense.amount || 0) - (expense.expense_splits || []).reduce((sum, item) => sum + Number(item.amount_owed || 0), 0), 0);
  const getUserShare = (expense: ExpenseRow, userId: string) => expense.paid_by === userId ? getPayerShare(expense) : Number(expense.expense_splits?.find((split) => split.user_id === userId)?.amount_owed || 0);
  const getUserPaid = (expense: ExpenseRow, userId: string) => {
    const split = expense.expense_splits?.find((item) => item.user_id === userId);
    return expense.paid_by === userId || Boolean(split?.has_paid) || Number(split?.amount_paid || 0) >= Number(split?.amount_owed || 0);
  };
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== defaultFilters[key as keyof typeof defaultFilters]).length;
  const clearFilters = () => setFilters(defaultFilters);
  const filteredGroupExpenses = sortByDateOrAmount(
    groupExpenses.filter((expense) => {
      const status = getExpenseStatus(expense);
      if (filters.status !== "all" && status !== filters.status) return false;
      if (filters.paidBy === "me" && expense.paid_by !== currentUserId) return false;
      if (filters.paidBy !== "anyone" && filters.paidBy !== "me" && expense.paid_by !== filters.paidBy) return false;
      if (filters.splitType !== "all" && (expense.split_type || "equal") !== filters.splitType) return false;
      return filterByDate(expense.created_at, filters.date as DateFilter);
    }),
    filters.sort as AmountSort,
    (expense) => expense.created_at,
    (expense) => Number(expense.amount || 0),
  );

  return (
    <>
      <main className="space-y-4 pt-4 pb-8">
        <header className="flex items-center gap-3">
          <button onClick={onBack} className="grid size-9 shrink-0 place-items-center rounded-full text-primary hover:bg-primary/10" aria-label="Back to Split">
            <ArrowLeft className="size-4" />
          </button>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-elevated text-2xl shadow-soft">{group.emoji || "🏠"}</div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-foreground">{group.name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{group.group_members.length} members</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${balanceChipClass}`}>{balanceChipText}</span>
            </div>
          </div>
          <button onClick={() => openModal("invite-members", group.id)} className="grid size-9 place-items-center rounded-full text-primary hover:bg-primary/10" aria-label="Invite members"><UserPlus className="size-4" /></button>
          <button onClick={() => openModal("edit-group", group.id)} className="grid size-9 place-items-center rounded-full text-primary hover:bg-primary/10" aria-label="Manage group"><Pencil className="size-4" /></button>
          <button onClick={() => openModal("delete-group", group.id)} className="grid size-9 place-items-center rounded-full text-destructive hover:bg-destructive/10" aria-label="Delete group"><Trash2 className="size-4" /></button>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-border/70 bg-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total spent</p>
            <p className="mt-2 text-2xl font-black text-foreground">{money(totalSpent)}</p>
          </div>
          <div className="rounded-[20px] border border-border/70 bg-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Expenses</p>
            <p className="mt-2 text-2xl font-black text-foreground">{groupExpenses.length}</p>
          </div>
        </section>

        <section className="rounded-[20px] border border-border/70 bg-card p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Members</h2>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-1">
            {group.group_members.map((member) => {
              const name = member.user_id === currentUserId ? "You" : displayName(member.profiles).split(" ")[0];
              return (
                <div key={member.user_id} className="w-14 shrink-0 text-center">
                  <div className="relative mx-auto grid size-11 place-items-center rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-primary-action">
                    {displayName(member.profiles).charAt(0).toUpperCase()}
                    {member.user_id === group.created_by || member.user_id === currentUserId ? <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-warning text-primary-foreground"><Crown className="size-2.5" /></span> : null}
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-foreground">{name}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-[2fr_1fr] gap-3">
          <Button onClick={() => openModal("group-expense", group.id)} className="h-[52px] rounded-2xl shadow-primary-action"><Plus />Add Group Expense</Button>
          <Button onClick={() => openModal("settle-up", group.id)} variant="outline" className="h-[52px] rounded-2xl border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"><Check />Settle Up</Button>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Expense History</h2>
            <FilterTrigger count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
          </div>
          <div className="space-y-3">
            {groupExpenses.length === 0 ? <EmptyCard text="No group expenses yet. Add your first expense" /> : filteredGroupExpenses.length === 0 ? <FilterEmptyState onClear={clearFilters} /> : filteredGroupExpenses.map((expense) => {
              const status = getExpenseStatus(expense);
              const expanded = expandedExpenseId === expense.id;
              const payerName = expense.paid_by === currentUserId ? "You" : displayName(expense.payer_profile || memberMap[expense.paid_by]?.profiles);
              const statusClass = status === "settled" ? "bg-success/15 text-success" : status === "partial" ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning";
              const statusLabel = status === "settled" ? "Paid" : status === "partial" ? "Partial" : "Pending";
              const yourShare = getUserShare(expense, currentUserId);
              const yourPaid = getUserPaid(expense, currentUserId);
              return (
                <article key={expense.id} className="overflow-hidden rounded-[20px] border border-border/70 bg-card transition-colors">
                  <button type="button" onClick={() => setExpandedExpenseId(expanded ? null : expense.id)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-elevated/60">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning"><CircleDollarSign className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{expense.category || "Expense"}</span>
                      <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">Paid by {payerName} · {dateLabel(expense.created_at)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-black text-foreground">{money(expense.amount)}</span>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Open expense actions"
                      onClick={(event) => { event.stopPropagation(); setActionExpense(expense); }}
                      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActionExpense(expense); } }}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    >
                      <MoreVertical className="pointer-events-none size-4" />
                    </span>
                    <ChevronRight className={`size-4 shrink-0 text-primary transition-transform duration-200 ${expanded ? "-rotate-90" : "rotate-90"}`} />
                  </button>
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="border-t border-border/60 px-4 py-3">
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between gap-3"><span className="font-bold text-foreground">Your share</span><span className="font-bold text-foreground">{money(yourShare)}</span></div>
                          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${yourPaid ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{yourPaid ? "Paid" : "Pending"}</span></div>
                          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Split type</span><span className="font-bold capitalize text-foreground">{expense.split_type || "equal"} split</span></div>
                          <button type="button" onClick={(event) => { event.stopPropagation(); setParticipantsExpense(expense); }} className="mt-2 flex w-full items-center justify-between border-t border-border/60 pt-3 text-left font-bold text-primary">
                            <span>View participants ({group.group_members.length})</span>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Group expense filters" onClear={clearFilters}>
        <FilterField label="Status" value={filters.status} onChange={(status) => setFilters((current) => ({ ...current, status }))} options={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "partial", label: "Partial" }, { value: "settled", label: "Settled" }]} />
        <FilterField label="Paid by" value={filters.paidBy} onChange={(paidBy) => setFilters((current) => ({ ...current, paidBy }))} options={[{ value: "anyone", label: "Anyone" }, { value: "me", label: "Me" }, ...group.group_members.filter((member) => member.user_id !== currentUserId).map((member) => ({ value: member.user_id, label: displayName(member.profiles) }))]} />
        <FilterField label="Date" value={filters.date} onChange={(date) => setFilters((current) => ({ ...current, date }))} options={[{ value: "all", label: "All dates" }, { value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }, { value: "year", label: "This year" }]} />
        <FilterField label="Sort" value={filters.sort} onChange={(sort) => setFilters((current) => ({ ...current, sort }))} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "amount-desc", label: "Amount high to low" }, { value: "amount-asc", label: "Amount low to high" }]} />
        <FilterField label="Split type" value={filters.splitType} onChange={(splitType) => setFilters((current) => ({ ...current, splitType }))} options={[{ value: "all", label: "All" }, { value: "equal", label: "Equal split" }, { value: "exact", label: "Exact split" }, { value: "percentage", label: "Percentage" }]} />
      </FilterSheet>

      <Drawer open={Boolean(actionExpense)} onOpenChange={(open) => !open && setActionExpense(null)}>
        <DrawerContent className="mx-auto max-w-3xl rounded-t-3xl border-border bg-card px-4 pb-5">
          <DrawerHeader className="px-0 pb-2 text-left">
            <DrawerTitle>Expense actions</DrawerTitle>
            <DrawerDescription>{actionExpense?.category || "Expense"}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-hidden rounded-2xl bg-elevated/70">
            <button type="button" className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-background/70" onClick={() => actionExpense && navigate(`/split/expense/${actionExpense.id}`)}>View details<ArrowRight className="size-4 text-muted-foreground" /></button>
            <button type="button" className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-background/70" onClick={() => actionExpense && openModal("edit-expense", actionExpense.id)}>Edit expense<Pencil className="size-4 text-muted-foreground" /></button>
            {actionExpense && actionStatus !== "settled" && actionRemaining > 0 ? <button type="button" className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-background/70" onClick={() => actionExpense && settleExpense(actionExpense)}>{actionStatus === "partial" ? `Settle remaining ${money(actionRemaining)}` : "Mark as settled"}<Check className="size-4 text-muted-foreground" /></button> : null}
            <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-destructive hover:bg-destructive/10" onClick={() => actionExpense && openModal("delete-expense", actionExpense.id)}>Delete expense<Trash2 className="size-4" /></button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={Boolean(participantsExpense)} onOpenChange={(open) => !open && setParticipantsExpense(null)}>
        <DrawerContent className="mx-auto max-w-3xl rounded-t-3xl border-border bg-card px-4 pb-5">
          <DrawerHeader className="px-0 pb-2 text-left">
            <DrawerTitle>Participants</DrawerTitle>
            <DrawerDescription>{participantsExpense?.category || "Expense"}</DrawerDescription>
          </DrawerHeader>
          {participantsExpense ? (
            <div className="overflow-hidden rounded-2xl bg-elevated/70">
              {group.group_members.map((member, index) => {
                const split = participantsExpense.expense_splits?.find((item) => item.user_id === member.user_id);
                const isPayer = participantsExpense.paid_by === member.user_id;
                const share = split ? Number(split.amount_owed || 0) : isPayer ? Number(participantsExpense.amount || 0) : 0;
                const paid = isPayer || Boolean(split?.has_paid);
                const name = member.user_id === currentUserId ? "You" : displayName(member.profiles);
                return (
                  <div key={member.user_id} className={`flex items-center gap-3 px-4 py-3 text-sm ${index < group.group_members.length - 1 ? "border-b border-border/60" : ""}`}>
                    <span className={`grid size-7 place-items-center rounded-full ${paid ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{paid ? <Check className="size-4" /> : <CircleDollarSign className="size-4" />}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-foreground">{name}</span>
                    <span className="font-semibold text-muted-foreground">{isPayer ? "paid" : "owes"} {money(share)}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
};

const TiffinView = ({ expenses, openModal }: { expenses: ExpenseRow[]; openModal: (type: ModalType, item?: string) => void }) => {
  const [category, setCategory] = useState<"tiffin" | "delivery">("tiffin");
  const entries = expenses.filter((expense) => expense.category === category);
  const total = entries.reduce((sum, expense) => sum + expense.amount, 0);
  const pending = entries.filter((expense) => expense.status !== "cleared").reduce((sum, expense) => sum + expense.amount, 0);
  const cleared = entries.filter((expense) => expense.status === "cleared").reduce((sum, expense) => sum + expense.amount, 0);
  return (
    <main className="space-y-6">
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <div className="flex rounded-full bg-elevated p-1">
          {(["tiffin", "delivery"] as const).map((item) => (
            <button key={item} onClick={() => setCategory(item)} className={`flex-1 rounded-full px-4 py-2.5 text-sm font-bold capitalize transition-colors ${category === item ? "bg-primary text-primary-foreground shadow-primary-action" : "text-muted-foreground"}`}>{item}</button>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-3 gap-3 text-center">
        {[["Total", money(total)], ["Pending", money(pending)], ["Cleared", money(cleared)]].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-card p-3 shadow-soft"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold text-foreground">{value}</p></div>
        ))}
      </section>
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <p className="mb-2 text-sm font-semibold text-foreground">Quick add</p>
        <div className="flex gap-2">
          <input readOnly className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={`Add ${category} amount`} />
          <Button onClick={() => openModal("log-tiffin", category)} size="icon" className="shadow-primary-action"><Plus /></Button>
        </div>
      </section>
      <section>
        <SectionHeader title={`${category} log`} />
        <div className="space-y-3">
          {entries.length === 0 ? <EmptyCard text={`No ${category} entries yet.`} /> : entries.map((entry) => (
            <article key={entry.id} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-elevated text-primary"><UtensilsCrossed className="size-4" /></span>
                <div><h3 className="font-bold text-foreground">{entry.category}</h3><p className="text-sm text-muted-foreground">{dateLabel(entry.created_at)}</p></div>
              </div>
              <div className="text-right"><p className="font-bold text-foreground">{money(entry.amount)}</p><StatusPill status={entry.status || "pending"} /></div>
            </article>
          ))}
        </div>
      </section>
      <button onClick={() => openModal("log-tiffin", category)} className="fixed bottom-28 right-4 z-20 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-primary-action sm:right-8">
        <Plus className="size-4" />Add {category}
      </button>
    </main>
  );
};

const ProfileView = ({ profile, email, createdAt, theme, onThemeToggle, onSave, openModal }: { profile: Profile | null; email?: string; createdAt?: string; theme: Theme; onThemeToggle: () => void; onSave: (fullName: string, username: string) => Promise<void>; openModal: (type: ModalType, item?: string) => void }) => {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [username, setUsername] = useState(profile?.username || "");

  useEffect(() => {
    setFullName(profile?.full_name || "");
    setUsername(profile?.username || "");
  }, [profile?.full_name, profile?.username]);

  return (
    <main className="space-y-6">
      <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
        <div className="mb-5 flex items-center gap-4"><div className="grid size-16 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-primary-action">{(fullName || email || "S").charAt(0).toUpperCase()}</div><div><h2 className="text-xl font-bold text-foreground">{fullName || email?.split("@")[0] || "Spendova User"}</h2><p className="text-sm text-muted-foreground">@{username || "spendova"}</p></div></div>
        <div className="space-y-3">
          <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Your full name" />
          <Field label="Username" value={username} onChange={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="username" hint="Lowercase letters, numbers, and underscores" />
          <Button onClick={() => onSave(fullName, username)} className="h-11 w-full shadow-primary-action">Save profile</Button>
        </div>
      </section>
      <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
        <div className="space-y-5 text-sm">
          <div className="space-y-3 rounded-2xl bg-elevated p-4 shadow-soft">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Email</span><span className="text-right font-semibold text-foreground">{email}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Member since</span><span className="font-semibold text-foreground">{dateLabel(createdAt)}</span></div>
          </div>
          <button onClick={onThemeToggle} className="flex w-full items-center justify-between rounded-2xl bg-elevated p-4 font-bold text-foreground shadow-soft"><span>Theme</span><span className="flex items-center gap-2 text-primary">{theme === "dark" ? "Dark" : "Light"}{theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}</span></button>
          <div className="pt-1">
            <button onClick={() => openModal("logout")} className="w-full rounded-full bg-destructive/15 px-4 py-3 font-bold text-destructive">Logout</button>
          </div>
        </div>
      </section>
    </main>
  );
};

const ExpenseForm = ({ userId, friends, friend, group, expense, onSubmit, onCancel }: { userId: string; friends: FriendProfile[]; friend?: FriendProfile; group?: GroupRow; expense?: ExpenseRow; onSubmit: (payload: { expense: ExpensePayload; splits: Array<{ user_id: string; amount_owed: number }>; expenseId?: string }) => Promise<void>; onCancel: () => void }) => {
  const isEdit = Boolean(expense);
  const members = group ? group.group_members.map((member) => ({ user_id: member.user_id, name: member.user_id === userId ? "You" : displayName(member.profiles) })) : friend ? [{ user_id: userId, name: "You" }, { user_id: friend.user_id, name: displayName(friend) }] : [{ user_id: userId, name: "You" }, ...friends.map((item) => ({ user_id: item.user_id, name: displayName(item) }))];
  const [name, setName] = useState(expense?.category || "");
  const [date, setDate] = useState(expense?.created_at?.split("T")[0] || new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [note, setNote] = useState(expense?.note || "");
  const [status, setStatus] = useState<"pending" | "cleared">(expense?.status === "cleared" ? "cleared" : "pending");
  const [splitOn, setSplitOn] = useState(Boolean(group || friend || expense?.expense_splits?.length));
  const [strategy, setStrategy] = useState<SplitStrategy>((expense?.split_type as SplitStrategy) || "equal");
  const [participants, setParticipants] = useState<string[]>(group || friend ? members.map((member) => member.user_id) : [userId]);
  const [payer, setPayer] = useState(expense?.paid_by || userId);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = Number(amount);
  const hasSettlementState = Boolean(expense?.expense_splits?.some((split) => Number(split.amount_paid || 0) > 0 || split.has_paid));
  const selectedMembers = members.filter((member) => participants.includes(member.user_id));
  const debtors = selectedMembers.filter((member) => member.user_id !== payer);
  const equalShare = participants.length ? parsedAmount / participants.length : 0;

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !parsedAmount || parsedAmount <= 0 || submitting) return;

    const splits: Array<{ user_id: string; amount_owed: number }> = [];
    if (splitOn) {
      if (participants.length < 2) return;
      if (strategy === "equal") {
        splits.push(...allocateEqualSplitDebts(parsedAmount, participants, payer));
      } else if (strategy === "exact") {
        const total = participants.reduce((sum, id) => sum + Number(splitValues[id] || 0), 0);
        if (Math.abs(total - parsedAmount) > 0.05) return;
        participants.forEach((id) => {
          const amountOwed = Number(splitValues[id] || 0);
          if (id !== payer && amountOwed > 0) splits.push({ user_id: id, amount_owed: amountOwed });
        });
      } else {
        const total = participants.reduce((sum, id) => sum + Number(splitValues[id] || 0), 0);
        if (Math.abs(total - 100) > 0.1) return;
        participants.forEach((id) => {
          const pct = Number(splitValues[id] || 0);
          if (id !== payer && pct > 0) splits.push({ user_id: id, amount_owed: Number(((parsedAmount * pct) / 100).toFixed(2)) });
        });
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        expenseId: expense?.id,
        expense: {
          user_id: expense?.user_id || userId,
          paid_by: splitOn ? payer : userId,
          category: name.trim(),
          amount: parsedAmount,
          note: note.trim() || null,
          status,
          split_type: splitOn ? strategy : "none",
          group_id: group?.id || expense?.group_id || null,
          created_at: new Date(date).toISOString(),
        },
        splits,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Expense name" placeholder="Dinner, groceries..." value={name} onChange={setName} />
      <Field label="Date" type="date" value={date} onChange={setDate} />
      <Field label="Amount" type="number" placeholder="0" value={amount} onChange={setAmount} />
      <Textarea label="Note (optional)" placeholder="Add a note" value={note} onChange={setNote} />
      {isEdit && hasSettlementState ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3 text-xs font-semibold text-warning">
          This expense has settlements. Editing split details is blocked until those settlements are reversed.
        </div>
      ) : null}
      {isEdit && (
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Status</p>
          <div className="flex gap-1 rounded-full bg-elevated p-1">
            {(["pending", "cleared"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setStatus(item)} className={`flex-1 rounded-full px-3 py-2 text-xs font-bold capitalize ${status === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{item}</button>
            ))}
          </div>
        </div>
      )}
      {!group && !friend && (
        <label className="flex items-center justify-between rounded-2xl bg-elevated p-4 text-sm font-semibold text-foreground">
          <span>Split with friends</span>
          <button type="button" onClick={() => setSplitOn((value) => !value)} className={`relative h-6 w-11 rounded-full transition-colors ${splitOn ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${splitOn ? "left-5" : "left-0.5"}`} />
          </button>
        </label>
      )}
      {splitOn && (
        <div className="space-y-3 rounded-2xl border border-border bg-elevated/40 p-3">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Participants</p>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const active = participants.includes(member.user_id);
                return <button key={member.user_id} type="button" onClick={() => toggleParticipant(member.user_id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-input"}`}>{active && <Check className="mr-1 inline size-3" />}{member.name}</button>;
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Who paid</p>
            <select value={payer} onChange={(event) => setPayer(event.target.value)} className="w-full rounded-full border border-input bg-background px-4 py-3 text-sm">
              {selectedMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Strategy</p>
            <div className="flex gap-1 rounded-full bg-background p-1">
              {(["equal", "exact", "percentage"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setStrategy(item)} className={`flex-1 rounded-full px-3 py-2 text-xs font-bold capitalize ${strategy === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{item}</button>
              ))}
            </div>
          </div>
          {strategy === "equal" && <div className="rounded-xl bg-background p-3 text-xs"><p className="font-semibold text-foreground">Each pays {money(Number(equalShare || 0))}</p><p className="mt-1 text-muted-foreground">Payer does not receive a debt row.</p></div>}
          {strategy !== "equal" && (
            <div className="space-y-2">
              {selectedMembers.map((member) => (
                <label key={member.user_id} className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="w-20 truncate">{member.name}</span>
                  <input type="number" value={splitValues[member.user_id] || ""} onChange={(event) => setSplitValues({ ...splitValues, [member.user_id]: event.target.value })} className="flex-1 rounded-full border border-input bg-background px-3 py-2 text-sm" placeholder={strategy === "percentage" ? "0%" : "0"} />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="quiet" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={submitting}>{submitting ? "Saving..." : isEdit ? "Save" : "Add"}</Button>
      </div>
    </form>
  );
};

const TiffinForm = ({ userId, defaultCategory, onSubmit, onCancel }: { userId: string; defaultCategory?: string; onSubmit: (expense: ExpensePayload) => Promise<void>; onCancel: () => void }) => {
  const [category, setCategory] = useState(defaultCategory === "delivery" ? "delivery" : "tiffin");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      const parsed = Number(amount);
      if (!parsed || parsed <= 0 || submitting) return;
      setSubmitting(true);
      try {
        await onSubmit({ user_id: userId, paid_by: userId, category, amount: parsed, status: "pending", split_type: "none", created_at: new Date(date).toISOString() });
      } finally {
        setSubmitting(false);
      }
    }}>
      <div className="flex gap-1 rounded-full bg-elevated p-1">
        {(["tiffin", "delivery"] as const).map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`flex-1 rounded-full px-3 py-2 text-xs font-bold capitalize ${category === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{item}</button>)}
      </div>
      <Field label="Amount" placeholder="0" type="number" value={amount} onChange={setAmount} />
      <Field label="Date" type="date" value={date} onChange={setDate} />
      <div className="flex gap-2 pt-2"><Button type="button" variant="quiet" className="flex-1" onClick={onCancel} disabled={submitting}>Cancel</Button><Button type="submit" className="flex-1" disabled={submitting}>{submitting ? "Saving..." : "Log Expense"}</Button></div>
    </form>
  );
};

const CreateGroupForm = ({ friends, group, onSubmit, onCancel }: { friends: FriendProfile[]; group?: GroupRow; onSubmit: (payload: { name: string; emoji: string; description: string; memberIds: string[]; groupId?: string }) => Promise<void>; onCancel: () => void }) => {
  const [emoji, setEmoji] = useState(group?.emoji || "🏠");
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      if (!name.trim() || submitting) return;
      setSubmitting(true);
      try {
        await onSubmit({ groupId: group?.id, name: name.trim(), emoji, description: description.trim(), memberIds });
      } finally {
        setSubmitting(false);
      }
    }}>
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Emoji</p>
        <div className="flex flex-wrap gap-2">
          {emojiChoices.map((label) => (
            <button key={label} type="button" onClick={() => setEmoji(emojiMap[label])} className={`grid size-10 place-items-center rounded-full text-xl ${emoji === emojiMap[label] ? "bg-primary shadow-primary-action" : "bg-elevated"}`}>{emojiMap[label]}</button>
          ))}
        </div>
      </div>
      <Field label="Group name" placeholder="Flat 4B" value={name} onChange={setName} />
      <Textarea label="Description" placeholder="What's this group about?" value={description} onChange={setDescription} />
      {!group && (
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Add members</p>
          <div className="flex flex-wrap gap-2">
            {friends.map((friend) => {
              const active = memberIds.includes(friend.user_id);
              return <button key={friend.user_id} type="button" onClick={() => setMemberIds(active ? memberIds.filter((id) => id !== friend.user_id) : [...memberIds, friend.user_id])} className={`rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-elevated text-foreground"}`}>{displayName(friend)}</button>;
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-2"><Button type="button" variant="quiet" className="flex-1" onClick={onCancel} disabled={submitting}>Cancel</Button><Button type="submit" className="flex-1" disabled={submitting}>{submitting ? "Saving..." : group ? "Save" : "Create"}</Button></div>
    </form>
  );
};

const AddFriendForm = ({ currentUserId, friends, requests, onRequest, onCancel }: { currentUserId: string; friends: FriendProfile[]; requests: ConnectionRow[]; onRequest: (receiverId: string) => Promise<void>; onCancel: () => void }) => {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<Profile | null>(null);
  const [searching, setSearching] = useState(false);
  const search = async () => {
    if (!username.trim()) return;
    setSearching(true);
    setResult(null);
    const { data, error } = await supabase.from("profiles").select("user_id, full_name, username").eq("username", username.toLowerCase()).maybeSingle();
    setSearching(false);
    if (error || !data) {
      toast({ title: "Not found", description: "No user found with that username.", variant: "destructive" });
      return;
    }
    if (data.user_id === currentUserId) {
      toast({ title: "Invalid search", description: "You cannot add yourself.", variant: "destructive" });
      return;
    }
    setResult(data as Profile);
  };
  const existingIds = new Set([...friends.map((friend) => friend.user_id), ...requests.map((request) => request.profiles.user_id)]);
  return (
    <div className="space-y-3">
      <Field label="Search by username" placeholder="username" value={username} onChange={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
      <Button onClick={search} className="w-full" disabled={searching}>{searching ? "Searching..." : "Search"}</Button>
      {result && (
        <div className="flex items-center justify-between rounded-2xl bg-elevated p-3">
          <div><p className="font-bold text-foreground">{displayName(result)}</p><p className="text-xs text-muted-foreground">@{result.username}</p></div>
          <Button size="sm" disabled={existingIds.has(result.user_id) || result.user_id === currentUserId} onClick={() => onRequest(result.user_id)}><UserPlus />Send request</Button>
        </div>
      )}
      <Button variant="quiet" className="w-full" onClick={onCancel}>Cancel</Button>
    </div>
  );
};

const PickerList = ({ items, emptyText, onPick }: { items: Array<{ id: string; title: string; subtitle: string }>; emptyText: string; onPick: (id: string) => void }) => (
  <div className="space-y-3">
    {items.length === 0 ? <EmptyCard text={emptyText} /> : items.map((item) => (
      <button key={item.id} type="button" onClick={() => onPick(item.id)} className="flex w-full items-center justify-between rounded-2xl bg-elevated p-4 text-left shadow-soft">
        <div><p className="font-bold text-foreground">{item.title}</p><p className="text-sm text-muted-foreground">{item.subtitle}</p></div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
    ))}
  </div>
);

const SettleForm = ({ currentUserId, friend, group, settlement, balances, defaultAmount, onSubmit, onCancel }: { currentUserId: string; friend?: FriendProfile; group?: GroupRow; settlement?: SplitSettlementRow; balances: DebtBalance[]; defaultAmount: number; onSubmit: (payload: SettlementPayload) => Promise<void>; onCancel: () => void }) => {
  const firstBalance = balances[0];
  const [fromUserId, setFromUserId] = useState(settlement?.from_user_id || firstBalance?.fromUserId || currentUserId);
  const [toUserId, setToUserId] = useState(settlement?.to_user_id || firstBalance?.toUserId || friend?.user_id || currentUserId);
  const [amount, setAmount] = useState(settlement?.amount ? String(Number(settlement.amount).toFixed(2)) : defaultAmount > 0 ? String(defaultAmount.toFixed(2)) : "");
  const [date, setDate] = useState(settlement?.created_at?.split("T")[0] || new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState(settlement?.note || "");
  const [submitting, setSubmitting] = useState(false);
  const settlementCounterparty = settlement ? (settlement.from_user_id === currentUserId ? { user_id: settlement.to_user_id, name: displayName(settlement.to_profile) } : { user_id: settlement.from_user_id, name: displayName(settlement.from_profile) }) : null;
  const members = group
    ? group.group_members.map((member) => ({ user_id: member.user_id, name: member.user_id === currentUserId ? "You" : displayName(member.profiles) }))
    : [{ user_id: currentUserId, name: "You" }, ...(friend ? [{ user_id: friend.user_id, name: displayName(friend) }] : settlementCounterparty ? [settlementCounterparty] : [])];
  const parsed = Number(amount);
  const paidDirection = fromUserId === currentUserId ? "me-to-friend" : "friend-to-me";
  const pickSuggestion = (balance: DebtBalance) => {
    setFromUserId(balance.fromUserId);
    setToUserId(balance.toUserId);
    setAmount(balance.amount.toFixed(2));
  };
  const setFriendDirection = (direction: "me-to-friend" | "friend-to-me") => {
    if (!friend) return;
    if (direction === "me-to-friend") {
      setFromUserId(currentUserId);
      setToUserId(friend.user_id);
    } else {
      setFromUserId(friend.user_id);
      setToUserId(currentUserId);
    }
  };

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (!parsed || parsed <= 0 || fromUserId === toUserId || submitting) return;
      setSubmitting(true);
      try {
        await onSubmit({ settlementId: settlement?.id, from_user_id: fromUserId, to_user_id: toUserId, amount: parsed, group_id: group?.id || settlement?.group_id || null, note: note.trim() || null, created_at: new Date(date).toISOString() });
      } finally {
        setSubmitting(false);
      }
    }}>
      {balances.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-elevated p-3">
          <p className="text-xs font-bold uppercase text-muted-foreground">Suggested settlements</p>
          {balances.map((balance) => <button key={`${balance.fromUserId}-${balance.toUserId}`} type="button" onClick={() => pickSuggestion(balance)} className="flex w-full items-center justify-between rounded-xl bg-background px-3 py-2 text-left text-sm"><span className="font-semibold text-foreground">{balance.fromName} pays {balance.toName}</span><span className="font-bold text-primary">{money(balance.amount)}</span></button>)}
        </div>
      )}
      <Field label="Amount" type="number" placeholder="0" value={amount} onChange={setAmount} />
      {friend ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Paid by</p>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-elevated p-1">
            <button type="button" onClick={() => setFriendDirection("me-to-friend")} className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${paidDirection === "me-to-friend" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>I paid friend</button>
            <button type="button" onClick={() => setFriendDirection("friend-to-me")} className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${paidDirection === "friend-to-me" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Friend paid me</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-semibold text-foreground">From<select value={fromUserId} onChange={(event) => setFromUserId(event.target.value)} className="mt-2 w-full rounded-full border border-input bg-background px-4 py-3 text-sm">{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-foreground">To<select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="mt-2 w-full rounded-full border border-input bg-background px-4 py-3 text-sm">{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>
        </div>
      )}
      {settlement ? <Field label="Date" type="date" value={date} onChange={setDate} /> : null}
      <Textarea label="Note (optional)" placeholder="Paid by UPI, cash..." value={note} onChange={setNote} />
      <div className="flex gap-2 pt-2"><Button type="button" variant="quiet" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="submit" className="flex-1" disabled={submitting || !parsed || parsed <= 0 || fromUserId === toUserId}>{submitting ? "Saving..." : "Confirm Settlement"}</Button></div>
    </form>
  );
};

const ActionModal = ({
  modal,
  data,
  currentUserId,
  onClose,
  refresh,
  openModal,
}: {
  modal: ModalState;
  data: AppData;
  currentUserId: string;
  onClose: () => void;
  refresh: () => Promise<void>;
  openModal: (type: ModalType, item?: string) => void;
}) => {
  const { toast } = useToast();
  const { signOut } = useAuth();
  const type = modal.type;
  const expense = data.expenses.find((item) => item.id === modal.item);
  const settlement = data.settlements.find((item) => item.id === modal.item);
  const group = data.groups.find((item) => item.id === modal.item) || data.groups.find((item) => item.id === expense?.group_id);
  const settlementFriendId = settlement ? (settlement.from_user_id === currentUserId ? settlement.to_user_id : settlement.from_user_id) : undefined;
  const friend = data.friends.find((item) => item.user_id === modal.item) || data.friends.find((item) => item.user_id === settlementFriendId);
  const groupExpenses = group ? data.expenses.filter((item) => item.group_id === group.id) : [];
  const balances = group ? computeGroupBalances(data.expenses, data.settlements, group, currentUserId) : [];
  const friendBalances = friend ? buildDebtBalances(data.expenses, data.settlements, { currentUserId, friendId: friend.user_id, groupId: null }) : [];

  const title =
    type === "add-expense" ? "Add expense" :
    type === "group-expense" ? `Add expense - ${group?.name || ""}` :
    type === "log-tiffin" ? "Log amount" :
    type === "chart-details" ? "Spending details" :
    type === "edit-expense" ? "Edit expense" :
    type === "delete-expense" ? "Delete expense" :
    type === "clear-expense" ? "Mark as cleared" :
    type === "create-group" ? "Create group" :
    type === "choose-friend-expense" ? "Choose friend" :
    type === "choose-group-expense" ? "Choose group" :
    type === "edit-group" ? "Edit group" :
    type === "delete-group" ? "Delete group" :
    type === "invite-members" ? "Invite members" :
    type === "group-details" ? group?.name || "Group details" :
    type === "friend-details" ? `${displayName(friend)} details` :
    type === "add-friend" ? "Add friend" :
    type === "remove-friend" ? "Remove friend" :
    type === "friend-requests" ? "Friend requests" :
    type === "settle-up" ? `Settle up - ${group?.name || displayName(friend) || ""}` :
    type === "logout" ? "Logout" :
    type === "notifications" ? "Notifications" : "Saved";

  const closeAndRefresh = async () => {
    await refresh();
    onClose();
  };

  const saveExpense = async ({ expense: payload, splits, expenseId }: { expense: ExpensePayload; splits: Array<{ user_id: string; amount_owed: number }>; expenseId?: string }) => {
    try {
      if (expenseId) {
        const hasSettlementState = Boolean(
          expense?.expense_splits?.some((split) => Number(split.amount_paid || 0) > 0 || split.has_paid) ||
          data.settlements.some((item) => item.expense_id === expenseId)
        );
        if (hasSettlementState) {
          throw new Error("This expense has settlements. Reverse or delete its settlements before editing split details.");
        }
        const { error } = await supabase.from("expenses").update(payload).eq("id", expenseId);
        if (error) throw error;
        await supabase.from("expense_splits").delete().eq("expense_id", expenseId);
        if (splits.length) {
          const { error: splitError } = await supabase.from("expense_splits").insert(splits.map((split) => ({ ...split, expense_id: expenseId, amount_paid: payload.status === "cleared" ? split.amount_owed : 0, has_paid: payload.status === "cleared" })));
          if (splitError) throw splitError;
        }
      } else {
        const { data: inserted, error } = await supabase.from("expenses").insert(payload).select("id").single();
        if (error || !inserted) throw error;
        if (splits.length) {
          const { error: splitError } = await supabase.from("expense_splits").insert(splits.map((split) => ({ ...split, expense_id: inserted.id, amount_paid: payload.status === "cleared" ? split.amount_owed : 0, has_paid: payload.status === "cleared" })));
          if (splitError) throw splitError;
        }
        if (payload.group_id) supabase.functions.invoke("send-expense-notification", { body: { expense_id: inserted.id } }).catch(() => undefined);
      }
      toast({ title: "Expense saved", description: "Balances and history were updated." });
      await closeAndRefresh();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Could not save expense.", variant: "destructive" });
      throw error;
    }
  };

  const deleteExpense = async () => {
    if (!expense) return;
    const { error: settlementError } = await supabase.from("split_settlements" as never).delete().eq("expense_id", expense.id);
    if (settlementError) {
      toast({ title: "Delete failed", description: settlementError.message, variant: "destructive" });
      return;
    }
    const { error: splitError } = await supabase.from("expense_splits").delete().eq("expense_id", expense.id);
    if (splitError) {
      toast({ title: "Delete failed", description: splitError.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Expense deleted", description: "Balances were updated for everyone involved." });
      await closeAndRefresh();
    }
  };

  const saveSettlement = async (payload: SettlementPayload) => {
    const { error } = await supabase.rpc("record_split_settlement" as never, {
      p_from_user_id: payload.from_user_id,
      p_to_user_id: payload.to_user_id,
      p_amount: payload.amount,
      p_group_id: payload.group_id || null,
      p_expense_id: null,
      p_note: payload.note || null,
    } as never);
    if (error) {
      toast({ title: "Settlement failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Settlement saved", description: "Balances were updated." });
    await closeAndRefresh();
  };

  const clearExpense = async () => {
    if (!expense) return;
    if (!isPersonalOnlyExpense(expense)) {
      toast({ title: "Cannot clear here", description: "Split and group expenses must be settled from the Split page.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("expenses").update({ status: "cleared" }).eq("id", expense.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else {
      const splitUpdates = await Promise.all((expense.expense_splits || []).map((split) => supabase.from("expense_splits").update({ has_paid: true, amount_paid: split.amount_owed }).eq("id", split.id)));
      const splitError = splitUpdates.find((result) => result.error)?.error;
      if (splitError) toast({ title: "Split update failed", description: splitError.message, variant: "destructive" });
      else await closeAndRefresh();
    }
  };

  const saveGroup = async (payload: { name: string; emoji: string; description: string; memberIds: string[]; groupId?: string }) => {
    if (payload.groupId) {
      const { error } = await supabase.from("groups").update({ name: payload.name, emoji: payload.emoji, description: payload.description || null } as never).eq("id", payload.groupId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase.from("groups").insert({ name: payload.name, emoji: payload.emoji, description: payload.description || null, created_by: currentUserId } as never).select("id").single();
      if (error || !inserted) throw error;
      const members = [{ group_id: inserted.id, user_id: currentUserId }, ...payload.memberIds.map((user_id) => ({ group_id: inserted.id, user_id }))];
      const { error: memberError } = await supabase.from("group_members").insert(members);
      if (memberError) throw memberError;
    }
    await closeAndRefresh();
  };

  const sendInvite = async (email: string) => {
    if (!group || !email.trim()) return;
    const { data: inviteResult, error } = await supabase.functions.invoke("send-invite", { body: { email: email.trim().toLowerCase(), group_id: group.id, group_name: group.name, inviter_name: "A friend" } });
    if (error) toast({ title: "Invite failed", description: error.message, variant: "destructive" });
    else {
      if (inviteResult && inviteResult.emailSent === false) toast({ title: "Invite link created", description: "Email could not be sent. Copy the invite link manually." });
      else toast({ title: "Invite sent" });
      await closeAndRefresh();
    }
  };

  return (
    <Dialog open={type !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[1.25rem] border-border bg-card shadow-panel sm:w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription>{type === "notifications" ? "Pending settlements, invites, and recent activity." : type === "saved" ? `${modal.item ?? "Action"} saved.` : "Complete the fields below."}</DialogDescription>
        </DialogHeader>

        {(type === "add-expense" || type === "group-expense" || type === "edit-expense") && (
          <ExpenseForm userId={currentUserId} friends={data.friends} friend={type === "add-expense" ? friend : undefined} group={type === "group-expense" ? group : undefined} expense={type === "edit-expense" ? expense : undefined} onSubmit={saveExpense} onCancel={onClose} />
        )}

        {type === "choose-friend-expense" && <PickerList items={data.friends.map((item) => ({ id: item.user_id, title: displayName(item), subtitle: `@${item.username || "user"}` }))} emptyText="Add friends to start splitting expenses" onPick={(id) => openModal("add-expense", id)} />}
        {type === "choose-group-expense" && <PickerList items={data.groups.map((item) => ({ id: item.id, title: item.name, subtitle: `${item.group_members.length} members` }))} emptyText="Create a group to split shared expenses" onPick={(id) => openModal("group-expense", id)} />}

        {type === "log-tiffin" && <TiffinForm userId={currentUserId} defaultCategory={modal.item} onSubmit={async (payload) => { const { error } = await supabase.from("expenses").insert(payload); if (error) throw error; await closeAndRefresh(); }} onCancel={onClose} />}
        {(type === "create-group" || type === "edit-group") && <CreateGroupForm friends={data.friends} group={type === "edit-group" ? group : undefined} onSubmit={saveGroup} onCancel={onClose} />}

        {type === "group-details" && group && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-elevated p-4 text-sm"><p className="font-semibold text-foreground">Balance: {money(groupExpenses.reduce((sum, item) => sum + item.amount, 0))}</p><p className="mt-1 text-muted-foreground">{group.group_members.length} active members - Latest: {groupExpenses[0]?.category || "None"}</p></div>
            <div className="space-y-2">
              {group.group_members.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between rounded-2xl bg-elevated p-3 text-sm">
                  <span className="font-semibold text-foreground">{member.user_id === currentUserId ? "You" : displayName(member.profiles)}</span>
                  <button onClick={async () => { const { error } = await supabase.from("group_members").delete().eq("group_id", group.id).eq("user_id", member.user_id); if (error) { toast({ title: "Remove failed", description: error.message, variant: "destructive" }); return; } await closeAndRefresh(); }} className="text-xs font-bold text-destructive">Remove</button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {groupExpenses.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl bg-elevated p-3 text-sm">
                  <span className="font-semibold text-foreground">{item.category}</span>
                  <span className="font-bold">{money(item.amount)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="quiet" onClick={() => openModal("edit-group", group.id)}><Pencil />Edit</Button>
              <Button variant="destructive" onClick={() => openModal("delete-group", group.id)}><Trash2 />Delete</Button>
            </div>
          </div>
        )}

        {type === "invite-members" && group && <InviteMembers group={group} invites={data.groupInvites[group.id] || []} onInvite={sendInvite} />}
        {type === "add-friend" && <AddFriendForm currentUserId={currentUserId} friends={data.friends} requests={[...data.incomingRequests, ...data.outgoingRequests]} onRequest={async (receiverId) => { if (receiverId === currentUserId) { toast({ title: "Request failed", description: "You cannot send a friend request to yourself.", variant: "destructive" }); return; } const { error } = await supabase.from("connections").insert({ requester_id: currentUserId, receiver_id: receiverId, status: "pending" }); if (error) toast({ title: "Request failed", description: error.message, variant: "destructive" }); else await closeAndRefresh(); }} onCancel={onClose} />}

        {type === "friend-requests" && (
          <div className="space-y-4">
            <div><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Incoming</p><div className="space-y-2">{data.incomingRequests.length === 0 ? <EmptyCard text="No incoming requests." /> : data.incomingRequests.map((request) => <RequestCard key={request.id} request={request} onAccept={async () => { const { error } = await supabase.from("connections").update({ status: "accepted" }).eq("id", request.id); if (error) { toast({ title: "Accept failed", description: error.message, variant: "destructive" }); return; } await closeAndRefresh(); }} onReject={async () => { const { error } = await supabase.from("connections").update({ status: "rejected" }).eq("id", request.id); if (error) { toast({ title: "Reject failed", description: error.message, variant: "destructive" }); return; } await closeAndRefresh(); }} />)}</div></div>
            <div><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Outgoing</p><div className="space-y-2">{data.outgoingRequests.length === 0 ? <EmptyCard text="No outgoing requests." /> : data.outgoingRequests.map((request) => <div key={request.id} className="flex items-center justify-between rounded-2xl bg-elevated p-3"><div><p className="font-bold text-foreground">{displayName(request.profiles)}</p><p className="text-xs text-muted-foreground">@{request.profiles.username}</p></div><Button size="sm" variant="quiet" onClick={async () => { const { error } = await supabase.from("connections").delete().eq("id", request.id); if (error) { toast({ title: "Cancel failed", description: error.message, variant: "destructive" }); return; } await closeAndRefresh(); }}>Cancel</Button></div>)}</div></div>
          </div>
        )}

        {type === "friend-details" && friend && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-2xl bg-elevated p-4 text-sm">
              {data.expenses.filter((expense) => expense.paid_by === friend.user_id || expense.expense_splits?.some((split) => split.user_id === friend.user_id)).slice(0, 4).map((item) => <div key={item.id} className="flex justify-between"><span className="text-muted-foreground">{item.category}</span><span className="font-semibold text-foreground">{money(item.amount)}</span></div>)}
            </div>
            <Button variant="destructive" className="w-full" onClick={async () => { const { error } = await supabase.from("connections").delete().eq("id", friend.connection_id); if (error) { toast({ title: "Remove failed", description: error.message, variant: "destructive" }); return; } await closeAndRefresh(); }}><UserMinus />Remove friend</Button>
          </div>
        )}

        {type === "settle-up" && (group || friend) && (
          <SettleForm currentUserId={currentUserId} friend={friend} group={group} balances={group ? balances : friendBalances} defaultAmount={(group ? balances : friendBalances).find((balance) => balance.fromUserId === currentUserId || balance.toUserId === currentUserId)?.amount || 0} onSubmit={saveSettlement} onCancel={onClose} />
        )}

        {type === "delete-expense" && <ConfirmBox title="Delete expense?" text="This will update balances for everyone involved." action="Delete" destructive onCancel={onClose} onConfirm={deleteExpense} />}
        {type === "clear-expense" && <ConfirmBox text={`Mark "${expense?.category || "expense"}" as cleared?`} action="Mark cleared" onCancel={onClose} onConfirm={clearExpense} />}
        {type === "delete-group" && group && <ConfirmBox title="Delete group?" text="This will remove the group but will not affect your personal account data." action="Delete" destructive onCancel={onClose} onConfirm={async () => { const { error } = await supabase.from("groups").delete().eq("id", group.id); if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; } await closeAndRefresh(); }} />}
        {type === "remove-friend" && friend && <ConfirmBox text={`Remove ${displayName(friend)} from your friends?`} action="Remove" destructive onCancel={onClose} onConfirm={async () => { const { error } = await supabase.from("connections").delete().eq("id", friend.connection_id); if (error) { toast({ title: "Remove failed", description: error.message, variant: "destructive" }); return; } await closeAndRefresh(); }} />}
        {type === "logout" && <ConfirmBox text="This will return you to the signed-out state." action="Logout" destructive onCancel={onClose} onConfirm={async () => { await signOut(); onClose(); }} />}
        {type === "notifications" && <NotificationsList data={data} currentUserId={currentUserId} />}
        {type === "chart-details" && <SpendingDetails expenses={data.expenses} currentUserId={currentUserId} />}
        {type === "saved" && <EmptyCard text="Saved." />}
      </DialogContent>
    </Dialog>
  );
};

const InviteMembers = ({ group, invites, onInvite }: { group: GroupRow; invites: InviteRow[]; onInvite: (email: string) => Promise<void> }) => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inviteToken = invites.find((invite) => invite.status === "pending")?.token;
  const link = inviteToken ? `${window.location.origin}/accept-invite?token=${inviteToken}` : "";
  const submitInvite = async () => {
    if (submitting || !email.trim()) return;
    setSubmitting(true);
    try {
      await onInvite(email);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl bg-elevated p-3">
        <input readOnly value={link || "Send an invite to generate a link"} className="min-w-0 flex-1 bg-transparent text-xs font-mono outline-none" />
        <Button size="sm" variant="quiet" disabled={!link} onClick={() => navigator.clipboard?.writeText(link)}><Copy />Copy</Button>
      </div>
      <Field label="Invite by email" type="email" value={email} onChange={setEmail} placeholder="friend@email.com" />
      <Button className="w-full" onClick={submitInvite} disabled={submitting || !email.trim()}>{submitting ? "Sending..." : "Send invite"}</Button>
      {invites.length > 0 && <div className="space-y-2">{invites.map((invite) => <div key={invite.id} className="rounded-2xl bg-elevated p-3 text-sm"><span className="font-semibold">{invite.email}</span><span className="ml-2 text-muted-foreground">{invite.status}</span></div>)}</div>}
    </div>
  );
};

const RequestCard = ({ request, onAccept, onReject }: { request: ConnectionRow; onAccept: () => void; onReject: () => void }) => (
  <div className="flex items-center justify-between rounded-2xl bg-elevated p-3">
    <div><p className="font-bold text-foreground">{displayName(request.profiles)}</p><p className="text-xs text-muted-foreground">@{request.profiles.username}</p></div>
    <div className="flex gap-2"><Button size="sm" onClick={onAccept}><Check />Accept</Button><Button size="sm" variant="quiet" onClick={onReject}><X />Reject</Button></div>
  </div>
);

const ConfirmBox = ({ title, text, action, destructive, onCancel, onConfirm }: { title?: string; text: string; action: string; destructive?: boolean; onCancel: () => void; onConfirm: () => Promise<void> | void }) => {
  const [submitting, setSubmitting] = useState(false);
  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-elevated p-4 text-sm text-muted-foreground">
        {title ? <p className="mb-1 font-bold text-foreground">{title}</p> : null}
        <p>{text}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="quiet" className="flex-1" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button variant={destructive ? "destructive" : "default"} className="flex-1" onClick={handleConfirm} disabled={submitting}>{submitting ? "Processing..." : action}</Button>
      </div>
    </div>
  );
};

const Index = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const isSplitRoute = location.pathname.startsWith("/split");
  const isProfileRoute = location.pathname === "/profile";
  const friendDetailId = location.pathname.startsWith("/split/friend/") ? params.id : undefined;
  const groupDetailId = location.pathname.startsWith("/split/group/") ? params.id : undefined;
  const expenseDetailId = location.pathname.startsWith("/split/expense/") ? params.id : undefined;
  const settlementDetailId = location.pathname.startsWith("/split/settlement/") ? params.id : undefined;
  const [activeTab, setActiveTabState] = useState<TabKey>(isSplitRoute ? "split" : "home");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const { data, loading, refresh } = useSpendovaData(user?.id);
  const { toast } = useToast();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  }, [theme]);

  if (!authLoading && !user) return <Navigate to="/login" replace />;

  const setActiveTab = (tab: TabKey) => {
    setActiveTabState(tab);
    if (tab === "split") navigate("/split");
    else if (location.pathname.startsWith("/split") || isProfileRoute) navigate("/dashboard");
  };

  const activeContentTab: ContentKey = isProfileRoute ? "profile" : isSplitRoute ? "split" : activeTab;
  const title = friendDetailId ? "Friend" : groupDetailId ? "Group" : expenseDetailId ? "Expense" : settlementDetailId ? "Settlement" : isProfileRoute ? "Profile" : tabs.find((tab) => tab.key === activeContentTab)?.label ?? "Home";
  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));
  const openModal = (type: ModalType, item?: string) => setModal({ type, item });
  const summary = user ? getSummary(data.expenses, user.id, data.settlements) : getSummary([], "");

  const saveProfile = async (fullName: string, username: string) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: fullName, username }).eq("user_id", user.id);
    if (error) toast({ title: "Profile update failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Profile updated" });
      await refresh();
    }
  };

  if (authLoading || loading || !user) {
    return <div className="grid min-h-screen place-items-center bg-background text-foreground">Loading Spendova...</div>;
  }

  const friendDetail = friendDetailId ? data.friends.find((friend) => friend.user_id === friendDetailId) : undefined;
  const groupDetail = groupDetailId ? data.groups.find((group) => group.id === groupDetailId) : undefined;
  const expenseDetail = expenseDetailId ? data.expenses.find((expense) => expense.id === expenseDetailId) : undefined;
  const settlementDetail = settlementDetailId ? data.settlements.find((settlement) => settlement.id === settlementDetailId) : undefined;
  const backToSplit = () => navigate("/split");
  const deleteSettlement = async (settlementId: string) => {
    const { error } = await supabase.rpc("delete_split_settlement" as never, { p_settlement_id: settlementId } as never);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Settlement deleted", description: "Balances were restored." });
    await refresh();
    navigate("/split");
  };
  const showingDetailPage = Boolean(friendDetail || groupDetail || expenseDetail || settlementDetail);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-3xl px-4 pb-36 sm:px-6">
        {!showingDetailPage && <AppHeader title={title === "Home" ? "Overview" : title} theme={theme} onThemeToggle={toggleTheme} onProfile={() => navigate("/profile")} openModal={openModal} />}
        {friendDetailId && !friendDetail && <EmptyCard text="Friend not found." />}
        {groupDetailId && !groupDetail && <EmptyCard text="Group not found." />}
        {expenseDetailId && !expenseDetail && <EmptyCard text="Expense not found." />}
        {settlementDetailId && !settlementDetail && <EmptyCard text="Settlement not found." />}
        {friendDetail && <FriendDetailView friend={friendDetail} data={data} currentUserId={user.id} theme={theme} onThemeToggle={toggleTheme} openModal={openModal} onBack={backToSplit} refresh={refresh} />}
        {expenseDetail && <ExpenseDetailView expense={expenseDetail} settlements={data.settlements} currentUserId={user.id} openModal={openModal} onBack={backToSplit} refresh={refresh} />}
        {settlementDetail && <SettlementDetailView settlement={settlementDetail} currentUserId={user.id} onBack={backToSplit} onDelete={deleteSettlement} />}
        {groupDetail && <GroupDetailView group={groupDetail} data={data} currentUserId={user.id} openModal={openModal} onBack={backToSplit} refresh={refresh} />}
        {!friendDetailId && !groupDetailId && !expenseDetailId && !settlementDetailId && activeContentTab === "home" && <HomeView expenses={data.expenses} settlements={data.settlements} userId={user.id} setTab={setActiveTab} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && !expenseDetailId && !settlementDetailId && activeContentTab === "personal" && <PersonalView expenses={data.expenses} settlements={data.settlements} summary={summary} currentUserId={user.id} groups={data.groups} friends={data.friends} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && !expenseDetailId && !settlementDetailId && activeContentTab === "split" && <SplitView data={data} currentUserId={user.id} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && !expenseDetailId && !settlementDetailId && activeContentTab === "tiffin" && <TiffinView expenses={data.expenses} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && !expenseDetailId && !settlementDetailId && activeContentTab === "profile" && <ProfileView profile={profile} email={user.email} createdAt={user.created_at} theme={theme} onThemeToggle={toggleTheme} onSave={saveProfile} openModal={openModal} />}
        <p className="pt-10 text-center text-xs font-medium text-muted-foreground">© 2026 Spendova. All rights reserved.</p>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-3xl px-4 pb-4">
        <div className="grid grid-cols-4 rounded-[1.4rem] border border-border/80 bg-card p-2 shadow-panel backdrop-blur">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeContentTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-bold transition-all ${active ? "bg-primary text-primary-foreground shadow-primary-action" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <ActionModal modal={modal} data={data} currentUserId={user.id} onClose={() => setModal({ type: null })} refresh={refresh} openModal={openModal} />
    </div>
  );
};

export default Index;
