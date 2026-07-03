// ============================================================
// Budget Ledger – Main View (List of Ledgers + Entry Point)
// ============================================================

import { useState } from "react";
import { Plus, BookOpen, Users, Calendar, Wallet, ChevronRight, Archive, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { LedgerRow, LedgerRole } from "./types";
import { LedgerDetail } from "./LedgerDetail";
import { CreateLedgerDrawer } from "./drawers/CreateLedgerDrawer";
import { money, displayName } from "./utils";
import { computeBudgetSummary } from "./utils";

// ── Ledger Card ───────────────────────────────────────────────

interface LedgerCardProps {
  ledger: LedgerRow;
  currentUserId: string;
  onClick: () => void;
}

const LedgerCard = ({ ledger, currentUserId, onClick }: LedgerCardProps) => {
  const userRole: LedgerRole =
    ledger.ledger_members.find((m) => m.user_id === currentUserId)?.role ?? "member";
  const memberCount = ledger.ledger_members.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-panel"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Icon */}
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-elevated text-primary">
          <BookOpen className="size-5" />
        </span>

        {/* Info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-foreground">{ledger.name}</h3>
            {ledger.is_archived && (
              <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
                Archived
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold capitalize text-muted-foreground">
              {ledger.ledger_type}
            </span>
            <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold capitalize text-muted-foreground">
              {ledger.budget_type === "monthly" ? "Monthly" : "One-Time"}
            </span>
            {ledger.ledger_type === "shared" && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" />
                {memberCount}
              </span>
            )}
          </div>
          {ledger.description && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {ledger.description}
            </p>
          )}
        </div>
      </div>

      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
};

// ── Empty State ───────────────────────────────────────────────

const LedgerEmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="rounded-[1.25rem] bg-elevated p-6 text-center shadow-soft">
    <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
      <BookOpen className="size-7" />
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
  /** Ledgers fetched by the parent Index component */
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
  const [showArchived, setShowArchived] = useState(false);

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
        onBack={() => setSelectedLedgerId(null)}
        onRefreshList={refresh}
      />
    );
  }

  const activeLedgers = ledgers.filter((l) => !l.is_archived);
  const archivedLedgers = ledgers.filter((l) => l.is_archived);
  const visibleLedgers = showArchived
    ? [...activeLedgers, ...archivedLedgers]
    : activeLedgers;

  const totalMembers = activeLedgers.reduce(
    (sum, l) => sum + (l.ledger_type === "shared" ? l.ledger_members.length : 0),
    0
  );
  const sharedCount = activeLedgers.filter((l) => l.ledger_type === "shared").length;
  const personalCount = activeLedgers.filter((l) => l.ledger_type === "personal").length;

  return (
    <main className="space-y-6 pb-20">
      {/* ── Hero summary ── */}
      {activeLedgers.length > 0 && (
        <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
          <p className="text-sm font-medium text-muted-foreground">Budget Ledger</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {activeLedgers.length} Active{" "}
            {activeLedgers.length === 1 ? "Ledger" : "Ledgers"}
          </p>
          <div className="mt-5 grid grid-cols-2 items-start gap-4">
            <div className="flex min-w-0 flex-col items-start gap-1 rounded-2xl px-2 py-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Personal</span>
              <span className="text-sm font-bold text-foreground">{personalCount} {personalCount === 1 ? "ledger" : "ledgers"}</span>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-1 rounded-2xl px-2 py-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Shared</span>
              <span className="text-sm font-bold text-foreground">
                {sharedCount} {sharedCount === 1 ? "ledger" : "ledgers"}
                {totalMembers > 0 && <span className="ml-1 text-muted-foreground">· {totalMembers} members</span>}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ── Quick action ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground">Quick action</h2>
        </div>
        <Button
          className="h-16 w-full justify-start gap-4 rounded-[1.25rem] px-5 text-left shadow-primary-action"
          onClick={() => setCreateOpen(true)}
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary-foreground/15">
            <Plus className="size-5" />
          </span>
          <span>
            <span className="block text-base font-black">Create Ledger</span>
            <span className="block text-xs font-semibold opacity-85">Start a new budget tracker</span>
          </span>
        </Button>
      </section>

      {/* ── Ledger list ── */}
      <section>
        {visibleLedgers.length === 0 ? (
          <LedgerEmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold tracking-tight text-foreground">
                Your Ledgers
              </h2>
              {archivedLedgers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary"
                >
                  <Archive className="size-3.5" />
                  {showArchived ? "Hide archived" : `Archived (${archivedLedgers.length})`}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {visibleLedgers.map((ledger) => (
                <LedgerCard
                  key={ledger.id}
                  ledger={ledger}
                  currentUserId={currentUserId}
                  onClick={() => setSelectedLedgerId(ledger.id)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Create Ledger Drawer ── */}
      <CreateLedgerDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        currentUserId={currentUserId}
        onSuccess={refresh}
      />
    </main>
  );
};
