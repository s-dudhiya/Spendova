// ============================================================
// Budget Ledger – Monthly History Drawer
// ============================================================

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { TrendingUp, PiggyBank } from "lucide-react";
import type { LedgerMonthlyBudget } from "./types";
import { MONTH_NAMES } from "./types";
import { money } from "./utils";

interface MonthlyHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthlyBudgets: LedgerMonthlyBudget[];
  totalSavings: number;
  ledgerName: string;
}

const MonthRow = ({ budget }: { budget: LedgerMonthlyBudget }) => {
  const monthName = MONTH_NAMES[(budget.month ?? 1) - 1];
  const spent = budget.paid_amount;
  const total = budget.budget_amount;
  const utilization = total > 0 ? Math.min((spent / total) * 100, 100) : 0;

  return (
    <div className="rounded-2xl bg-elevated p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-black text-foreground">
            {monthName} {budget.year}
          </p>
          {budget.rolled_over_at && (
            <p className="text-xs text-muted-foreground">
              Closed{" "}
              {new Date(budget.rolled_over_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </p>
          )}
        </div>
        {budget.saved_amount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
            <PiggyBank className="size-3" />
            +{money(budget.saved_amount)}
          </span>
        )}
      </div>

      {/* Budget vs Paid bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Spent</span>
          <span>
            {money(spent)} / {money(total)}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-card">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${utilization}%` }}
            role="progressbar"
            aria-valuenow={utilization}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-card p-2 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Budget</p>
          <p className="mt-0.5 text-sm font-black text-foreground">
            {money(budget.budget_amount)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-2 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Paid</p>
          <p className="mt-0.5 text-sm font-black text-foreground">
            {money(budget.paid_amount)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-2 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Saved</p>
          <p
            className={`mt-0.5 text-sm font-black ${
              budget.saved_amount > 0 ? "text-success" : "text-muted-foreground"
            }`}
          >
            {money(budget.saved_amount)}
          </p>
        </div>
      </div>
    </div>
  );
};

export const MonthlyHistoryDrawer = ({
  open,
  onOpenChange,
  monthlyBudgets,
  totalSavings,
  ledgerName,
}: MonthlyHistoryDrawerProps) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="mx-auto flex max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.75rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <DrawerHeader className="shrink-0 px-0 pb-2 text-left">
        <DrawerTitle>Monthly History</DrawerTitle>
        <DrawerDescription>{ledgerName}</DrawerDescription>
      </DrawerHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {/* Total savings banner */}
        {totalSavings > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-success/10 px-4 py-3">
            <TrendingUp className="size-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-black text-success">
                Total Savings: {money(totalSavings)}
              </p>
              <p className="text-xs text-success/80">
                Accumulated from all monthly rollovers
              </p>
            </div>
          </div>
        )}

        {monthlyBudgets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Monthly history will appear here after the first rollover.
          </p>
        ) : (
          <div className="space-y-3 pb-3">
            {monthlyBudgets.map((budget) => (
              <MonthRow key={budget.id} budget={budget} />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-card pt-3">
        <Button
          variant="quiet"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </div>
    </DrawerContent>
  </Drawer>
);
