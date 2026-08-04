// ============================================================
// Budget Ledger – Expense Card
// ============================================================

import { Paperclip, Pencil, CheckCircle } from "lucide-react";
import type { LedgerExpenseRow, LedgerRole } from "../types";
import { EXPENSE_STATUS_CONFIG } from "../types";
import { money, dateLabel, displayName, getInitial } from "../utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ExpenseCardProps {
  expense: LedgerExpenseRow;
  currentUserId: string;
  userRole: LedgerRole;
  onClick: (expense: LedgerExpenseRow) => void;
  onEdit?: (expense: LedgerExpenseRow) => void;
  onApprove?: (expense: LedgerExpenseRow) => void;
  isBudgetAdmin?: boolean;
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
  onEdit,
  onApprove,
  isBudgetAdmin,
}: ExpenseCardProps) => {
  const name = displayName(expense.profiles);
  const initial = getInitial(name);
  const isOwner = userRole === "owner" || userRole === "admin" || isBudgetAdmin;
  const isOwnExpense = expense.user_id === currentUserId;
  const canApprove = isBudgetAdmin || isOwnExpense;

  const isClickable = isOwner || isOwnExpense;

  return (
    <div
      role="button"
      tabIndex={isClickable ? 0 : -1}
      onClick={() => {
        if (isClickable) onClick(expense);
      }}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(expense);
        }
      }}
      className={`group flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft transition-all focus:outline-none focus:ring-2 focus:ring-primary ${
        isClickable ? "hover:shadow-panel cursor-pointer" : "cursor-default"
      }`}
      aria-label={`${name}: ${expense.title} – ${money(expense.amount)}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Avatar */}
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-elevated text-sm font-black text-primary transition-transform group-hover:scale-105"
          aria-hidden="true"
        >
          {initial}
        </span>

        {/* Content */}
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">
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

      {/* Amount + Actions + Status */}
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-black text-foreground">{money(expense.amount)}</p>
          {/* Quick Actions (only icons) */}
          {isClickable && (
            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 transition-opacity sm:group-hover:opacity-100">
              {onApprove && canApprove && expense.status === "pending" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="grid size-7 place-items-center rounded-full text-success hover:bg-success/15 active:scale-95 transition-all"
                      onClick={(e) => e.stopPropagation()}
                      title="Mark as Paid"
                    >
                      <CheckCircle className="size-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mark as Paid?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to mark this expense as paid? This will update the status for everyone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onApprove(expense)}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {onEdit && (isOwnExpense || isOwner) && (
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-full text-primary hover:bg-primary/15 active:scale-95 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(expense);
                  }}
                  title="Edit Expense"
                >
                  <Pencil className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
        <StatusBadge status={expense.status} />
      </div>
    </div>
  );
};
