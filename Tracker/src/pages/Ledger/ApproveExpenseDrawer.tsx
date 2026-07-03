// ============================================================
// Budget Ledger – Approve / Review Expense Drawer (Owner only)
// ============================================================

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Banknote, ExternalLink, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { LedgerExpenseRow } from "./types";
import { EXPENSE_STATUS_CONFIG } from "./types";
import { money, dateLabel, displayName } from "./utils";
import { getLedgerReceiptUrl, logLedgerActivity } from "./hooks";

interface ApproveExpenseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: LedgerExpenseRow | null;
  ledgerId: string;
  currentUserId: string;
  onSuccess: () => Promise<void>;
}

type Action = "approve" | "reject" | "pay";

const ActionButton = ({
  icon: Icon,
  label,
  description,
  onClick,
  loading,
  disabled,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  variant: "default" | "quiet" | "destructive";
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading || disabled}
    className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-colors disabled:opacity-50 ${
      variant === "default"
        ? "bg-primary/10 hover:bg-primary/20"
        : variant === "destructive"
        ? "bg-destructive/10 hover:bg-destructive/15"
        : "bg-elevated hover:bg-elevated/70"
    }`}
  >
    <span
      className={`grid size-10 shrink-0 place-items-center rounded-full ${
        variant === "default"
          ? "bg-primary text-primary-foreground"
          : variant === "destructive"
          ? "bg-destructive text-destructive-foreground"
          : "bg-card text-muted-foreground"
      }`}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <Icon className="size-5" />
      )}
    </span>
    <div className="min-w-0">
      <p className="font-bold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  </button>
);

export const ApproveExpenseDrawer = ({
  open,
  onOpenChange,
  expense,
  ledgerId,
  currentUserId,
  onSuccess,
}: ApproveExpenseDrawerProps) => {
  const { toast } = useToast();
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [tab, setTab] = useState<"details" | "receipt">("details");

  // Load receipt URL when expense changes
  useEffect(() => {
    if (!expense?.proof_path || !open) {
      setReceiptUrl(null);
      return;
    }
    setLoadingReceipt(true);
    getLedgerReceiptUrl(expense.proof_path)
      .then(setReceiptUrl)
      .finally(() => setLoadingReceipt(false));
  }, [expense?.proof_path, open]);

  // Reset tab when drawer opens
  useEffect(() => {
    if (open) setTab(expense?.proof_path ? "details" : "details");
  }, [open, expense?.proof_path]);

  if (!expense) return null;

  const cfg = EXPENSE_STATUS_CONFIG[expense.status];
  const name = displayName(expense.profiles);

  const handleAction = async (action: Action) => {
    if (activeAction) return;
    setActiveAction(action);

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      reviewed_by: currentUserId,
      reviewed_at: now,
      updated_at: now,
    };

    let newStatus: LedgerExpenseRow["status"];
    let activityAction: string;

    if (action === "approve") {
      newStatus = "approved";
      activityAction = "expense_approved";
    } else if (action === "reject") {
      newStatus = "rejected";
      activityAction = "expense_rejected";
    } else {
      newStatus = "paid";
      updates.paid_at = now;
      activityAction = "expense_paid";
    }

    updates.status = newStatus;

    try {
      const { error } = (await supabase
        .from("ledger_expenses" as never)
        .update(updates as never)
        .eq("id" as never, expense.id as never)) as unknown as { error: Error | null };

      if (error) throw error;

      await logLedgerActivity(ledgerId, currentUserId, activityAction, {
        entityType: "expense",
        entityId: expense.id,
        metadata: { amount: expense.amount, title: expense.title },
      });

      toast({
        title:
          action === "approve"
            ? "Expense approved"
            : action === "reject"
            ? "Expense rejected"
            : "Marked as paid",
        description:
          action === "pay"
            ? "The budget has been updated."
            : undefined,
      });

      onOpenChange(false);
      await onSuccess();
    } catch (error) {
      toast({
        title: "Action failed",
        description:
          error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setActiveAction(null);
    }
  };

  const canApprove = expense.status === "pending";
  const canReject = expense.status === "pending" || expense.status === "approved";
  const canPay = expense.status === "approved";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto flex max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.75rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <DrawerHeader className="shrink-0 px-0 pb-2 text-left">
          <DrawerTitle>Review Expense</DrawerTitle>
          <DrawerDescription>
            Submitted by {name}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {/* Tab switcher */}
          {expense.proof_path && (
            <div className="mb-4 grid grid-cols-2 rounded-full bg-elevated p-1">
              {(["details", "receipt"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-full px-4 py-2 text-sm font-bold capitalize transition-colors ${
                    tab === t
                      ? "bg-primary text-primary-foreground shadow-primary-action"
                      : "text-muted-foreground"
                  }`}
                >
                  {t === "details" ? "Details" : "Receipt"}
                </button>
              ))}
            </div>
          )}

          {tab === "details" && (
            <div className="space-y-3 pb-3">
              {/* Expense info */}
              <div className="rounded-2xl bg-elevated p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-foreground">
                      {expense.title}
                    </p>
                    {expense.category && (
                      <span className="mt-1 inline-block rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {expense.category}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xl font-black text-foreground">
                      {money(expense.amount)}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                    >
                      {cfg.label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Submitted by
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">
                      {name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Date
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">
                      {dateLabel(expense.created_at)}
                    </p>
                  </div>
                </div>

                {expense.notes && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-0.5 text-sm text-foreground">
                      {expense.notes}
                    </p>
                  </div>
                )}

                {expense.proof_path && (
                  <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-3">
                    <Paperclip className="size-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground">
                      Receipt attached
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab("receipt")}
                      className="ml-auto text-xs font-bold text-primary"
                    >
                      View
                    </button>
                  </div>
                )}
              </div>

              {/* Owner actions */}
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Actions
              </p>

              <div className="space-y-2">
                {canApprove && (
                  <ActionButton
                    icon={CheckCircle}
                    label="Approve"
                    description="Verify the expense and approve it for payment."
                    onClick={() => handleAction("approve")}
                    loading={activeAction === "approve"}
                    disabled={activeAction !== null && activeAction !== "approve"}
                    variant="default"
                  />
                )}

                {canPay && (
                  <ActionButton
                    icon={Banknote}
                    label="Mark as Paid"
                    description="Confirm you have reimbursed this expense. Updates budget."
                    onClick={() => handleAction("pay")}
                    loading={activeAction === "pay"}
                    disabled={activeAction !== null && activeAction !== "pay"}
                    variant="default"
                  />
                )}

                {canReject && (
                  <ActionButton
                    icon={XCircle}
                    label="Reject"
                    description="Decline this expense. The submitter will be notified."
                    onClick={() => handleAction("reject")}
                    loading={activeAction === "reject"}
                    disabled={activeAction !== null && activeAction !== "reject"}
                    variant="destructive"
                  />
                )}

                {!canApprove && !canPay && !canReject && (
                  <p className="rounded-2xl bg-elevated p-4 text-sm text-muted-foreground">
                    No actions available for this expense.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "receipt" && (
            <div className="space-y-3 pb-3">
              {loadingReceipt ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : receiptUrl ? (
                <div className="overflow-hidden rounded-2xl border border-border">
                  <img
                    src={receiptUrl}
                    alt="Expense receipt"
                    className="w-full object-contain"
                    style={{ maxHeight: "55dvh" }}
                  />
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground">
                  <Paperclip className="size-8" />
                  <p className="text-sm font-medium">Receipt could not be loaded.</p>
                </div>
              )}

              {receiptUrl && (
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-elevated px-4 py-3 text-sm font-bold text-foreground"
                >
                  <ExternalLink className="size-4" />
                  Open full size
                </a>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex gap-2 border-t border-border/60 bg-card pt-3">
          <Button
            variant="quiet"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={activeAction !== null}
          >
            Close
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
