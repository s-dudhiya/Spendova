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
    progress = Math.min(Math.round(((summary.paidExpenses + summary.pendingExpenses) / summary.totalBudget) * 100), 100);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-4 rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-elevated text-primary">
            {ledger.ledger_type === "shared" ? <Home className="size-4" /> : <Briefcase className="size-4" />}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-bold text-foreground">{ledger.name}</h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <span className="capitalize">{ledger.ledger_type}</span>
              <span> · </span>
              <span className="capitalize">{ledger.budget_type === "monthly" ? "Monthly" : "One-Time"}</span>
              {ledger.ledger_type === "shared" && (
                <>
                  <span> · </span>
                  <span>{memberCount} members</span>
                </>
              )}
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Budget</span>
          <span className="text-sm font-black text-foreground">{money(summary?.totalBudget ?? 0)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Spent</span>
          <span className="text-sm font-black text-foreground">{money((summary?.paidExpenses ?? 0))}</span>
        </div>
        <div className="flex flex-col gap-1 text-right">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Available</span>
          <span className="text-sm font-black text-success">{money(summary?.expectedAvailable ?? 0)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] font-bold text-muted-foreground">{progress}%</span>
      </div>
    </button>
  );
};

// ── Activity Row ───────────────────────────────────────────────

const ActivityRow = ({ activity, ledger }: { activity: LedgerActivityRow; ledger?: LedgerRow }) => {
  let icon = <PlusCircle className="size-4" />;
  let iconBg = "bg-primary/15 text-primary";
  let amountClass = "text-foreground";
  let amountPrefix = "+";
  let amountStr = "";

  const isExpense = activity.action === "expense_submitted" || activity.action === "expense_paid" || activity.action === "expense_approved";
  const isRollover = activity.action === "monthly_rollover";
  
  if (isExpense) {
    icon = <ShoppingCart className="size-4" />;
    iconBg = "bg-primary/15 text-primary";
    amountClass = "text-foreground";
    amountPrefix = "";
  } else if (isRollover) {
    icon = <RefreshCw className="size-4" />;
    iconBg = "bg-primary/15 text-primary";
    amountClass = "text-foreground";
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
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${iconBg}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-bold text-foreground">{title}</h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">{ledger?.name || "Unknown Ledger"}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-black ${amountClass}`}>
          {amountPrefix}{amountStr}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{timeAgo(activity.created_at)}</p>
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
    <Button variant="quiet" className="mt-4" onClick={onCreate}>
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
  refresh: (options?: { silent?: boolean }) => Promise<void>;
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

  const activeLedgers = ledgers;

  return (
    <main className="space-y-6 pb-20">
      {/* ── Global Stats Row ── */}
      <section className="rounded-[1.4rem] bg-card p-5 shadow-panel sm:p-6">
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="pt-0.5 text-sm font-semibold text-muted-foreground">Total Budget</p>
          </div>
          <p className="mt-2 text-4xl font-black leading-tight tracking-tight text-foreground sm:text-5xl">{money(globalSummary.totalBudget)}</p>
          <p className="mt-1 text-sm font-medium leading-5 text-muted-foreground">Across all active ledgers</p>
        </div>
        <div className="mt-7 flex w-full items-start justify-between gap-4">
          <div className="m-0 flex min-h-[50px] min-w-0 flex-1 flex-col items-start justify-start p-0 text-left">
            <span className="m-0 inline-flex max-w-full flex-col items-start p-0">
              <span className="m-0 block h-[18px] max-w-full p-0 text-sm font-bold uppercase leading-[18px] tracking-wide text-muted-foreground">Available</span>
              <span className="spendova-money-value mt-2 block min-h-6 max-w-full p-0 text-base font-bold leading-6 text-success sm:text-lg">{money(globalSummary.expectedAvailable)}</span>
            </span>
          </div>
          <div className="m-0 flex min-h-[50px] min-w-0 flex-1 flex-col items-end justify-start p-0 text-right">
            <span className="m-0 inline-flex max-w-full flex-col items-end p-0">
              <span className="m-0 block h-[18px] max-w-full p-0 text-sm font-bold uppercase leading-[18px] tracking-wide text-muted-foreground">Savings</span>
              <span className="spendova-money-value mt-2 block min-h-6 max-w-full p-0 text-base font-bold leading-6 text-primary sm:text-lg">{money(globalSummary.totalSavings)}</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Quick actions ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black tracking-tight text-foreground">Quick action</h2>
        </div>
        
        <Button onClick={() => setCreateOpen(true)} className="h-16 w-full justify-start gap-4 rounded-[1.25rem] px-5 text-left shadow-primary-action">
          <span className="grid size-10 place-items-center rounded-full bg-primary-foreground/15">
            <Plus className="size-5" />
          </span>
          <span>
            <span className="block text-base font-black">Create Ledger</span>
            <span className="block text-xs font-semibold opacity-85">Start tracking a new budget</span>
          </span>
        </Button>
      </section>

      {/* ── Ledger list ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black tracking-tight text-foreground">Your Ledgers</h2>
          <div className="flex items-center gap-3">
            <button type="button" className="flex items-center gap-1 text-xs font-bold text-primary">
              Recent <ChevronDown className="size-3" />
            </button>
            <Filter className="size-4 text-primary" />
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
            <h2 className="text-base font-black tracking-tight text-foreground">Recent activity</h2>
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
