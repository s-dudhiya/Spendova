// ============================================================
// Budget Ledger – Budget Summary Cards
// ============================================================

import type { LedgerBudgetSummary, BudgetType } from "../types";
import { money } from "../utils";

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}

const SummaryCard = ({ label, value, sub, valueClass = "text-foreground" }: SummaryCardProps) => (
  <div className="rounded-2xl bg-elevated p-4 shadow-soft">
    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className={`mt-2 text-lg font-black leading-tight ${valueClass}`}>
      {value}
    </p>
    {sub && (
      <p className="mt-1 text-xs font-medium text-muted-foreground">{sub}</p>
    )}
  </div>
);

interface BudgetCardsProps {
  summary: LedgerBudgetSummary;
  budgetType: BudgetType;
  isMonthly?: boolean;
  monthLabel?: string;
}

export const BudgetCards = ({
  summary,
  budgetType,
  isMonthly,
  monthLabel,
}: BudgetCardsProps) => {
  const {
    totalBudget,
    paidExpenses,
    pendingExpenses,
    approvedExpenses,
    availableBudget,
    expectedAvailable,
    totalSavings,
  } = summary;

  const hasPending = pendingExpenses + approvedExpenses > 0;

  return (
    <div className="space-y-3">
      {/* Row 1: Total Budget + Available Budget */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="Total Budget"
          value={money(totalBudget)}
          sub={isMonthly && monthLabel ? monthLabel : undefined}
        />
        <SummaryCard
          label="Available Budget"
          value={money(availableBudget)}
          valueClass={
            availableBudget <= 0
              ? "text-destructive"
              : availableBudget < totalBudget * 0.2
              ? "text-warning"
              : "text-success"
          }
          sub="After paid expenses"
        />
      </div>

      {/* Row 2: Paid + Expected Available */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="Paid Expenses"
          value={money(paidExpenses)}
          valueClass={paidExpenses > 0 ? "text-foreground" : "text-muted-foreground"}
        />
        <SummaryCard
          label="Expected Available"
          value={money(expectedAvailable)}
          valueClass={
            expectedAvailable <= 0
              ? "text-destructive"
              : "text-muted-foreground"
          }
          sub="If all pending paid"
        />
      </div>

      {/* Row 3: Pending + Approved (only when relevant) */}
      {hasPending && (
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard
            label="Pending"
            value={money(pendingExpenses)}
            valueClass={pendingExpenses > 0 ? "text-warning" : "text-muted-foreground"}
          />
          <SummaryCard
            label="Approved"
            value={money(approvedExpenses)}
            valueClass={approvedExpenses > 0 ? "text-primary" : "text-muted-foreground"}
            sub="Awaiting payment"
          />
        </div>
      )}

      {/* Row 4: Savings (monthly only) */}
      {budgetType === "monthly" && (
        <SummaryCard
          label="Total Savings"
          value={money(totalSavings)}
          valueClass={totalSavings > 0 ? "text-success" : "text-muted-foreground"}
          sub="Carried over from previous months"
        />
      )}
    </div>
  );
};
