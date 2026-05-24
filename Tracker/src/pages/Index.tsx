import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Filter,
  Home,
  Link as LinkIcon,
  Moon,
  Pencil,
  Plus,
  Search,
  Split,
  Sun,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  UtensilsCrossed,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

type TabKey = "home" | "personal" | "split" | "tiffin" | "profile";
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
  { key: "personal", label: "Personal", icon: WalletCards },
  { key: "split", label: "Split", icon: Split },
  { key: "tiffin", label: "Tiffin", icon: UtensilsCrossed },
  { key: "profile", label: "Profile", icon: User },
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

const AppHeader = ({ title, theme, onThemeToggle, openModal }: { title: string; theme: Theme; onThemeToggle: () => void; openModal: (type: ModalType, item?: string) => void }) => (
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
            expense_splits(id, user_id, amount_owed, has_paid, profiles!expense_splits_user_id_fkey(user_id, full_name, username))
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
          .select("id, group_id, from_user_id, to_user_id, amount, note, created_at, from_profile:profiles!split_settlements_from_user_id_fkey(user_id, full_name, username), to_profile:profiles!split_settlements_to_user_id_fkey(user_id, full_name, username)")
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

type DebtBalance = { fromUserId: string; toUserId: string; fromName: string; toName: string; amount: number };

function getProfileName(userId: string, profiles: Record<string, string>, currentUserId?: string) {
  if (currentUserId && userId === currentUserId) return "You";
  return profiles[userId] || "Unknown";
}

function buildDebtBalances(expenses: ExpenseRow[], settlements: SplitSettlementRow[], options: { currentUserId?: string; groupId?: string | null; friendId?: string } = {}) {
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
      if (split.has_paid) return;
      if (options.friendId && expense.paid_by !== options.friendId && split.user_id !== options.friendId) return;
      addName(split.profiles);
      addDebt(split.user_id, expense.paid_by, Number(split.amount_owed || 0));
    });
  });

  settlements.forEach((settlement) => {
    if (options.groupId !== undefined && settlement.group_id !== options.groupId) return;
    if (options.friendId && settlement.from_user_id !== options.friendId && settlement.to_user_id !== options.friendId) return;
    addName(settlement.from_profile);
    addName(settlement.to_profile);
    addDebt(settlement.from_user_id, settlement.to_user_id, -Number(settlement.amount || 0));
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

    if (!isFood) {
      const share = getExpenseShare(expense, userId);
      personal += share;
      if (expense.status === "cleared" || mySplit?.has_paid) personalCleared += share;
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

function computeGroupBalances(expenses: ExpenseRow[], settlements: SplitSettlementRow[], group: GroupRow, currentUserId?: string) {
  const balances = buildDebtBalances(expenses, settlements, { currentUserId, groupId: group.id });
  const memberNames = Object.fromEntries(group.group_members.map((member) => [member.user_id, member.user_id === currentUserId ? "You" : displayName(member.profiles)]));
  return balances.map((balance) => ({ ...balance, fromName: memberNames[balance.fromUserId] || balance.fromName, toName: memberNames[balance.toUserId] || balance.toName }));
}

const HomeView = ({ expenses, settlements, userId, setTab, openModal }: { expenses: ExpenseRow[]; settlements: SplitSettlementRow[]; userId: string; setTab: (tab: TabKey) => void; openModal: (type: ModalType, item?: string) => void }) => {
  const [range, setRange] = useState<"week" | "month" | "year">("month");
  const [status, setStatus] = useState<"all" | "pending" | "cleared">("all");
  const clear = () => { setRange("month"); setStatus("all"); };
  const rangedExpenses = filterExpensesByRange(expenses, range);
  const filteredExpenses = rangedExpenses.filter((expense) => status === "all" || expense.status === status);
  const summary = getSummary(filteredExpenses, userId, settlements);
  const recent = filteredExpenses.slice(0, 3);

  return (
    <main className="space-y-6">
      <section className="rounded-[1.4rem] bg-card p-5 shadow-panel">
        <p className="text-sm font-medium text-muted-foreground">Net balance</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div><p className="text-4xl font-bold tracking-tight text-foreground">{money(Math.abs(summary.net))}</p><p className="mt-1 text-sm text-muted-foreground">Across personal, tiffin, and splits</p></div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${summary.net >= 0 ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{summary.net >= 0 ? "positive" : "owed"}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => openModal("chart-details")} className="rounded-2xl bg-elevated p-4 text-left shadow-soft"><p className="text-xs font-semibold text-muted-foreground">Total lent</p><p className="mt-1 text-xl font-bold text-foreground">{money(summary.totalLent)}</p></button>
          <button onClick={() => openModal("chart-details")} className="rounded-2xl bg-elevated p-4 text-left shadow-soft"><p className="text-xs font-semibold text-muted-foreground">Total owed</p><p className="mt-1 text-xl font-bold text-foreground">{money(summary.totalOwed)}</p></button>
        </div>
      </section>

      <section className="rounded-[1.25rem] bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground"><Filter className="size-4" /> Filters</p>
          <button onClick={clear} className="text-xs font-semibold text-primary">Clear</button>
        </div>
        <div className="space-y-2">
          <div className="flex gap-1 rounded-full bg-elevated p-1">
            {(["week", "month", "year"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{r}</button>
            ))}
          </div>
          <div className="flex gap-1 rounded-full bg-elevated p-1">
            {(["all", "pending", "cleared"] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors ${status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{s}</button>
            ))}
          </div>
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
        <button onClick={() => openModal("chart-details")} className="flex h-32 w-full items-end gap-3 rounded-2xl bg-elevated p-4" aria-label="Weekly spending bar chart">
          {[summary.personal, summary.totalLent, summary.totalOwed, summary.tiffinPending, summary.tiffinCleared, summary.personalPending, summary.personalCleared].map((value, index) => {
            const max = Math.max(summary.personal, summary.totalLent, summary.totalOwed, summary.tiffinPending, summary.tiffinCleared, 1);
            return <span key={index} className="flex flex-1 flex-col items-center gap-2"><span className="w-full rounded-full bg-primary/80" style={{ height: `${Math.max(8, (value / max) * 100)}%` }} /></span>;
          })}
        </button>
        <div className="mt-3 flex justify-between text-xs font-medium text-muted-foreground"><span>Personal</span><span>Lent</span><span>Owed</span><span>Food</span></div>
      </section>

      <section>
        <SectionHeader title="Recent activity" />
        <div className="space-y-3">
          {recent.length === 0 ? <EmptyCard text="No activity yet." /> : recent.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft">
              <div><h3 className="font-bold text-foreground">{expense.category || "Expense"}</h3><p className="text-sm text-muted-foreground">{dateLabel(expense.created_at)}</p></div>
              <div className="text-right"><p className="font-bold text-foreground">{money(expense.amount)}</p><StatusPill status={expense.status || "pending"} /></div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Shortcuts" />
        <div className="space-y-3">
          {[
            { title: "Personal", value: money(summary.personal), icon: WalletCards, tab: "personal" as TabKey },
            { title: "Split", value: money(summary.totalLent + summary.totalOwed), icon: Split, tab: "split" as TabKey },
            { title: "Tiffin", value: money(summary.tiffinPending + summary.tiffinCleared), icon: UtensilsCrossed, tab: "tiffin" as TabKey },
          ].map((item) => <button key={item.title} onClick={() => setTab(item.tab)} className="flex w-full items-center justify-between rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel"><span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-elevated text-primary"><item.icon className="size-4" /></span><span><span className="block font-bold text-foreground">{item.title}</span><span className="text-sm text-muted-foreground">Current data</span></span></span><span className="flex items-center gap-2 font-bold text-foreground">{item.value}<ChevronRight className="size-4 text-muted-foreground" /></span></button>)}
        </div>
      </section>
    </main>
  );
};

const EmptyCard = ({ text }: { text: string }) => <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-medium text-muted-foreground">{text}</div>;

const PersonalView = ({ expenses, summary, currentUserId, openModal }: { expenses: ExpenseRow[]; summary: ReturnType<typeof getSummary>; currentUserId: string; openModal: (type: ModalType, item?: string) => void }) => {
  const personalExpenses = expenses.filter((expense) => expense.category !== "tiffin" && expense.category !== "delivery" && !expense.group_id);
  return (
    <main className="space-y-6">
      <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
        <p className="text-sm font-medium text-muted-foreground">Personal spend</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{money(summary.personal)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[["Total", money(summary.personal)], ["Pending", money(summary.personalPending)], ["Cleared", money(summary.personalCleared)]].map(([label, value]) => <div key={label} className="rounded-2xl bg-elevated p-3 shadow-soft"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold text-foreground">{value}</p></div>)}
        </div>
      </section>
      <section>
        <SectionHeader title="Personal expenses" action="Add" onAction={() => openModal("add-expense")} />
        <div className="space-y-3">
          {personalExpenses.length === 0 ? <EmptyCard text="No personal expenses yet." /> : personalExpenses.map((expense) => (
            <article key={expense.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-bold text-foreground">{expense.category || "Expense"}</h3><p className="mt-1 text-sm text-muted-foreground">{dateLabel(expense.created_at)}{expense.note ? ` - ${expense.note}` : ""}</p></div>
                <div className="text-right"><p className="font-bold text-foreground">{money(getExpenseShare(expense, currentUserId) || expense.amount)}</p><StatusPill status={expense.status || "pending"} /></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => openModal("edit-expense", expense.id)} variant="quiet" size="sm"><Pencil />Edit</Button>
                <Button onClick={() => openModal("delete-expense", expense.id)} variant="quiet" size="sm"><Trash2 />Delete</Button>
                {expense.status === "pending" && <Button onClick={() => openModal("clear-expense", expense.id)} variant="quiet" size="sm"><Check />Clear</Button>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};

const SplitView = ({ data, currentUserId, openModal }: { data: AppData; currentUserId: string; openModal: (type: ModalType, item?: string) => void }) => {
  const navigate = useNavigate();
  const [subTab, setSubTabState] = useState<"friends" | "groups">(() => (sessionStorage.getItem("spendova-split-tab") === "groups" ? "groups" : "friends"));
  const [query, setQuery] = useState("");
  const filteredFriends = data.friends.filter((friend) => displayName(friend).toLowerCase().includes(query.toLowerCase()) || (friend.username || "").toLowerCase().includes(query.toLowerCase()));
  const summary = getSummary(data.expenses, currentUserId, data.settlements);
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
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-full border border-input bg-background px-4 py-3 shadow-soft">
            <Search className="size-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search friends" />
          </div>
          <div className="space-y-3">
            {filteredFriends.length === 0 ? <EmptyCard text={data.friends.length === 0 ? "Add friends to start splitting expenses" : "No friends found."} /> : filteredFriends.map((friend) => {
              const balances = buildDebtBalances(data.expenses, data.settlements, { currentUserId, friendId: friend.user_id, groupId: null });
              const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
              const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
              const net = owedToMe - iOwe;
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
            <SectionHeader title="Groups" />
            <div className="space-y-3">
              {data.groups.length === 0 ? <EmptyCard text="Create a group to split shared expenses" /> : data.groups.map((group) => {
                const balances = computeGroupBalances(data.expenses, data.settlements, group, currentUserId);
                const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
                const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
                const net = owedToMe - iOwe;
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

const FriendDetailView = ({ friend, data, currentUserId, openModal, onBack }: { friend: FriendProfile; data: AppData; currentUserId: string; openModal: (type: ModalType, item?: string) => void; onBack: () => void }) => {
  const balances = buildDebtBalances(data.expenses, data.settlements, { currentUserId, friendId: friend.user_id, groupId: null });
  const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const net = owedToMe - iOwe;
  const expenses = data.expenses.filter((expense) => !expense.group_id && (expense.paid_by === friend.user_id || expense.paid_by === currentUserId) && expense.expense_splits?.some((split) => split.user_id === friend.user_id || split.user_id === currentUserId));
  const settlements = data.settlements.filter((settlement) => !settlement.group_id && [settlement.from_user_id, settlement.to_user_id].includes(friend.user_id) && [settlement.from_user_id, settlement.to_user_id].includes(currentUserId));
  const history: HistoryItem[] = [
    ...expenses.map((expense) => ({
      id: expense.id,
      created_at: expense.created_at,
      kind: "expense" as const,
      title: expense.category || "Expense",
      detail: `${expense.paid_by === currentUserId ? "You" : displayName(friend)} paid ${money(expense.amount)}${expense.split_type ? ` - ${expense.split_type} split` : ""}`,
      amount: expense.amount,
    })),
    ...settlements.map((settlement) => ({
      id: settlement.id,
      created_at: settlement.created_at,
      kind: "settlement" as const,
      title: "Settlement",
      detail: `${settlement.from_user_id === currentUserId ? "You" : displayName(friend)} paid ${settlement.to_user_id === currentUserId ? "you" : displayName(friend)}${settlement.note ? ` - ${settlement.note}` : ""}`,
      amount: settlement.amount,
    })),
  ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return (
    <main className="space-y-6">
      <DetailHeader title={displayName(friend)} subtitle={`@${friend.username || "user"}`} balance={net} onBack={onBack} />
      <section className="grid grid-cols-2 gap-3">
        <Button onClick={() => openModal("add-expense", friend.user_id)} className="h-12 shadow-primary-action"><Plus />Add Expense</Button>
        <Button onClick={() => openModal("settle-up", friend.user_id)} variant="quiet" className="h-12"><Check />Settle Up</Button>
      </section>
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <SectionHeader title="Settlement history" />
        <div className="space-y-2">{settlements.length === 0 ? <EmptyCard text="No settlements yet." /> : settlements.map((settlement) => <div key={settlement.id} className="rounded-2xl bg-elevated p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-foreground">{settlement.from_user_id === currentUserId ? "You" : displayName(friend)} paid {settlement.to_user_id === currentUserId ? "you" : displayName(friend)}</span><span className="font-bold text-primary">{money(settlement.amount)}</span></div><p className="mt-1 text-xs text-muted-foreground">{dateLabel(settlement.created_at)}{settlement.note ? ` - ${settlement.note}` : ""}</p></div>)}</div>
      </section>
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <SectionHeader title="History" />
        <div className="space-y-3">
          {history.length === 0 ? <EmptyCard text="No expenses yet. Add your first expense" /> : history.map((item) => (
            <article key={`${item.kind}-${item.id}`} className="rounded-2xl bg-elevated p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-bold text-foreground">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.created_at)}</p></div>
                <p className="font-bold text-foreground">{money(item.amount)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <Button variant="destructive" className="w-full" onClick={() => openModal("remove-friend", friend.user_id)}><UserMinus />Remove Friend</Button>
    </main>
  );
};

const GroupDetailView = ({ group, data, currentUserId, openModal, onBack }: { group: GroupRow; data: AppData; currentUserId: string; openModal: (type: ModalType, item?: string) => void; onBack: () => void }) => {
  const balances = computeGroupBalances(data.expenses, data.settlements, group, currentUserId);
  const owedToMe = balances.filter((balance) => balance.toUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const iOwe = balances.filter((balance) => balance.fromUserId === currentUserId).reduce((sum, balance) => sum + balance.amount, 0);
  const net = owedToMe - iOwe;
  const groupExpenses = data.expenses.filter((expense) => expense.group_id === group.id);
  const settlements = data.settlements.filter((settlement) => settlement.group_id === group.id);
  const history: HistoryItem[] = [
    ...groupExpenses.map((expense) => ({ id: expense.id, created_at: expense.created_at, kind: "expense" as const, title: expense.category || "Expense", detail: `${expense.payer_profile?.user_id === currentUserId ? "You" : displayName(expense.payer_profile)} paid ${money(expense.amount)}`, amount: expense.amount })),
    ...settlements.map((settlement) => ({ id: settlement.id, created_at: settlement.created_at, kind: "settlement" as const, title: "Settlement", detail: `${settlement.from_user_id === currentUserId ? "You" : displayName(settlement.from_profile)} paid ${settlement.to_user_id === currentUserId ? "you" : displayName(settlement.to_profile)}`, amount: settlement.amount })),
  ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return (
    <main className="space-y-6">
      <DetailHeader title={`${group.emoji || ""} ${group.name}`.trim()} subtitle={`${group.group_members.length} members`} balance={net} onBack={onBack} />
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button onClick={() => openModal("group-expense", group.id)} className="h-12 shadow-primary-action"><Plus />Add Group Expense</Button>
        <Button onClick={() => openModal("settle-up", group.id)} variant="quiet" className="h-12"><Check />Settle Up</Button>
        <Button onClick={() => openModal("invite-members", group.id)} variant="quiet" className="h-12"><LinkIcon />Invite Members</Button>
      </section>
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <SectionHeader title="Who owes whom" />
        <div className="space-y-2">{balances.length === 0 ? <EmptyCard text="All settled" /> : balances.map((balance) => <div key={`${balance.fromUserId}-${balance.toUserId}`} className="flex items-center justify-between rounded-2xl bg-elevated p-3 text-sm"><span className="font-semibold text-foreground">{balance.fromName} owes {balance.toName}</span><span className="font-bold text-primary">{money(balance.amount)}</span></div>)}</div>
      </section>
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <SectionHeader title="Members" />
        <div className="grid gap-2 sm:grid-cols-2">{group.group_members.map((member) => <div key={member.user_id} className="rounded-2xl bg-elevated p-3"><p className="font-bold text-foreground">{member.user_id === currentUserId ? "You" : displayName(member.profiles)}</p><p className="text-xs text-muted-foreground">@{member.profiles.username || "user"}</p></div>)}</div>
      </section>
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <SectionHeader title="Settlement history" />
        <div className="space-y-2">{settlements.length === 0 ? <EmptyCard text="No settlements yet." /> : settlements.map((settlement) => <div key={settlement.id} className="rounded-2xl bg-elevated p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-foreground">{settlement.from_user_id === currentUserId ? "You" : displayName(settlement.from_profile)} paid {settlement.to_user_id === currentUserId ? "you" : displayName(settlement.to_profile)}</span><span className="font-bold text-primary">{money(settlement.amount)}</span></div><p className="mt-1 text-xs text-muted-foreground">{dateLabel(settlement.created_at)}{settlement.note ? ` - ${settlement.note}` : ""}</p></div>)}</div>
      </section>
      <section className="rounded-[1.25rem] bg-card p-4 shadow-panel">
        <SectionHeader title="Latest activity" />
        <div className="space-y-3">{history.length === 0 ? <EmptyCard text="No expenses yet. Add your first expense" /> : history.map((item) => <article key={`${item.kind}-${item.id}`} className="rounded-2xl bg-elevated p-4 shadow-soft"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-foreground">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.created_at)}</p></div><p className="font-bold text-foreground">{money(item.amount)}</p></div></article>)}</div>
      </section>
      <section className="grid grid-cols-2 gap-2">
        <Button variant="quiet" onClick={() => openModal("edit-group", group.id)}><Pencil />Edit Group</Button>
        <Button variant="destructive" onClick={() => openModal("delete-group", group.id)}><Trash2 />Delete Group</Button>
      </section>
    </main>
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
  return (
    <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      const parsed = Number(amount);
      if (!parsed || parsed <= 0) return;
      await onSubmit({ user_id: userId, paid_by: userId, category, amount: parsed, status: "pending", split_type: "none", created_at: new Date(date).toISOString() });
    }}>
      <div className="flex gap-1 rounded-full bg-elevated p-1">
        {(["tiffin", "delivery"] as const).map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`flex-1 rounded-full px-3 py-2 text-xs font-bold capitalize ${category === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{item}</button>)}
      </div>
      <Field label="Amount" placeholder="0" type="number" value={amount} onChange={setAmount} />
      <Field label="Date" type="date" value={date} onChange={setDate} />
      <div className="flex gap-2 pt-2"><Button type="button" variant="quiet" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="submit" className="flex-1">Log Expense</Button></div>
    </form>
  );
};

const CreateGroupForm = ({ friends, group, onSubmit, onCancel }: { friends: FriendProfile[]; group?: GroupRow; onSubmit: (payload: { name: string; emoji: string; description: string; memberIds: string[]; groupId?: string }) => Promise<void>; onCancel: () => void }) => {
  const [emoji, setEmoji] = useState(group?.emoji || "🏠");
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  return (
    <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      if (!name.trim()) return;
      await onSubmit({ groupId: group?.id, name: name.trim(), emoji, description: description.trim(), memberIds });
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
      <div className="flex gap-2 pt-2"><Button type="button" variant="quiet" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="submit" className="flex-1">{group ? "Save" : "Create"}</Button></div>
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

const SettleForm = ({ currentUserId, friend, group, balances, defaultAmount, onSubmit, onCancel }: { currentUserId: string; friend?: FriendProfile; group?: GroupRow; balances: DebtBalance[]; defaultAmount: number; onSubmit: (payload: { from_user_id: string; to_user_id: string; amount: number; group_id?: string | null; note?: string | null }) => Promise<void>; onCancel: () => void }) => {
  const firstBalance = balances[0];
  const [fromUserId, setFromUserId] = useState(firstBalance?.fromUserId || currentUserId);
  const [toUserId, setToUserId] = useState(firstBalance?.toUserId || friend?.user_id || currentUserId);
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount.toFixed(2)) : "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const members = group ? group.group_members.map((member) => ({ user_id: member.user_id, name: member.user_id === currentUserId ? "You" : displayName(member.profiles) })) : [{ user_id: currentUserId, name: "You" }, ...(friend ? [{ user_id: friend.user_id, name: displayName(friend) }] : [])];
  const parsed = Number(amount);
  const pickSuggestion = (balance: DebtBalance) => {
    setFromUserId(balance.fromUserId);
    setToUserId(balance.toUserId);
    setAmount(balance.amount.toFixed(2));
  };

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (!parsed || parsed <= 0 || fromUserId === toUserId || submitting) return;
      setSubmitting(true);
      try {
        await onSubmit({ from_user_id: fromUserId, to_user_id: toUserId, amount: parsed, group_id: group?.id || null, note: note.trim() || null });
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
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold text-foreground">From<select value={fromUserId} onChange={(event) => setFromUserId(event.target.value)} className="mt-2 w-full rounded-full border border-input bg-background px-4 py-3 text-sm">{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>
        <label className="text-sm font-semibold text-foreground">To<select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="mt-2 w-full rounded-full border border-input bg-background px-4 py-3 text-sm">{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>
      </div>
      <Field label="Amount" type="number" placeholder="0" value={amount} onChange={setAmount} />
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
  const group = data.groups.find((item) => item.id === modal.item) || data.groups.find((item) => item.id === expense?.group_id);
  const friend = data.friends.find((item) => item.user_id === modal.item);
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
        const { error } = await supabase.from("expenses").update(payload).eq("id", expenseId);
        if (error) throw error;
        await supabase.from("expense_splits").delete().eq("expense_id", expenseId);
        if (splits.length) {
          const { error: splitError } = await supabase.from("expense_splits").insert(splits.map((split) => ({ ...split, expense_id: expenseId, has_paid: payload.status === "cleared" })));
          if (splitError) throw splitError;
        }
      } else {
        const { data: inserted, error } = await supabase.from("expenses").insert(payload).select("id").single();
        if (error || !inserted) throw error;
        if (splits.length) {
          const { error: splitError } = await supabase.from("expense_splits").insert(splits.map((split) => ({ ...split, expense_id: inserted.id, has_paid: payload.status === "cleared" })));
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
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else await closeAndRefresh();
  };

  const clearExpense = async () => {
    if (!expense) return;
    const { error } = await supabase.from("expenses").update({ status: "cleared" }).eq("id", expense.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else {
      const { error: splitError } = await supabase.from("expense_splits").update({ has_paid: true }).eq("expense_id", expense.id);
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
      await supabase.from("group_members").insert(members);
    }
    await closeAndRefresh();
  };

  const sendInvite = async (email: string) => {
    if (!group || !email.trim()) return;
    const { error } = await supabase.functions.invoke("send-invite", { body: { email: email.trim().toLowerCase(), group_id: group.id, group_name: group.name, inviter_name: "A friend" } });
    if (error) toast({ title: "Invite failed", description: error.message, variant: "destructive" });
    else await closeAndRefresh();
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
                  <button onClick={async () => { await supabase.from("group_members").delete().eq("group_id", group.id).eq("user_id", member.user_id); await closeAndRefresh(); }} className="text-xs font-bold text-destructive">Remove</button>
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
            <div><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Incoming</p><div className="space-y-2">{data.incomingRequests.length === 0 ? <EmptyCard text="No incoming requests." /> : data.incomingRequests.map((request) => <RequestCard key={request.id} request={request} onAccept={() => supabase.from("connections").update({ status: "accepted" }).eq("id", request.id).then(closeAndRefresh)} onReject={() => supabase.from("connections").update({ status: "rejected" }).eq("id", request.id).then(closeAndRefresh)} />)}</div></div>
            <div><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Outgoing</p><div className="space-y-2">{data.outgoingRequests.length === 0 ? <EmptyCard text="No outgoing requests." /> : data.outgoingRequests.map((request) => <div key={request.id} className="flex items-center justify-between rounded-2xl bg-elevated p-3"><div><p className="font-bold text-foreground">{displayName(request.profiles)}</p><p className="text-xs text-muted-foreground">@{request.profiles.username}</p></div><Button size="sm" variant="quiet" onClick={() => supabase.from("connections").delete().eq("id", request.id).then(closeAndRefresh)}>Cancel</Button></div>)}</div></div>
          </div>
        )}

        {type === "friend-details" && friend && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-2xl bg-elevated p-4 text-sm">
              {data.expenses.filter((expense) => expense.paid_by === friend.user_id || expense.expense_splits?.some((split) => split.user_id === friend.user_id)).slice(0, 4).map((item) => <div key={item.id} className="flex justify-between"><span className="text-muted-foreground">{item.category}</span><span className="font-semibold text-foreground">{money(item.amount)}</span></div>)}
            </div>
            <Button variant="destructive" className="w-full" onClick={async () => { await supabase.from("connections").delete().eq("id", friend.connection_id); await closeAndRefresh(); }}><UserMinus />Remove friend</Button>
          </div>
        )}

        {type === "settle-up" && (group || friend) && (
          <SettleForm currentUserId={currentUserId} friend={friend} group={group} balances={group ? balances : friendBalances} defaultAmount={(group ? balances : friendBalances).find((balance) => balance.fromUserId === currentUserId || balance.toUserId === currentUserId)?.amount || 0} onSubmit={saveSettlement} onCancel={onClose} />
        )}

        {type === "delete-expense" && <ConfirmBox text={`Delete "${expense?.category || "expense"}"?`} action="Delete" destructive onCancel={onClose} onConfirm={deleteExpense} />}
        {type === "clear-expense" && <ConfirmBox text={`Mark "${expense?.category || "expense"}" as cleared?`} action="Mark cleared" onCancel={onClose} onConfirm={clearExpense} />}
        {type === "delete-group" && group && <ConfirmBox text={`Delete "${group.name}" and its group data?`} action="Delete" destructive onCancel={onClose} onConfirm={async () => { await supabase.from("groups").delete().eq("id", group.id); await closeAndRefresh(); }} />}
        {type === "remove-friend" && friend && <ConfirmBox text={`Remove ${displayName(friend)} from your friends?`} action="Remove" destructive onCancel={onClose} onConfirm={async () => { await supabase.from("connections").delete().eq("id", friend.connection_id); await closeAndRefresh(); }} />}
        {type === "logout" && <ConfirmBox text="This will return you to the signed-out state." action="Logout" destructive onCancel={onClose} onConfirm={async () => { await signOut(); onClose(); }} />}
        {type === "notifications" && <EmptyCard text={`${data.incomingRequests.length} incoming friend request(s), ${data.outgoingRequests.length} pending sent request(s).`} />}
        {type === "chart-details" && <div className="rounded-2xl bg-elevated p-4 text-sm text-muted-foreground">Spendova uses your live expenses, split debts, and food logs for this summary.</div>}
        {type === "saved" && <EmptyCard text="Saved." />}
      </DialogContent>
    </Dialog>
  );
};

const InviteMembers = ({ group, invites, onInvite }: { group: GroupRow; invites: InviteRow[]; onInvite: (email: string) => Promise<void> }) => {
  const [email, setEmail] = useState("");
  const inviteToken = invites.find((invite) => invite.status === "pending")?.token;
  const link = inviteToken ? `${window.location.origin}/accept-invite?token=${inviteToken}` : "";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl bg-elevated p-3">
        <input readOnly value={link || "Send an invite to generate a link"} className="min-w-0 flex-1 bg-transparent text-xs font-mono outline-none" />
        <Button size="sm" variant="quiet" disabled={!link} onClick={() => navigator.clipboard?.writeText(link)}><Copy />Copy</Button>
      </div>
      <Field label="Invite by email" type="email" value={email} onChange={setEmail} placeholder="friend@email.com" />
      <Button className="w-full" onClick={() => onInvite(email)}>Send invite</Button>
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

const ConfirmBox = ({ text, action, destructive, onCancel, onConfirm }: { text: string; action: string; destructive?: boolean; onCancel: () => void; onConfirm: () => void }) => (
  <div className="space-y-3">
    <div className="rounded-2xl bg-elevated p-4 text-sm text-muted-foreground">{text}</div>
    <div className="flex gap-2"><Button variant="quiet" className="flex-1" onClick={onCancel}>Cancel</Button><Button variant={destructive ? "destructive" : "default"} className="flex-1" onClick={onConfirm}>{action}</Button></div>
  </div>
);

const Index = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const isSplitRoute = location.pathname.startsWith("/split");
  const friendDetailId = location.pathname.startsWith("/split/friend/") ? params.id : undefined;
  const groupDetailId = location.pathname.startsWith("/split/group/") ? params.id : undefined;
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
    else if (location.pathname.startsWith("/split")) navigate("/dashboard");
  };

  const saveSettlement = async (payload: { from_user_id: string; to_user_id: string; amount: number; group_id?: string | null; note?: string | null }) => {
    const { error } = await supabase.from("split_settlements" as never).insert(payload as never);
    if (error) {
      toast({ title: "Settlement failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Settlement saved" });
    await closeAndRefresh();
  };
  const activeContentTab: TabKey = isSplitRoute ? "split" : activeTab;
  const title = friendDetailId ? "Friend" : groupDetailId ? "Group" : tabs.find((tab) => tab.key === activeContentTab)?.label ?? "Home";
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
  const backToSplit = () => navigate("/split");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-3xl px-4 pb-36 sm:px-6">
        <AppHeader title={title === "Home" ? "Overview" : title} theme={theme} onThemeToggle={toggleTheme} openModal={openModal} />
        {friendDetailId && !friendDetail && <EmptyCard text="Friend not found." />}
        {groupDetailId && !groupDetail && <EmptyCard text="Group not found." />}
        {friendDetail && <FriendDetailView friend={friendDetail} data={data} currentUserId={user.id} openModal={openModal} onBack={backToSplit} />}
        {groupDetail && <GroupDetailView group={groupDetail} data={data} currentUserId={user.id} openModal={openModal} onBack={backToSplit} />}
        {!friendDetailId && !groupDetailId && activeContentTab === "home" && <HomeView expenses={data.expenses} settlements={data.settlements} userId={user.id} setTab={setActiveTab} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && activeContentTab === "personal" && <PersonalView expenses={data.expenses} summary={summary} currentUserId={user.id} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && activeContentTab === "split" && <SplitView data={data} currentUserId={user.id} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && activeContentTab === "tiffin" && <TiffinView expenses={data.expenses} openModal={openModal} />}
        {!friendDetailId && !groupDetailId && activeContentTab === "profile" && <ProfileView profile={profile} email={user.email} createdAt={user.created_at} theme={theme} onThemeToggle={toggleTheme} onSave={saveProfile} openModal={openModal} />}
        <p className="pt-10 text-center text-xs font-medium text-muted-foreground">© 2026 Spendova. All rights reserved.</p>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-3xl px-4 pb-4">
        <div className="grid grid-cols-5 rounded-[1.4rem] border border-border/80 bg-card p-2 shadow-panel backdrop-blur">
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
