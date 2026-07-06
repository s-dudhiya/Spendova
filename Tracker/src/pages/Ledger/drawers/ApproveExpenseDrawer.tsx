import { useState, useEffect } from "react";
import { Banknote, ExternalLink, Loader2, Paperclip, Undo2 } from "lucide-react";
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
import type { LedgerExpenseRow } from "../types";
import { EXPENSE_STATUS_CONFIG } from "../types";
import { money, dateLabel, displayName } from "../utils";
import { getLedgerReceiptUrl, logLedgerActivity } from "../hooks";

interface ApproveExpenseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: LedgerExpenseRow | null;
  ledgerId: string;
  currentUserId: string;
  budgetAdminId?: string;
  onSuccess: () => Promise<void>;
}

export const ApproveExpenseDrawer = ({
  open,
  onOpenChange,
  expense,
  ledgerId,
  currentUserId,
  budgetAdminId,
  onSuccess,
}: ApproveExpenseDrawerProps) => {
  const { toast } = useToast();
  const [activeAction, setActiveAction] = useState<"pay" | "pending" | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [tab, setTab] = useState<"details" | "receipt">("details");

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

  useEffect(() => {
    if (open) setTab("details");
  }, [open]);

  if (!expense) return null;

  const cfg = EXPENSE_STATUS_CONFIG[expense.status] || { label: expense.status, className: "bg-muted text-muted-foreground" };
  const name = displayName(expense.profiles);

  const handleAction = async (action: "pay" | "pending") => {
    if (activeAction) return;
    setActiveAction(action);

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (action === "pay") {
      updates.status = "paid";
      updates.paid_at = now;
      updates.reviewed_by = currentUserId;
      updates.reviewed_at = now;
    } else {
      updates.status = "pending";
      updates.paid_at = null;
    }

    try {
      const { error } = (await supabase
        .from("ledger_expenses" as never)
        .update(updates as never)
        .eq("id" as never, expense.id as never)) as unknown as { error: Error | null };

      if (error) throw error;

      await logLedgerActivity(ledgerId, currentUserId, action === "pay" ? "expense_paid" : "expense_updated", {
        entityType: "expense",
        entityId: expense.id,
        metadata: { amount: expense.amount, title: expense.title, status: action },
      });

      toast({
        title: action === "pay" ? "Marked as paid" : "Reverted to pending",
      });

      onOpenChange(false);
      await onSuccess();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setActiveAction(null);
    }
  };

  const isPayer = expense.user_id === currentUserId;
  const isBudgetAdmin = currentUserId === budgetAdminId;
  const canModify = isPayer || isBudgetAdmin;

  const isPending = expense.status === "pending";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto grid h-[88dvh] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-[2.5rem] border-border bg-background px-0 pb-0">
        <DrawerHeader className="px-6 pb-2 pt-6 text-center">
          <DrawerTitle className="text-xl font-bold">Review Expense</DrawerTitle>
          <DrawerDescription className="text-sm mt-1">
            Paid by {name}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-2">
          {expense.proof_path && (
            <div className="mb-6 grid grid-cols-2 rounded-[2rem] bg-elevated p-1 shadow-inner">
              {(["details", "receipt"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-full px-4 py-2.5 text-sm font-bold capitalize transition-all ${
                    tab === t
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "details" ? "Details" : "Receipt"}
                </button>
              ))}
            </div>
          )}

          {tab === "details" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-xl font-bold text-foreground mb-1">{expense.title}</p>
                <div className="text-5xl font-black text-foreground tracking-tight mb-3">
                  {money(expense.amount)}
                </div>
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${cfg.className}`}>
                  {cfg.label}
                </span>
              </div>

              <div className="rounded-[1.5rem] bg-elevated p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <span className="text-sm font-semibold text-muted-foreground">Paid by</span>
                  <span className="text-sm font-bold text-foreground">{name}</span>
                </div>
                <div className="flex items-center justify-between pb-2">
                  <span className="text-sm font-semibold text-muted-foreground">Date added</span>
                  <span className="text-sm font-bold text-foreground">{dateLabel(expense.created_at)}</span>
                </div>
                {expense.category && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-sm font-semibold text-muted-foreground">Category</span>
                    <span className="text-sm font-bold text-foreground">{expense.category}</span>
                  </div>
                )}
                {expense.notes && (
                  <div className="flex flex-col gap-1.5 pt-4 border-t border-border/50">
                    <span className="text-sm font-semibold text-muted-foreground">Notes</span>
                    <span className="text-sm text-foreground leading-relaxed">{expense.notes}</span>
                  </div>
                )}
                {expense.proof_path && (
                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Paperclip className="size-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">Receipt</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab("receipt")}
                      className="text-sm font-bold text-primary hover:underline"
                    >
                      View attached
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">
                  Actions
                </p>
                <div className="space-y-3">
                  {canModify ? (
                    isPending ? (
                      <button
                        type="button"
                        onClick={() => handleAction("pay")}
                        disabled={activeAction !== null}
                        className="flex w-full items-center justify-center gap-3 rounded-full bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-[0.98] disabled:opacity-50"
                      >
                        {activeAction === "pay" ? <Loader2 className="size-5 animate-spin" /> : <Banknote className="size-5" />}
                        <span className="font-bold text-base">Mark as Paid</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAction("pending")}
                        disabled={activeAction !== null}
                        className="flex w-full items-center justify-center gap-3 rounded-full bg-elevated border border-border p-4 text-foreground transition-transform active:scale-[0.98] hover:bg-elevated/80 disabled:opacity-50"
                      >
                        {activeAction === "pending" ? <Loader2 className="size-5 animate-spin" /> : <Undo2 className="size-5" />}
                        <span className="font-bold text-base">Revert to Pending</span>
                      </button>
                    )
                  ) : (
                    <p className="rounded-2xl bg-elevated/50 p-4 text-sm text-muted-foreground text-center border border-dashed border-border/50">
                      Only the budget admin or the payer can mark this expense as paid.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "receipt" && (
            <div className="space-y-4 pb-4 h-full flex flex-col">
              {loadingReceipt ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : receiptUrl ? (
                <div className="overflow-hidden rounded-[1.5rem] border border-border/50 shadow-sm bg-elevated/20 flex-1 flex items-center justify-center p-2">
                  <img
                    src={receiptUrl}
                    alt="Expense receipt"
                    className="max-w-full max-h-full object-contain rounded-[1rem]"
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-border text-muted-foreground bg-elevated/30">
                  <Paperclip className="size-10 opacity-50" />
                  <p className="text-sm font-medium">Receipt could not be loaded.</p>
                </div>
              )}

              {receiptUrl && (
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full bg-elevated border border-border px-4 py-3.5 text-sm font-bold text-foreground hover:bg-elevated/80 transition-colors"
                >
                  <ExternalLink className="size-4" />
                  Open full size
                </a>
              )}
            </div>
          )}
        </div>

        <div className="p-6 pt-2 bg-background border-t border-transparent">
          <Button
            variant="quiet"
            className="w-full h-14 rounded-full text-base font-bold bg-elevated/50 hover:bg-elevated"
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
