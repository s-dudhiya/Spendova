// ============================================================
// Budget Ledger â€“ Ledger Detail View
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Plus,
  Settings,
  History,
  Trash2,
  UserMinus,
  UserPlus,
  Link as LinkIcon,
  Check,
  Copy,
  X,
  PiggyBank,
  Loader2,
  CircleDollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import type { LedgerRow, LedgerExpenseRow, LedgerRole } from "./types";
import { MONTH_NAMES } from "./types";
import { BudgetCards } from "./components/BudgetCards";
import { ExpenseCard } from "./components/ExpenseCard";
import { AddExpenseDrawer } from "./drawers/AddExpenseDrawer";
import { ApproveExpenseDrawer } from "./drawers/ApproveExpenseDrawer";
import { MonthlyHistoryDrawer } from "./components/MonthlyHistory";
import { Field } from "./components/Fields";

import { useLedgerDetail, logLedgerActivity } from "./hooks";
import {
  money,
  displayName,
  computeBudgetSummary,
  detectRolloverNeeded,
} from "./utils";

// â”€â”€ Rollover Confirmation Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RolloverDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  fromMonth: number;
  fromYear: number;
  savedAmount: number;
}

const RolloverDialog = ({
  open,
  onClose,
  onConfirm,
  fromMonth,
  fromYear,
  savedAmount,
}: RolloverDialogProps) => {
  const [confirming, setConfirming] = useState(false);
  const monthName = MONTH_NAMES[(fromMonth ?? 1) - 1];

  const handle = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl border-border bg-card px-6 py-6 shadow-panel sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="size-5 text-success" />
            New Month Started
          </DialogTitle>
          <DialogDescription>
            A new month has begun. Would you like to roll over the remaining budget from{" "}
            <strong>
              {monthName} {fromYear}
            </strong>{" "}
            into savings?
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 rounded-2xl bg-success/10 p-4">
          <p className="text-sm font-semibold text-muted-foreground">
            Remaining from {monthName} {fromYear}
          </p>
          <p className="mt-1 text-2xl font-black text-success">
            {money(savedAmount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This amount will be added to your total savings.
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="quiet"
            className="flex-1"
            onClick={onClose}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 shadow-primary-action"
            onClick={handle}
            disabled={confirming}
          >
            {confirming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Check className="size-4" />
                Move to Savings
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// â”€â”€ Add Budget Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AddBudgetDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerRow;
  currentUserId: string;
  onSuccess: () => Promise<void>;
}

const AddBudgetDrawer = ({
  open,
  onOpenChange,
  ledger,
  currentUserId,
  onSuccess,
}: AddBudgetDrawerProps) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = parseFloat(amount);

  const handleClose = (o: boolean) => {
    if (!o) { setAmount(""); setNote(""); }
    onOpenChange(o);
  };

  const handleAdd = async () => {
    if (!parsedAmount || parsedAmount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const now = new Date();
    const currentMonth = ledger.budget_type === "monthly" ? now.getMonth() + 1 : null;
    const currentYear = ledger.budget_type === "monthly" ? now.getFullYear() : null;
    try {
      const { error } = (await supabase
        .from("ledger_budget_additions" as never)
        .insert({
          ledger_id: ledger.id,
          amount: parsedAmount,
          note: note.trim() || null,
          added_by: currentUserId,
          month: currentMonth,
          year: currentYear,
        } as never)) as unknown as { error: Error | null };

      if (error) throw error;

      await logLedgerActivity(ledger.id, currentUserId, "budget_added", {
        entityType: "budget",
        entityId: ledger.id,
        metadata: { amount: parsedAmount },
      });

      toast({ title: "Budget added!", description: `${money(parsedAmount)} added to ledger.` });
      handleClose(false);
      await onSuccess();
    } catch (error) {
      toast({
        title: "Failed to add budget",
        description: error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="mx-auto grid h-[88dvh] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-0">
        <DrawerHeader className="px-0 pb-3 pt-4 text-left">
          <DrawerTitle>Add Budget</DrawerTitle>
          <DrawerDescription>
            Budget additions are additive and kept as history.
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-4 pb-3">
            <Field
              id="ab-amount"
              type="number"
              inputMode="decimal"
              min="1"
              step="1"
              label="Amount (₹) *"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
            />
            <Field
              id="ab-note"
              label="Note"
              hint="(optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Mid-month top-up"
              maxLength={300}
            />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_min-content] items-end gap-3 border-t border-border/60 bg-card py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="col-span-2 flex gap-2">
            <Button
              type="button"
              variant="quiet"
              className="flex-1 h-12 rounded-full"
              onClick={() => handleClose(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 rounded-full shadow-primary-action"
              onClick={handleAdd}
              disabled={submitting || !parsedAmount || parsedAmount <= 0}
            >
              {submitting ? "Adding…" : "Add Budget"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

// ————————————————————————————————————————————————————————————————

interface InviteMembersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  currentUserId: string;
  onSuccess: () => Promise<void>;
}

const InviteMembersDrawer = ({
  open,
  onOpenChange,
  ledgerId,
  currentUserId,
  onSuccess,
}: InviteMembersDrawerProps) => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleOpenChange = (o: boolean) => {
    if (!o) { setEmail(""); setShareLink(null); setCopied(false); }
    onOpenChange(o);
  };

  const generateLink = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase
        .from("ledger_invites" as never)
        .insert({ ledger_id: ledgerId, invite_type: "link", invited_by: currentUserId, expires_at: expiresAt } as never)
        .select("token")
        .single() as unknown as { data: { token: string } | null; error: Error | null });
      if (error) throw error;
      setShareLink(`${window.location.origin}/invite-ledger?token=${data!.token}`);
    } catch (e) {
      toast({ title: "Failed to generate link", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sendInvite = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = (await supabase
        .from("ledger_invites" as never)
        .insert({ ledger_id: ledgerId, email: email.trim().toLowerCase(), invite_type: "email", invited_by: currentUserId, expires_at: expiresAt } as never)) as unknown as { error: Error | null };
      if (error) throw error;
      toast({ title: "Invite sent!", description: `Invited ${email.trim()}` });
      setEmail("");
      await onSuccess();
    } catch (e) {
      toast({ title: "Failed to send invite", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  
  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto grid h-[88dvh] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-0">
        <DrawerHeader className="px-0 pb-3 pt-4 text-left">
          <DrawerTitle>Invite Members</DrawerTitle>
          <DrawerDescription>Share access to this ledger.</DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-4 pb-3">
            <div className="rounded-2xl border border-border bg-elevated p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-foreground">Invite link</p>
                  {shareLink ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{shareLink}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Expires in 24 hours.</p>
                  )}
                </div>
                <Button size="sm" variant="quiet" disabled={generating} onClick={shareLink ? copyLink : generateLink}>
                  {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  {generating ? "Generating…" : shareLink ? (copied ? "Copied!" : "Copy") : "Generate"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground">Invite by email</p>
              <div className="flex gap-2">
                <Field type="email" label="" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@email.com" className="flex-1 mt-0" />
                <Button disabled={sending || !email.trim()} onClick={sendInvite}>
                  {sending ? "…" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-border/60 bg-card py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <Button variant="quiet" className="w-full h-12 rounded-full" onClick={() => handleOpenChange(false)}>Close</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

// ————————————————————————————————————————————————————————————————

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerRow;
  currentUserId: string;
  userRole: LedgerRole;
  onBack: () => void;
  onRefreshList: () => Promise<void>;
  onSuccess: () => Promise<void>;
}

const SettingsDrawer = ({
  open,
  onOpenChange,
  ledger,
  currentUserId,
  userRole,
  onBack,
  onRefreshList,
  onSuccess,
}: SettingsDrawerProps) => {
  const { toast } = useToast();
  const [deletingLedger, setDeletingLedger] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const isOwner = userRole === "owner";

  const archiveLedger = async () => {
    if (!isOwner || deletingLedger) return;
    setDeletingLedger(true);
    try {
      const { error } = (await supabase
        .from("ledgers" as never)
        .update({ is_archived: !ledger.is_archived, updated_at: new Date().toISOString() } as never)
        .eq("id" as never, ledger.id as never)) as unknown as { error: Error | null };
      if (error) throw error;
      toast({ title: ledger.is_archived ? "Ledger restored" : "Ledger archived" });
      setConfirmArchive(false);
      onOpenChange(false);
      onBack();
      await onRefreshList();
    } catch (e) {
      toast({ title: "Failed to archive ledger", variant: "destructive" });
    } finally {
      setDeletingLedger(false);
    }
  };

  const removeMember = async (userId: string, name: string) => {
    if (!isOwner) return;
    setDeletingExpenseId(userId);
    try {
      const { error } = (await supabase
        .from("ledger_members" as never)
        .delete()
        .eq("ledger_id" as never, ledger.id as never)
        .eq("user_id" as never, userId as never)) as unknown as { error: Error | null };
      if (error) throw error;
      await logLedgerActivity(ledger.id, currentUserId, "member_removed", { entityType: "member" });
      toast({ title: `${name} removed from ledger` });
      await onSuccess();
    } catch (e) {
      toast({ title: "Failed to remove member", variant: "destructive" });
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const leaveledger = async () => {
    if (userRole === "owner") return;
    setDeletingLedger(true);
    try {
      const { error } = (await supabase
        .from("ledger_members" as never)
        .delete()
        .eq("ledger_id" as never, ledger.id as never)
        .eq("user_id" as never, currentUserId as never)) as unknown as { error: Error | null };
      if (error) throw error;
      toast({ title: "You left the ledger" });
      onOpenChange(false);
      onBack();
      await onRefreshList();
    } catch (e) {
      toast({ title: "Failed to leave ledger", variant: "destructive" });
    } finally {
      setDeletingLedger(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto flex max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.75rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <DrawerHeader className="shrink-0 px-0 pb-2 text-left">
          <DrawerTitle>Ledger Settings</DrawerTitle>
          <DrawerDescription>{ledger.name}</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-4 pb-3">
            {/* Members list */}
            {ledger.ledger_members.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Members ({ledger.ledger_members.length})
                </p>
                {ledger.ledger_members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between gap-3 rounded-2xl bg-elevated p-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-card text-sm font-black text-primary">
                        {displayName(m.profiles).charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{displayName(m.profiles)}</p>
                        <p className="text-xs capitalize text-muted-foreground">{m.role}</p>
                      </div>
                    </div>
                    {isOwner && m.user_id !== currentUserId && (
                      <Button
                        size="sm"
                        variant="quiet"
                        disabled={deletingExpenseId === m.user_id}
                        onClick={() => removeMember(m.user_id, displayName(m.profiles))}
                      >
                        <UserMinus className="size-4" />
                        {deletingExpenseId === m.user_id ? "Removingâ€¦" : "Remove"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Danger zone */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-destructive/70">
                Danger Zone
              </p>
              {isOwner ? (
                confirmArchive ? (
                  <div className="space-y-3 rounded-2xl bg-destructive/10 p-4">
                    <p className="text-sm font-medium text-foreground">
                      {ledger.is_archived
                        ? "Restore this ledger? It will become active again."
                        : "Archive this ledger? Members won't lose data, but it will be hidden from the list."}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="quiet" className="flex-1" onClick={() => setConfirmArchive(false)} disabled={deletingLedger}>
                        Cancel
                      </Button>
                      <Button variant="destructive" className="flex-1" onClick={archiveLedger} disabled={deletingLedger}>
                        {deletingLedger ? "Processingâ€¦" : ledger.is_archived ? "Restore" : "Archive"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="quiet" className="w-full" onClick={() => setConfirmArchive(true)}>
                    <Trash2 className="size-4" />
                    {ledger.is_archived ? "Restore Ledger" : "Archive Ledger"}
                  </Button>
                )
              ) : (
                <Button variant="quiet" className="w-full" onClick={leaveledger} disabled={deletingLedger}>
                  <UserMinus className="size-4" />
                  {deletingLedger ? "Leavingâ€¦" : "Leave Ledger"}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[1fr] items-end gap-3 border-t border-border/60 bg-card py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <Button variant="quiet" className="w-full h-12 rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

// â”€â”€ Main LedgerDetail View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface LedgerDetailProps {
  ledger: LedgerRow;
  currentUserId: string;
  onBack: () => void;
  onRefreshList: () => Promise<void>;
}

type ExpenseFilter = "all" | "pending" | "approved" | "paid" | "rejected";

export const LedgerDetail = ({
  ledger,
  currentUserId,
  onBack,
  onRefreshList,
}: LedgerDetailProps) => {
  const { toast } = useToast();
  const { expenses, budgetAdditions, monthlyClosures, invites, loading, refresh } =
    useLedgerDetail(ledger.id);

  const userRole: LedgerRole =
    ledger.ledger_members.find((m) => m.user_id === currentUserId)?.role ?? "member";
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";

  // Drawer states
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<LedgerExpenseRow | null>(null);
  const [reviewExpense, setReviewExpense] = useState<LedgerExpenseRow | null>(null);
  const [addBudgetOpen, setAddBudgetOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState<ExpenseFilter>("all");

  // Monthly rollover
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [rolloverInfo, setRolloverInfo] = useState<{ fromMonth: number; fromYear: number; savedAmount: number } | null>(null);
  const [rolloverDismissed, setRolloverDismissed] = useState(false);

  // Detect rollover need for monthly ledgers
  useEffect(() => {
    if (
      ledger.budget_type !== "monthly" ||
      !isOwnerOrAdmin ||
      rolloverDismissed ||
      budgetAdditions.length === 0
    )
      return;

    const { needed, fromMonth, fromYear } = detectRolloverNeeded(budgetAdditions);
    if (!needed) return;

    // Calculate how much to save
    const lastMonthAdditions = budgetAdditions.filter(
      (a) => a.month === fromMonth && a.year === fromYear
    );
    const lastMonthExpenses = expenses.filter(
      (e) => e.month === fromMonth && e.year === fromYear
    );
    const lastBudget = lastMonthAdditions.reduce(
      (s, a) => s + Number(a.amount || 0),
      0
    );
    const lastPaid = lastMonthExpenses
      .filter((e) => e.status === "paid")
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const saved = Math.max(lastBudget - lastPaid, 0);

    setRolloverInfo({ fromMonth, fromYear, savedAmount: saved });
    setRolloverOpen(true);
  }, [budgetAdditions, expenses, ledger.budget_type, isOwnerOrAdmin, rolloverDismissed]);

  const handleRolloverConfirm = useCallback(async () => {
    if (!rolloverInfo) return;
    const { fromMonth, fromYear, savedAmount } = rolloverInfo;

    const lastMonthAdditions = budgetAdditions.filter(
      (a) => a.month === fromMonth && a.year === fromYear
    );
    const lastPaid = expenses
      .filter((e) => e.month === fromMonth && e.year === fromYear && e.status === "paid")
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const budgetAmount = lastMonthAdditions.reduce(
      (s, a) => s + Number(a.amount || 0),
      0
    );

    const { data, error } = await (supabase.rpc("perform_ledger_monthly_rollover" as never, {
      p_ledger_id: ledger.id,
      p_from_month: fromMonth,
      p_from_year: fromYear,
      p_budget_amount: budgetAmount,
      p_paid_amount: lastPaid,
      p_saved_amount: savedAmount,
    } as never) as unknown as { data: { error?: string } | null; error: Error | null });

    if (error || data?.error) {
      toast({
        title: "Rollover failed",
        description: error?.message || data?.error || "Something went wrong.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Month rolled over!",
      description: `${money(savedAmount)} moved to savings.`,
    });
    setRolloverOpen(false);
    setRolloverDismissed(true);
    await Promise.all([refresh(), onRefreshList()]);
  }, [rolloverInfo, budgetAdditions, expenses, ledger.id, refresh, onRefreshList, toast]);

  // Compute budget summary
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const isMonthly = ledger.budget_type === "monthly";
  const filteredAdditions = isMonthly
    ? budgetAdditions.filter((a) => a.month === currentMonth && a.year === currentYear)
    : budgetAdditions;
  const filteredExpenses = isMonthly
    ? expenses.filter((e) => e.month === currentMonth && e.year === currentYear)
    : expenses;

  const summary = computeBudgetSummary(filteredAdditions, filteredExpenses, Number(ledger.total_savings || 0));

  const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabel = isMonthly ? `${MONTH_NAMES_SHORT[currentMonth - 1]} ${currentYear}` : undefined;

  // Filter expenses for timeline
  const visibleExpenses =
    filter === "all"
      ? filteredExpenses
      : filteredExpenses.filter((e) => e.status === filter);

  // Expense card click
  const handleExpenseClick = (expense: LedgerExpenseRow) => {
    const isOwn = expense.user_id === currentUserId;
    const isPending = expense.status === "pending";

    if (isOwnerOrAdmin) {
      setReviewExpense(expense);
    } else if (isOwn && isPending) {
      setEditExpense(expense);
    }
  };

  const handleDeleteExpense = async (expense: LedgerExpenseRow) => {
    const canDelete =
      isOwnerOrAdmin || (expense.user_id === currentUserId && expense.status === "pending");
    if (!canDelete) return;

    const { error } = (await supabase
      .from("ledger_expenses" as never)
      .delete()
      .eq("id" as never, expense.id as never)) as unknown as { error: Error | null };

    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Expense deleted" });
    await refresh();
  };

  const pendingCount = filteredExpenses.filter((e) => e.status === "pending").length;

  const FILTERS: Array<{ value: ExpenseFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "paid", label: "Paid" },
    { value: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-6">
      {/* â”€â”€ Header â”€â”€ */}
      <section className="rounded-[1.25rem] bg-card p-5 shadow-panel">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-primary"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
        </div>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold tracking-tight text-foreground">
              {ledger.name}
            </h2>
            {ledger.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{ledger.description}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-elevated px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
                {ledger.ledger_type}
              </span>
              <span className="rounded-full bg-elevated px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
                {ledger.budget_type === "monthly" ? "Monthly" : "One-Time"}
              </span>
              <span className="rounded-full bg-elevated px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
                {userRole}
              </span>
              {ledger.is_archived && (
                <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
                  Archived
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
            aria-label="Ledger settings"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </section>

      {/* â”€â”€ Budget Summary â”€â”€ */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-black tracking-tight text-foreground">
            Budget Overview
            {isMonthly && monthLabel && (
              <span className="ml-2 text-sm font-semibold text-muted-foreground">
                Â· {monthLabel}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {isMonthly && monthlyClosures.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1 text-xs font-bold text-primary"
              >
                <History className="size-3.5" />
                History
              </button>
            )}
          </div>
        </div>
        <BudgetCards
          summary={summary}
          budgetType={ledger.budget_type}
          isMonthly={isMonthly}
          monthLabel={monthLabel}
        />
      </section>

      {/* â”€â”€ Quick Actions â”€â”€ */}
      {!ledger.is_archived && (
        <section className="flex flex-col gap-3">
          <div className={`grid gap-3 ${isOwnerOrAdmin ? "grid-cols-2" : "grid-cols-1"}`}>
            <Button
              className="h-12 shadow-primary-action"
              onClick={() => setAddExpenseOpen(true)}
            >
              <Plus className="size-4" />
              Add Expense
            </Button>
            {isOwnerOrAdmin && (
              <Button
                className="h-12 shadow-primary-action"
                onClick={() => setAddBudgetOpen(true)}
              >
                <Plus className="size-4" />
                Add Budget
              </Button>
            )}
          </div>
          
          {isOwnerOrAdmin && (
            ledger.ledger_type === "shared" ? (
              <Button
                variant="quiet"
                className="relative h-12 w-full"
                onClick={() => setInviteOpen(true)}
              >
                <UserPlus className="size-4" />
                Invite Members
                {invites.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-primary-foreground shadow-primary-action ring-2 ring-card">
                    {invites.length}
                  </span>
                )}
              </Button>
            ) : isMonthly && monthlyClosures.length > 0 ? (
              <Button
                variant="quiet"
                className="h-12 w-full"
                onClick={() => setHistoryOpen(true)}
              >
                <History className="size-4" />
                History
              </Button>
            ) : null
          )}
        </section>
      )}

      {/* â”€â”€ Expense Timeline â”€â”€ */}
      <section className="pb-20">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-black tracking-tight text-foreground">
            Expenses
            {pendingCount > 0 && isOwnerOrAdmin && (
              <span className="ml-2 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
                {pendingCount} pending
              </span>
            )}
          </h2>
        </div>

        {/* Filter tabs */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition-colors ${
                filter === f.value
                  ? "bg-primary text-primary-foreground shadow-primary-action"
                  : "bg-elevated text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && expenses.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-7 animate-spin text-muted-foreground" />
          </div>
        ) : visibleExpenses.length === 0 ? (
          <div className="rounded-[1.25rem] bg-elevated p-6 text-center shadow-soft">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
              <CircleDollarSign className="size-7" />
            </div>
            <p className="mt-4 text-base font-black text-foreground">
              {filter === "all" ? "No expenses yet" : `No ${filter} expenses`}
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {filter === "all"
                ? "Add your first expense to start tracking this budget."
                : "Try changing the filter to see other expenses."}
            </p>
            {filter === "all" && !ledger.is_archived && (
              <Button onClick={() => setAddExpenseOpen(true)} variant="quiet" className="mt-4">
                <Plus />Add Expense
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleExpenses.map((expense) => (
              <div key={expense.id} className="relative">
                <ExpenseCard
                  expense={expense}
                  currentUserId={currentUserId}
                  userRole={userRole}
                  onClick={handleExpenseClick}
                />
                {/* Delete button for owner or own pending */}
                {(isOwnerOrAdmin ||
                  (expense.user_id === currentUserId && expense.status === "pending")) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteExpense(expense)}
                    className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-card text-muted-foreground opacity-0 shadow-soft transition hover:bg-destructive/10 hover:text-destructive hover:opacity-100 group-hover:opacity-100"
                    aria-label="Delete expense"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* â”€â”€ Modals & Drawers â”€â”€ */}
      <AddExpenseDrawer
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        ledger={ledger}
        currentUserId={currentUserId}
        onSuccess={refresh}
      />

      <AddExpenseDrawer
        open={Boolean(editExpense)}
        onOpenChange={(o) => !o && setEditExpense(null)}
        ledger={ledger}
        currentUserId={currentUserId}
        onSuccess={async () => { setEditExpense(null); await refresh(); }}
        editExpense={editExpense}
      />

      <ApproveExpenseDrawer
        open={Boolean(reviewExpense)}
        onOpenChange={(o) => !o && setReviewExpense(null)}
        expense={reviewExpense}
        ledgerId={ledger.id}
        currentUserId={currentUserId}
        onSuccess={async () => { setReviewExpense(null); await refresh(); }}
      />

      <AddBudgetDrawer
        open={addBudgetOpen}
        onOpenChange={setAddBudgetOpen}
        ledger={ledger}
        currentUserId={currentUserId}
        onSuccess={async () => { setAddBudgetOpen(false); await refresh(); }}
      />

      <InviteMembersDrawer
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        ledgerId={ledger.id}
        currentUserId={currentUserId}
        onSuccess={refresh}
      />

      <MonthlyHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        monthlyClosures={monthlyClosures}
        totalSavings={ledger.total_savings}
        ledgerName={ledger.name}
      />

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        ledger={ledger}
        currentUserId={currentUserId}
        userRole={userRole}
        onBack={onBack}
        onRefreshList={onRefreshList}
        onSuccess={refresh}
      />

      {/* Monthly rollover confirmation */}
      {rolloverInfo && (
        <RolloverDialog
          open={rolloverOpen}
          onClose={() => { setRolloverOpen(false); setRolloverDismissed(true); }}
          onConfirm={handleRolloverConfirm}
          fromMonth={rolloverInfo.fromMonth}
          fromYear={rolloverInfo.fromYear}
          savedAmount={rolloverInfo.savedAmount}
        />
      )}
    </div>
  );
};
