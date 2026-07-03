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
      className={`w-full rounded-2xl bg-card p-4 text-left shadow-soft transition-shadow ${
        isClickable ? "hover:shadow-panel" : "cursor-default"
      }`}
      aria-label={`${name}: ${expense.title} – ${money(expense.amount)}`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full bg-elevated text-sm font-black text-primary"
          aria-hidden="true"
        >
          {initial}
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {name}
              </p>
              <p className="truncate font-bold text-foreground">{expense.title}</p>
              {expense.category && (
                <span className="mt-0.5 inline-block rounded-full bg-elevated px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {expense.category}
                </span>
              )}
            </div>

            {/* Amount + Status */}
            <div className="shrink-0 text-right">
              <p className="font-black text-foreground">{money(expense.amount)}</p>
              <StatusBadge status={expense.status} />
            </div>
          </div>

          {/* Footer row */}
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {dateLabel(expense.created_at)}
            </p>
            {expense.proof_path && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                <Paperclip className="size-3" aria-hidden="true" />
                Receipt
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};
