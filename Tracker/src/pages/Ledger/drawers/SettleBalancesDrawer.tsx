import { useState, useMemo } from "react";
import { CheckCircle2, Loader2, IndianRupee } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
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
import { supabase } from "@/integrations/supabase/client";
import type { LedgerExpenseRow } from "../types";
import { money, displayName, getInitial } from "../utils";
import { logLedgerActivity } from "../hooks";

interface SettleBalancesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: LedgerExpenseRow[];
  ledgerId: string;
  currentUserId: string;
  onSuccess: () => Promise<void>;
}

export const SettleBalancesDrawer = ({
  open,
  onOpenChange,
  expenses,
  ledgerId,
  currentUserId,
  onSuccess,
}: SettleBalancesDrawerProps) => {
  const { toast } = useToast();
  const [processingUser, setProcessingUser] = useState<string | null>(null);

  // Group pending expenses by user
  const userBalances = useMemo(() => {
    const balances = new Map<string, {
      userId: string;
      name: string;
      totalPending: number;
      expenseIds: string[];
      count: number;
      profiles: any;
    }>();

    expenses
      .filter((e) => e.status === "pending")
      .forEach((expense) => {
        const userId = expense.user_id;
        if (!balances.has(userId)) {
          balances.set(userId, {
            userId,
            name: displayName(expense.profiles),
            totalPending: 0,
            expenseIds: [],
            count: 0,
            profiles: expense.profiles,
          });
        }
        
        const balance = balances.get(userId)!;
        balance.totalPending += Number(expense.amount);
        balance.expenseIds.push(expense.id);
        balance.count += 1;
      });

    return Array.from(balances.values()).sort((a, b) => b.totalPending - a.totalPending);
  }, [expenses]);

  const handleSettleUser = async (userId: string, expenseIds: string[], amount: number) => {
    if (processingUser) return;
    setProcessingUser(userId);
    const now = new Date().toISOString();

    try {
      const { error } = await supabase
        .from("ledger_expenses" as never)
        .update({
          status: "paid",
          paid_at: now,
          reviewed_by: currentUserId,
          reviewed_at: now,
          updated_at: now,
        } as never)
        .in("id" as never, expenseIds);

      if (error) throw error;

      // Log activity
      await logLedgerActivity(ledgerId, currentUserId, "expense_paid", {
        entityType: "expense_batch",
        entityId: userId,
        metadata: { amount, count: expenseIds.length, status: "paid" },
      });

      // Send push notifications for each paid expense
      expenseIds.forEach((expId) => {
        void supabase.functions.invoke("send-ledger-notification", {
          body: {
            action: "expense_paid",
            ledger_id: ledgerId,
            expense_id: expId,
            actor_id: currentUserId,
          },
        });
      });

      toast({ title: "Balances settled successfully" });
      await onSuccess();
      
      // Close drawer automatically if no balances are left
      if (userBalances.length <= 1) {
        onOpenChange(false);
      }
    } catch (error: any) {
      toast({ title: "Failed to settle balances", description: error.message, variant: "destructive" });
    } finally {
      setProcessingUser(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto flex max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2.5rem] border-border bg-background px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <DrawerHeader className="shrink-0 px-6 pt-6 pb-4 text-left">
          <DrawerTitle className="flex items-center gap-2 text-xl font-bold">
            {/* <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <IndianRupee className="size-4" />
            </div> */}
            Pending Payouts
          </DrawerTitle>
          <DrawerDescription className="text-sm">
            Easily view and settle pending balances with members.
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
          {userBalances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center opacity-70">
              <CheckCircle2 className="size-12 text-success mb-3 opacity-50" />
              <p className="text-lg font-bold text-foreground">All Settled Up!</p>
              <p className="text-sm text-muted-foreground mt-1">There are no pending expenses to pay.</p>
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              {userBalances.map((balance) => (
                <div key={balance.userId} className="flex items-center justify-between gap-4 rounded-3xl bg-card border border-border/40 p-4 shadow-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">
                      {getInitial(balance.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-foreground">{balance.name}</p>
                      <p className="truncate text-xs font-semibold text-muted-foreground mt-0.5">
                        {balance.count} {balance.count === 1 ? 'expense' : 'expenses'} pending
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <p className="text-lg font-black text-foreground">
                      {money(balance.totalPending)}
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          disabled={processingUser !== null}
                          className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/25 active:scale-95 disabled:opacity-50"
                        >
                          {processingUser === balance.userId ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          Mark Paid
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Settle Balance</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to mark all {balance.count} pending {balance.count === 1 ? 'expense' : 'expenses'} for {balance.name} as paid?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleSettleUser(balance.userId, balance.expenseIds, balance.totalPending)}>
                            Confirm
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
