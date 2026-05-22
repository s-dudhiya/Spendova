import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
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
  | "friend-details"
  | "add-friend"
  | "remove-friend"
  | "friend-requests"
  | "settle-up"
  | "logout"
  | "admin"
  | "broadcast"
  | "saved"
  | null;

type ModalState = { type: ModalType; item?: string };

type Profile = {
  user_id: string;
  full_name: string | null;
  username: string | null;
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
  status: string;
  created_at: string;
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
  const saved = window.localStorage.getItem("spendova-theme");
  if (saved === "light" || saved === "dark") return saved;
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
const displayName = (profile?: Profile | null) => profile?.full_name || profile?.username || "Unknown";

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
  });

  const refresh = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [expensesRes, reqRes, recRes, groupsRes] = await Promise.all([
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
      ]);

      if (expensesRes.error) throw expensesRes.error;
      if (reqRes.error) throw reqRes.error;
      if (recRes.error) throw recRes.error;
      if (groupsRes.error) throw groupsRes.error;

      const requested = ((reqRes.data || []) as unknown as ConnectionQueryRow[]).map((row) => ({ ...row, profiles: row.profiles || { user_id: "", full_name: null, username: null } })) as ConnectionRow[];
      const received = ((recRes.data || []) as unknown as ConnectionQueryRow[]).map((row) => ({ ...row, profiles: row.profiles || { user_id: "", full_name: null, username: null } })) as ConnectionRow[];
      const accepted = [...requested, ...received].filter((row) => row.status === "accepted");

      const groupInvites: Record<string, InviteRow[]> = {};
      await Promise.all(((groupsRes.data || []) as unknown as GroupQueryRow[]).map(async (group) => {
        const { data: invites } = await supabase
          .from("group_invites" as never)
          .select("id, email, status, created_at")
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

function getSummary(expenses: ExpenseRow[], userId: string) {
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

    if (isPayer) {
      expense.expense_splits?.forEach((split) => {
        if (!split.has_paid) totalLent += split.amount_owed;
      });
    } else if (mySplit && !mySplit.has_paid) {
      totalOwed += mySplit.amount_owed;
    }

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

  return { totalLent, totalOwed, net: totalLent - totalOwed, personal, personalPending, personalCleared, tiffinPending, tiffinCleared };
}

function computeGroupBalances(expenses: ExpenseRow[], group: GroupRow) {
  const names: Record<string, string> = {};
  group.group_members.forEach((member) => { names[member.user_id] = displayName(member.profiles); });
  const totals: Record<string, Record<string, number>> = {};

  expenses.filter((expense) => expense.group_id === group.id).forEach((expense) => {
    expense.expense_splits?.forEach((split) => {
      if (split.has_paid) return;
      if (!totals[split.user_id]) totals[split.user_id] = {};
      totals[split.user_id][expense.paid_by] = (totals[split.user_id][expense.paid_by] || 0) + split.amount_owed;
    });
  });

  const balances: Array<{ fromUserId: string; toUserId: string; fromName: string; toName: string; amount: number }> = [];
  const seen = new Set<string>();
  Object.keys(totals).forEach((from) => {
    Object.keys(totals[from]).forEach((to) => {
      const key = [from, to].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      const a = totals[from]?.[to] || 0;
      const b = totals[to]?.[from] || 0;
      const diff = a - b;
      if (Math.abs(diff) < 0.01) return;
      balances.push(diff > 0
        ? { fromUserId: from, toUserId: to, fromName: names[from] || "Unknown", toName: names[to] || "Unknown", amount: diff }
        : { fromUserId: to, toUserId: from, fromName: names[to] || "Unknown", toName: names[from] || "Unknown", amount: -diff });
    });
  });
  return balances;
}

const HomeView = ({ expenses, summary, setTab, openModal }: { expenses: ExpenseRow[]; summary: ReturnType<typeof getSummary>; setTab: (tab: TabKey) => void; openModal: (type: ModalType, item?: string) => void }) => {
  const [range, setRange] = useState<"week" | "month" | "year">("month");
  const [status, setStatus] = useState<"all" | "pending" | "cleared">("all");
  const clear = () => { setRange("month"); setStatus("all"); };
  const recent = expenses.filter((expense) => status === "all" || expense.status === status).slice(0, 3);

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
  const [subTab, setSubTab] = useState<"friends" | "groups">("friends");
  const [query, setQuery] = useState("");
  const filteredFriends = data.friends.filter((friend) => displayName(friend).toLowerCase().includes(query.toLowerCase()) || (friend.username || "").toLowerCase().includes(query.toLowerCase()));
  const summary = getSummary(data.expenses, currentUserId);

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

      {subTab === "friends" ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-foreground">Friends</h2>
            <div className="flex gap-2">
              <button onClick={() => openModal("friend-requests")} className="text-sm font-semibold text-primary">Requests</button>
              <button onClick={() => openModal("add-friend")} className="text-sm font-semibold text-primary">Add</button>
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-full border border-input bg-background px-4 py-3 shadow-soft">
            <Search className="size-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search friends" />
          </div>
          <div className="space-y-3">
            {filteredFriends.length === 0 ? <EmptyCard text="No friends found." /> : filteredFriends.map((friend) => (
              <button key={friend.user_id} onClick={() => openModal("friend-details", friend.user_id)} className="flex w-full items-center justify-between rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-elevated font-bold text-primary">{displayName(friend).charAt(0).toUpperCase()}</span>
                  <div><h3 className="font-bold text-foreground">{displayName(friend)}</h3><p className="text-sm text-muted-foreground">@{friend.username || "user"}</p></div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section>
            <SectionHeader title="Groups" action="Create" onAction={() => openModal("create-group")} />
            <div className="space-y-3">
              {data.groups.length === 0 ? <EmptyCard text="No groups yet." /> : data.groups.map((group) => {
                const groupSpend = data.expenses.filter((expense) => expense.group_id === group.id).reduce((sum, expense) => sum + expense.amount, 0);
                return (
                  <button onClick={() => openModal("group-details", group.id)} key={group.id} className="w-full rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="grid size-11 place-items-center rounded-full bg-elevated text-xl">{group.emoji || "🏠"}</span>
                        <div><h3 className="font-bold text-foreground">{group.name}</h3><p className="text-sm text-muted-foreground">{group.group_members.length} members</p></div>
                      </div>
                      <p className="font-bold text-foreground">{money(groupSpend)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          {data.groups[0] && (
            <GroupSummaryCard group={data.groups[0]} expenses={data.expenses} currentUserId={currentUserId} openModal={openModal} />
          )}
        </>
      )}
    </main>
  );
};

const GroupSummaryCard = ({ group, expenses, currentUserId, openModal }: { group: GroupRow; expenses: ExpenseRow[]; currentUserId: string; openModal: (type: ModalType, item?: string) => void }) => {
  const balances = computeGroupBalances(expenses, group);
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

const ExpenseForm = ({ userId, friends, group, expense, onSubmit, onCancel }: { userId: string; friends: FriendProfile[]; group?: GroupRow; expense?: ExpenseRow; onSubmit: (payload: { expense: ExpensePayload; splits: Array<{ user_id: string; amount_owed: number }>; expenseId?: string }) => Promise<void>; onCancel: () => void }) => {
  const isEdit = Boolean(expense);
  const members = group ? group.group_members.map((member) => ({ user_id: member.user_id, name: member.user_id === userId ? "You" : displayName(member.profiles) })) : [{ user_id: userId, name: "You" }, ...friends.map((friend) => ({ user_id: friend.user_id, name: displayName(friend) }))];
  const [name, setName] = useState(expense?.category || "");
  const [date, setDate] = useState(expense?.created_at?.split("T")[0] || new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [note, setNote] = useState(expense?.note || "");
  const [status, setStatus] = useState<"pending" | "cleared">(expense?.status === "cleared" ? "cleared" : "pending");
  const [splitOn, setSplitOn] = useState(Boolean(group || expense?.expense_splits?.length));
  const [strategy, setStrategy] = useState<SplitStrategy>((expense?.split_type as SplitStrategy) || "equal");
  const [participants, setParticipants] = useState<string[]>(group ? members.map((member) => member.user_id) : [userId]);
  const [payer, setPayer] = useState(expense?.paid_by || userId);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});

  const parsedAmount = Number(amount);
  const selectedMembers = members.filter((member) => participants.includes(member.user_id));
  const debtors = selectedMembers.filter((member) => member.user_id !== payer);
  const equalShare = participants.length ? parsedAmount / participants.length : 0;

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !parsedAmount || parsedAmount <= 0) return;

    const splits: Array<{ user_id: string; amount_owed: number }> = [];
    if (splitOn) {
      if (participants.length < 2) return;
      if (strategy === "equal") {
        participants.forEach((id) => {
          if (id !== payer) splits.push({ user_id: id, amount_owed: Number(equalShare.toFixed(2)) });
        });
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
      {!group && (
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
        <Button type="submit" className="flex-1">{isEdit ? "Save" : "Add"}</Button>
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
          <Button size="sm" disabled={existingIds.has(result.user_id)} onClick={() => onRequest(result.user_id)}><UserPlus />Send request</Button>
        </div>
      )}
      <Button variant="quiet" className="w-full" onClick={onCancel}>Cancel</Button>
    </div>
  );
};

const AdminPanel = ({ onBroadcast }: { onBroadcast: () => void }) => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    supabase.from("site_settings").select("is_maintenance_mode").eq("id", 1).single().then(({ data }) => setEnabled(Boolean(data?.is_maintenance_mode)));
  }, []);
  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    const { error } = await supabase.functions.invoke("toggle-maintenance", { body: { isMaintenance: next, password: "exp_admin_2026" } });
    if (error) {
      setEnabled(!next);
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-elevated p-4">
        <div><p className="font-bold text-foreground">Maintenance mode</p><p className="text-xs text-muted-foreground">Lock the app for non-admins.</p></div>
        <button onClick={toggle} className={`relative h-6 w-11 rounded-full ${enabled ? "bg-destructive" : "bg-muted"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow ${enabled ? "left-5" : "left-0.5"}`} /></button>
      </div>
      <Button onClick={onBroadcast} className="w-full"><Bell />Open broadcast composer</Button>
    </div>
  );
};

const BroadcastForm = ({ onCancel }: { onCancel: () => void }) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; data: string; size: number }>>([]);
  const readFiles = (files: FileList | null) => {
    Array.from(files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => setAttachments((current) => [...current, { name: file.name, data: String(reader.result), size: file.size }]);
      reader.readAsDataURL(file);
    });
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    const { error } = await supabase.functions.invoke("send-admin-mail", { body: { subject, htmlBody: message, attachments, password: "exp_admin_2026" } });
    if (error) toast({ title: "Broadcast failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Broadcast sent" });
      onCancel();
    }
  };
  return (
    <form className="space-y-3" onSubmit={send}>
      <Field label="Subject" placeholder="Announcement" value={subject} onChange={setSubject} />
      <Textarea label="Message" placeholder="Write your message..." value={message} onChange={setMessage} />
      <label className="block text-sm font-semibold text-foreground">Attachments<input type="file" multiple className="mt-2 block w-full text-xs" onChange={(event) => readFiles(event.target.files)} /></label>
      {attachments.length > 0 && <p className="text-xs text-muted-foreground">{attachments.length} attachment(s) selected</p>}
      <div className="flex gap-2 pt-2"><Button type="button" variant="quiet" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="submit" className="flex-1">Send</Button></div>
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
  const balances = group ? computeGroupBalances(data.expenses, group) : [];

  const title =
    type === "add-expense" ? "Add expense" :
    type === "group-expense" ? `Add expense - ${group?.name || ""}` :
    type === "log-tiffin" ? "Log amount" :
    type === "chart-details" ? "Spending details" :
    type === "edit-expense" ? "Edit expense" :
    type === "delete-expense" ? "Delete expense" :
    type === "clear-expense" ? "Mark as cleared" :
    type === "create-group" ? "Create group" :
    type === "edit-group" ? "Edit group" :
    type === "delete-group" ? "Delete group" :
    type === "invite-members" ? "Invite members" :
    type === "group-details" ? group?.name || "Group details" :
    type === "friend-details" ? `${displayName(friend)} details` :
    type === "add-friend" ? "Add friend" :
    type === "friend-requests" ? "Friend requests" :
    type === "settle-up" ? `Settle up - ${group?.name || ""}` :
    type === "admin" ? "Admin panel" :
    type === "broadcast" ? "Broadcast email" :
    type === "logout" ? "Logout" :
    type === "notifications" ? "Notifications" : "Saved";

  const closeAndRefresh = async () => {
    await refresh();
    onClose();
  };

  const saveExpense = async ({ expense: payload, splits, expenseId }: { expense: ExpensePayload; splits: Array<{ user_id: string; amount_owed: number }>; expenseId?: string }) => {
    if (expenseId) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", expenseId);
      if (error) throw error;
      await supabase.from("expense_splits").delete().eq("expense_id", expenseId);
      if (splits.length) await supabase.from("expense_splits").insert(splits.map((split) => ({ ...split, expense_id: expenseId, has_paid: false })));
    } else {
      const { data: inserted, error } = await supabase.from("expenses").insert(payload).select("id").single();
      if (error || !inserted) throw error;
      if (splits.length) await supabase.from("expense_splits").insert(splits.map((split) => ({ ...split, expense_id: inserted.id, has_paid: false })));
      if (payload.group_id) supabase.functions.invoke("send-expense-notification", { body: { expense_id: inserted.id } }).catch(() => undefined);
    }
    toast({ title: "Saved" });
    await closeAndRefresh();
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
    else await closeAndRefresh();
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
          <ExpenseForm userId={currentUserId} friends={data.friends} group={type === "group-expense" ? group : undefined} expense={type === "edit-expense" ? expense : undefined} onSubmit={saveExpense} onCancel={onClose} />
        )}

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
        {type === "add-friend" && <AddFriendForm currentUserId={currentUserId} friends={data.friends} requests={[...data.incomingRequests, ...data.outgoingRequests]} onRequest={async (receiverId) => { const { error } = await supabase.from("connections").insert({ requester_id: currentUserId, receiver_id: receiverId, status: "pending" }); if (error) toast({ title: "Request failed", description: error.message, variant: "destructive" }); else await closeAndRefresh(); }} onCancel={onClose} />}

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

        {type === "settle-up" && group && (
          <div className="space-y-2 rounded-2xl bg-elevated p-4 text-sm">
            {balances.length === 0 ? <p className="text-muted-foreground">Nothing to settle.</p> : balances.map((balance) => <div key={`${balance.fromUserId}-${balance.toUserId}`} className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{balance.fromName} pays {balance.toName}</span><Button size="sm" onClick={async () => { const ids = groupExpenses.filter((item) => item.paid_by === balance.toUserId).flatMap((item) => item.expense_splits?.filter((split) => split.user_id === balance.fromUserId && !split.has_paid).map((split) => split.id) || []); if (ids.length) await supabase.from("expense_splits").update({ has_paid: true }).in("id", ids); await closeAndRefresh(); }}>{money(balance.amount)}</Button></div>)}
          </div>
        )}

        {type === "admin" && <AdminPanel onBroadcast={() => openModal("broadcast")} />}
        {type === "broadcast" && <BroadcastForm onCancel={onClose} />}
        {type === "delete-expense" && <ConfirmBox text={`Delete "${expense?.category || "expense"}"?`} action="Delete" destructive onCancel={onClose} onConfirm={deleteExpense} />}
        {type === "clear-expense" && <ConfirmBox text={`Mark "${expense?.category || "expense"}" as cleared?`} action="Mark cleared" onCancel={onClose} onConfirm={clearExpense} />}
        {type === "delete-group" && group && <ConfirmBox text={`Delete "${group.name}" and its group data?`} action="Delete" destructive onCancel={onClose} onConfirm={async () => { await supabase.from("groups").delete().eq("id", group.id); await closeAndRefresh(); }} />}
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
  const link = `${window.location.origin}/invite?group=${group.id}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl bg-elevated p-3">
        <input readOnly value={link} className="min-w-0 flex-1 bg-transparent text-xs font-mono outline-none" />
        <Button size="sm" variant="quiet" onClick={() => navigator.clipboard?.writeText(link)}><Copy />Copy</Button>
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

const Index = ({ initialModal = null }: { initialModal?: ModalType }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [modal, setModal] = useState<ModalState>({ type: initialModal });
  const { data, loading, refresh } = useSpendovaData(user?.id);
  const { toast } = useToast();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("spendova-theme", theme);
  }, [theme]);

  if (!authLoading && !user) return <Navigate to="/login" replace />;

  const title = tabs.find((tab) => tab.key === activeTab)?.label ?? "Home";
  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));
  const openModal = (type: ModalType, item?: string) => setModal({ type, item });
  const summary = user ? getSummary(data.expenses, user.id) : getSummary([], "");

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-3xl px-4 pb-36 sm:px-6">
        <AppHeader title={title === "Home" ? "Overview" : title} theme={theme} onThemeToggle={toggleTheme} openModal={openModal} />
        {activeTab === "home" && <HomeView expenses={data.expenses} summary={summary} setTab={setActiveTab} openModal={openModal} />}
        {activeTab === "personal" && <PersonalView expenses={data.expenses} summary={summary} currentUserId={user.id} openModal={openModal} />}
        {activeTab === "split" && <SplitView data={data} currentUserId={user.id} openModal={openModal} />}
        {activeTab === "tiffin" && <TiffinView expenses={data.expenses} openModal={openModal} />}
        {activeTab === "profile" && <ProfileView profile={profile} email={user.email} createdAt={user.created_at} theme={theme} onThemeToggle={toggleTheme} onSave={saveProfile} openModal={openModal} />}
        <p className="pt-10 text-center text-xs font-medium text-muted-foreground">© 2026 Spendova. All rights reserved.</p>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-3xl px-4 pb-4">
        <div className="grid grid-cols-5 rounded-[1.4rem] border border-border/80 bg-card p-2 shadow-panel backdrop-blur">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
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
