// ============================================================
// Budget Ledger – Main View (List of Ledgers + Entry Point)
// ============================================================

import { useState } from "react";
import { Plus, BookOpen, Users, Calendar, Wallet, ChevronRight, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { LedgerRow, LedgerRole } from "./types";
import { LedgerDetail } from "./LedgerDetail";
import { CreateLedgerDrawer } from "./CreateLedgerDrawer";
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
  const isOwner = userRole === "owner";

  // Quick summary: use all budget additions from ledger_members query
  // For the list view, we can't compute from ledger detail data (not fetched yet),
  // so just show member count and type badges.
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
            <h3 className="truncate font-black text-foreground">{ledger.name}</h3>
            {ledger.is_archived && (
              <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
                Archived
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground capitalize">
              {ledger.budget_type === "monthly" ? (
                <Calendar className="size-3" />
              ) : (
                <Wallet className="size-3" />
              )}
              {ledger.budget_type === "monthly" ? "Monthly" : "One-Time"}
            </span>
            {ledger.ledger_type === "shared" && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Users className="size-3" />
                {memberCount} members
              </span>
            )}
            <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-bold capitalize text-muted-foreground">
              {userRole}
            </span>
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
  <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-soft">
    <div className="grid size-16 place-items-center rounded-full bg-elevated text-primary">
      <BookOpen className="size-7" />
    </div>
    <div>
      <p className="text-base font-black text-foreground">No ledgers yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a ledger to start tracking budgets and expenses.
      </p>
    </div>
    <Button className="shadow-primary-action" onClick={onCreate}>
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

  return (
    <main className="space-y-6 pb-20">
      {/* ── Hero summary ── */}
      {activeLedgers.length > 0 && (
        <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
          <p className="text-sm font-medium text-muted-foreground">
            Budget Ledger
          </p>
          <p className="mt-1 text-3xl font-black tracking-tight text-foreground">
            {activeLedgers.length} Active{" "}
            {activeLedgers.length === 1 ? "Ledger" : "Ledgers"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and manage your budgets in one place.
          </p>
        </section>
      )}

      {/* ── Create button ── */}
      <section>
        <Button
          className="w-full h-12 shadow-primary-action"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Create Ledger
        </Button>
      </section>

      {/* ── Ledger list ── */}
      <section>
        {visibleLedgers.length === 0 ? (
          <LedgerEmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-black tracking-tight text-foreground">
                Your Ledgers
              </h2>
              {archivedLedgers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
                >
                  <Archive className="size-3.5" />
                  {showArchived ? "Hide archived" : `Show archived (${archivedLedgers.length})`}
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
