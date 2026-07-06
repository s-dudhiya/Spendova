// ============================================================
// Budget Ledger – Expense Card
// ============================================================

import { Paperclip } from "lucide-react";
import type { LedgerExpenseRow, LedgerRole } from "../types";
import { EXPENSE_STATUS_CONFIG } from "../types";
import { money, dateLabel, displayName, getInitial } from "../utils";

interface ExpenseCardProps {
  expense: LedgerExpenseRow;
  currentUserId: string;
  userRole: LedgerRole;
  onClick: (expense: LedgerExpenseRow) => void;
}

const StatusBadge = ({ status }: { status: LedgerExpenseRow["status"] }) => {
  const cfg = EXPENSE_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
};

export const ExpenseCard = ({
  expense,
  currentUserId,
  userRole,
  onClick,
}: ExpenseCardProps) => {
  const name = displayName(expense.profiles);
  const initial = getInitial(name);
  const isOwner = userRole === "owner" || userRole === "admin";
  const isOwnExpense = expense.user_id === currentUserId;

  const isClickable = isOwner || isOwnExpense;

  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={() => onClick(expense)}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft transition-shadow ${
        isClickable ? "hover:shadow-panel" : "cursor-default"
      }`}
      aria-label={`${name}: ${expense.title} – ${money(expense.amount)}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Avatar */}
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-elevated text-sm font-black text-primary"
          aria-hidden="true"
        >
          {initial}
        </span>

        {/* Content */}
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-bold text-foreground">
            {expense.title}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="truncate">{name}</span>
            {expense.category && (
              <>
                <span>·</span>
                <span className="truncate">{expense.category}</span>
              </>
            )}
            {expense.proof_path && (
              <>
                <span>·</span>
                <Paperclip className="size-3" aria-hidden="true" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Amount + Status */}
      <div className="shrink-0 text-right">
        <p className="text-sm font-black text-foreground">{money(expense.amount)}</p>
        <div className="mt-1">
          <StatusBadge status={expense.status} />
        </div>
      </div>
    </button>
  );
};
