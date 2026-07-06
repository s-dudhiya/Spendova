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
  <div className="flex min-h-[104px] flex-col justify-between rounded-[20px] border border-border/70 bg-card p-4">
    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <div>
      <p className={`spendova-money-value mt-2 text-xl font-black sm:text-2xl ${valueClass}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs font-medium text-muted-foreground">{sub}</p>
      )}
    </div>
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
  
  let progress = 0;
  if (totalBudget > 0) {
    progress = Math.min(Math.round(((paidExpenses + pendingExpenses + approvedExpenses) / totalBudget) * 100), 100);
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-[20px] bg-card p-4 shadow-soft border border-border/70">
      
      {/* Primary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Budget</span>
          <span className="spendova-money-value text-xl font-black text-foreground">{money(totalBudget)}</span>
        </div>
        <div className="flex flex-col gap-1 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Spent</span>
          <span className="spendova-money-value text-xl font-black text-foreground">{money(paidExpenses)}</span>
        </div>
        <div className="flex flex-col gap-1 text-right">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Available</span>
          <span className={`spendova-money-value text-xl font-black ${availableBudget <= 0 ? "text-destructive" : availableBudget < totalBudget * 0.2 ? "text-warning" : "text-success"}`}>
            {money(availableBudget)}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary/10">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              progress > 95 ? 'bg-destructive' : progress > 80 ? 'bg-warning' : 'bg-primary'
            }`} 
            style={{ width: `${progress}%` }} 
          />
        </div>
        <span className="text-xs font-bold text-muted-foreground">{progress}%</span>
      </div>

      {/* Extra Info (Pending, Expected, Savings) */}
      <div className={`grid gap-2 border-t border-border/60 pt-3 ${budgetType === "monthly" ? "grid-cols-3" : "grid-cols-2"}`}>
        <div className="flex flex-col gap-0.5 text-left">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pending</span>
          <span className={`spendova-money-value text-sm font-bold ${hasPending ? "text-warning" : "text-muted-foreground"}`}>
            {money(pendingExpenses + approvedExpenses)}
          </span>
        </div>
        <div className={`flex flex-col gap-0.5 ${budgetType === "monthly" ? "text-center" : "text-right"}`}>
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Expected</span>
          <span className={`spendova-money-value text-sm font-bold ${expectedAvailable <= 0 ? "text-destructive" : expectedAvailable < totalBudget * 0.2 && hasPending ? "text-warning" : "text-muted-foreground"}`}>
            {money(expectedAvailable)}
          </span>
        </div>
        {budgetType === "monthly" && (
          <div className="flex flex-col gap-0.5 text-right">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total Savings</span>
            <span className={`spendova-money-value text-sm font-bold ${totalSavings > 0 ? "text-success" : "text-muted-foreground"}`}>{money(totalSavings)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
