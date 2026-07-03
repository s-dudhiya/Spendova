import { useState } from "react";
import { 
  Plus, 
  Users, 
  Wallet, 
  ChevronRight, 
  TrendingUp, 
  Clock, 
  Cloud,
  BarChart2,
  Home,
  Briefcase,
  Filter,
  ChevronDown,
  ShoppingCart,
  PlusCircle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

import type { LedgerRow, LedgerActivityRow } from "./types";
import { LedgerDetail } from "./LedgerDetail";
import { CreateLedgerDrawer } from "./drawers/CreateLedgerDrawer";
import { money, timeAgo } from "./utils";
import { useLedgersDashboard, type DashboardLedgerSummary } from "./hooks";

// ── Ledger Card ───────────────────────────────────────────────

interface LedgerCardProps {
  ledger: LedgerRow;
  summary: DashboardLedgerSummary | undefined;
  onClick: () => void;
}

const LedgerCard = ({ ledger, summary, onClick }: LedgerCardProps) => {
  const memberCount = ledger.ledger_members.length;
  
  // Progress bar calculation
  let progress = 0;
  if (summary && summary.totalBudget > 0) {
    progress = Math.min(Math.round(((summary.paidExpenses + summary.pendingExpenses + summary.approvedExpenses) / summary.totalBudget) * 100), 100);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-4 rounded-[1.25rem] bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            {ledger.ledger_type === "shared" ? <Home className="size-5" /> : <Briefcase className="size-5" />}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-foreground">{ledger.name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="capitalize">{ledger.ledger_type}</span>
              <span>•</span>
              <span className="capitalize">{ledger.budget_type === "monthly" ? "Monthly" : "One-Time"}</span>
              {ledger.ledger_type === "shared" && (
                <>
                  <span>•</span>
                  <span>{memberCount} members</span>
                </>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs font-bold text-muted-foreground">{progress}%</span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground">Budget</span>
          <span className="text-xs font-bold text-foreground">{money(summary?.totalBudget ?? 0)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground">Spent</span>
          <span className="text-xs font-bold text-foreground">{money((summary?.paidExpenses ?? 0) + (summary?.approvedExpenses ?? 0))}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground">Remaining</span>
          <span className="text-xs font-bold text-emerald-500">{money(summary?.expectedAvailable ?? 0)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground">Savings</span>
          <span className="text-xs font-bold text-primary">{money(summary?.totalSavings ?? 0)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground">Pending</span>
          <span className="text-xs font-bold text-orange-500">{money(summary?.pendingExpenses ?? 0)}</span>
        </div>
      </div>
    </button>
  );
};

// ── Activity Row ───────────────────────────────────────────────

const ActivityRow = ({ activity, ledger }: { activity: LedgerActivityRow; ledger?: LedgerRow }) => {
  let icon = <PlusCircle className="size-5" />;
  let iconBg = "bg-primary/10 text-primary";
  let amountClass = "text-primary";
  let amountPrefix = "+";
  let amountStr = "";

  const isExpense = activity.action === "expense_submitted" || activity.action === "expense_paid" || activity.action === "expense_approved";
  const isRollover = activity.action === "monthly_rollover";
  
  if (isExpense) {
    icon = <ShoppingCart className="size-5" />;
    iconBg = "bg-emerald-500/10 text-emerald-500";
    amountClass = "text-foreground";
    amountPrefix = "";
  } else if (isRollover) {
    icon = <RefreshCw className="size-5" />;
    iconBg = "bg-primary/10 text-primary";
    amountClass = "text-primary";
  }

  if (activity.metadata && typeof activity.metadata.amount === "number") {
    amountStr = money(activity.metadata.amount);
  }

  let title = activity.action;
  if (isExpense && activity.metadata?.title) {
    title = `${activity.profiles?.full_name || activity.profiles?.username || "User"} added ${activity.metadata.title}`;
  } else if (activity.action === "budget_added") {
    title = "Budget increased";
  } else if (isRollover) {
    title = "Monthly rollover completed";
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-soft transition-shadow hover:shadow-panel">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${iconBg}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold text-foreground">{title}</h4>
          <p className="truncate text-xs font-semibold text-muted-foreground">{ledger?.name || "Unknown Ledger"}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={`text-sm font-black ${amountClass}`}>
          {amountPrefix}{amountStr}
        </span>
        <span className="text-[10px] font-bold text-muted-foreground">{timeAgo(activity.created_at)}</span>
      </div>
    </div>
  );
};

// ── Empty State ───────────────────────────────────────────────

const LedgerEmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="rounded-[1.25rem] bg-elevated p-6 text-center shadow-soft">
    <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
      <Wallet className="size-7" />
    </div>
    <p className="mt-4 text-base font-black text-foreground">No ledgers yet</p>
    <p className="mt-1 text-sm font-medium text-muted-foreground">
      Create a ledger to start tracking budgets and expenses.
    </p>
    <Button className="mt-4 shadow-primary-action" onClick={onCreate}>
      <Plus className="size-4" />
      Create your first ledger
    </Button>
  </div>
);

// ── Main BudgetLedgerView ─────────────────────────────────────

interface BudgetLedgerViewProps {
  ledgers: LedgerRow[];
  currentUserId: string;
  profile: { full_name?: string | null; username?: string | null } | null;
  refresh: () => Promise<void>;
}

export const BudgetLedgerView = ({
  ledgers,
  currentUserId,
  profile,
  refresh,
}: BudgetLedgerViewProps) => {
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  
  const { globalSummary, ledgerSummaries, recentActivity, refresh: refreshDashboard } = useLedgersDashboard(ledgers);

  // If a ledger is selected, show its detail view
  if (selectedLedgerId) {
    const ledger = ledgers.find((l) => l.id === selectedLedgerId);
    if (!ledger) {
      setSelectedLedgerId(null);
      return null;
    }
    return (
      <LedgerDetail
        ledger={ledger}
        currentUserId={currentUserId}
        onBack={() => {
          setSelectedLedgerId(null);
          refreshDashboard();
        }}
        onRefreshList={refresh}
      />
    );
  }

  const activeLedgers = ledgers.filter((l) => !l.is_archived);

  return (
    <main className="space-y-6 pb-20">
      {/* ── Global Stats Row ── */}
      <section className="flex w-full items-stretch justify-between rounded-[1.25rem] bg-card p-4 shadow-panel">
        <div className="flex min-w-0 flex-1 flex-col gap-1 pr-2">
          <span className="truncate text-[11px] font-bold text-muted-foreground">Total Budget</span>
          <span className="truncate text-base font-black text-foreground">{money(globalSummary.totalBudget)}</span>
          <Wallet className="mt-auto size-4 shrink-0 text-primary" />
        </div>
        <div className="w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3">
          <span className="truncate text-[11px] font-bold text-muted-foreground">Available</span>
          <span className="truncate text-base font-black text-emerald-500">{money(globalSummary.expectedAvailable)}</span>
          <TrendingUp className="mt-auto size-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3">
          <span className="truncate text-[11px] font-bold text-muted-foreground">Pending</span>
          <span className="truncate text-base font-black text-orange-500">{money(globalSummary.pendingExpenses)}</span>
          <Clock className="mt-auto size-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 pl-2">
          <span className="truncate text-[11px] font-bold text-muted-foreground">Savings</span>
          <span className="truncate text-base font-black text-primary">{money(globalSummary.totalSavings)}</span>
          <Cloud className="mt-auto size-4 shrink-0 text-muted-foreground" />
        </div>
      </section>

      {/* ── Quick actions ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">Quick actions</h2>
          <button type="button" className="text-xs font-bold text-primary">View all</button>
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          <button type="button" onClick={() => setCreateOpen(true)} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card shadow-soft transition-shadow hover:shadow-panel">
            <Plus className="size-5 text-primary" />
            <span className="text-[10px] font-bold text-foreground">Create Ledger</span>
          </button>
          <button type="button" className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card shadow-soft opacity-60 transition-shadow hover:shadow-panel">
            <Users className="size-5 text-muted-foreground" />
            <span className="text-[10px] font-bold text-foreground">Join Ledger</span>
          </button>
          <button type="button" className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card shadow-soft opacity-60 transition-shadow hover:shadow-panel">
            <Clock className="size-5 text-muted-foreground" />
            <span className="text-[10px] font-bold text-foreground">History</span>
          </button>
          <button type="button" className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card shadow-soft opacity-60 transition-shadow hover:shadow-panel">
            <BarChart2 className="size-5 text-muted-foreground" />
            <span className="text-[10px] font-bold text-foreground">Analytics</span>
          </button>
        </div>
      </section>

      {/* ── Ledger list ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">Your Ledgers</h2>
          <div className="flex items-center gap-3">
            <button type="button" className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
              Recent <ChevronDown className="size-3" />
            </button>
            <Filter className="size-4 text-muted-foreground" />
          </div>
        </div>

        {activeLedgers.length === 0 ? (
          <LedgerEmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="space-y-3">
            {activeLedgers.map((ledger) => (
              <LedgerCard
                key={ledger.id}
                ledger={ledger}
                summary={ledgerSummaries[ledger.id]}
                onClick={() => setSelectedLedgerId(ledger.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-foreground">Recent activity</h2>
            <button type="button" className="text-xs font-bold text-primary">View all</button>
          </div>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <ActivityRow 
                key={activity.id} 
                activity={activity} 
                ledger={ledgers.find(l => l.id === activity.ledger_id)} 
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Create Ledger Drawer ── */}
      <CreateLedgerDrawer
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) refreshDashboard();
        }}
        currentUserId={currentUserId}
        onSuccess={async () => {
          await refresh();
          await refreshDashboard();
        }}
      />
    </main>
  );
};
