// ============================================================
// Budget Ledger â€“ Ledger Detail View
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
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
  PlusCircle,
  ShoppingCart,
  RefreshCw,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import type { LedgerRow, LedgerExpenseRow, LedgerRole, LedgerActivityRow } from "./types";
import { MONTH_NAMES } from "./types";
import { BudgetCards } from "./components/BudgetCards";
import { ExpenseCard } from "./components/ExpenseCard";
import { getLedgerIcon } from "./components/LedgerIcon";
import { AddExpenseDrawer } from "./drawers/AddExpenseDrawer";
import { ViewExpenseDrawer } from "./drawers/ViewExpenseDrawer";
import { MonthlyHistoryDrawer } from "./components/MonthlyHistory";
import { Field } from "./components/Fields";
import { FilterSheet, FilterField, FilterTrigger, DateFilterControls } from "./components/Filters";

import { useLedgerDetail, logLedgerActivity } from "./hooks";
import {
  money,
  displayName,
  computeBudgetSummary,
  detectRolloverNeeded,
  timeAgo,
} from "./utils";

const ActivityRow = ({ activity, ledger }: { activity: LedgerActivityRow; ledger?: LedgerRow }) => {
  let icon = <PlusCircle className="size-4" />;
  let iconBg = "bg-primary/15 text-primary";
  let amountClass = "text-foreground";
  let amountPrefix = "+";
  let amountStr = "";

  const isExpense = activity.action === "expense_submitted" || activity.action === "expense_paid" || activity.action === "expense_approved";
  const isRollover = activity.action === "monthly_rollover";
  
  if (isExpense) {
    icon = <ShoppingCart className="size-4" />;
    iconBg = "bg-primary/15 text-primary";
    amountClass = "text-foreground";
    amountPrefix = "";
  } else if (isRollover) {
    icon = <RefreshCw className="size-4" />;
    iconBg = "bg-primary/15 text-primary";
    amountClass = "text-foreground";
  }

  if (activity.metadata && typeof (activity.metadata as any).amount === "number") {
    amountStr = money((activity.metadata as any).amount);
  }

  let title = activity.action;
  if (isExpense && activity.metadata && (activity.metadata as any).title) {
    title = `${activity.profiles?.full_name || activity.profiles?.username || "User"} added ${(activity.metadata as any).title}`;
  } else if (activity.action === "budget_added") {
    title = "Budget increased";
  } else if (isRollover) {
    title = "Monthly rollover completed";
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${iconBg}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{title}</h3>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {amountStr && (
          <p className={`text-sm font-black ${amountClass}`}>
            {amountPrefix}{amountStr}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(activity.created_at)}</p>
      </div>
    </div>
  );
};

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
  ledgerName: string;
  currentUserId: string;
  onSuccess: () => Promise<void>;
}

const InviteMembersDrawer = ({
  open,
  onOpenChange,
  ledgerId,
  ledgerName,
  currentUserId,
  onSuccess,
}: InviteMembersDrawerProps) => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleOpenChange = (o: boolean) => {
    if (!o) { setEmail(""); setUserId(""); setShareLink(null); setCopied(false); }
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
      const { data: profile } = await supabase.from('profiles').select('full_name, username').eq('id', currentUserId).maybeSingle();
      const inviterName = profile?.full_name || profile?.username || "A Spendova user";

      const { data, error } = await supabase.functions.invoke('send-ledger-invite', {
        body: {
          email: email.trim().toLowerCase(),
          ledger_id: ledgerId,
          ledger_name: ledgerName,
          inviter_name: inviterName,
        }
      });
      if (error || data?.error) throw error || new Error(data?.error);
      
      toast({ title: "Invite sent!", description: `Invited ${email.trim()}` });
      setEmail("");
      await onSuccess();
    } catch (e: any) {
      toast({ title: "Failed to send invite", description: e.message || "Network error.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const addByUsername = async () => {
    if (!userId.trim() || addingUser) return;
    setAddingUser(true);
    try {
      const cleanUsername = userId.trim().replace(/^@/, "").toLowerCase();
      
      const { data: foundUser, error: lookupError } = await supabase
        .from("profiles")
        .select("user_id, full_name, username")
        .eq("username", cleanUsername)
        .maybeSingle();

      if (lookupError) throw lookupError;
      
      if (!foundUser) {
        toast({ title: "User not found", description: "No account matches that username.", variant: "destructive" });
        return;
      }

      if (foundUser.user_id === currentUserId) {
        toast({ title: "Cannot add yourself", variant: "destructive" });
        return;
      }
      
      const { data: existing } = await supabase
        .from("ledger_members" as never)
        .select("id")
        .eq("ledger_id", ledgerId)
        .eq("user_id", foundUser.user_id)
        .maybeSingle();
      
      if (existing) {
        toast({ title: "User is already in ledger", variant: "destructive" });
        return;
      }
      
      const { error } = await supabase
        .from("ledger_members" as never)
        .insert({ ledger_id: ledgerId, user_id: foundUser.user_id, role: "member" } as never);
      
      if (error) throw error;
      
      toast({ title: "User added successfully", description: `${foundUser.full_name || foundUser.username} was added to the ledger.` });
      setUserId("");
      await onSuccess();
    } catch (e: any) {
      toast({ title: "Failed to add user", description: e.message || "Network error.", variant: "destructive" });
    } finally {
      setAddingUser(false);
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
              <p className="text-sm font-bold text-foreground">Add by Username</p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={userId} 
                  onChange={(e) => setUserId(e.target.value)} 
                  placeholder="@username" 
                  className="flex-1 block h-[44px] rounded-full border border-input bg-background px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50" 
                />
                <Button className="h-[44px] rounded-full px-6" disabled={addingUser || !userId.trim()} onClick={addByUsername}>
                  {addingUser ? "…" : "Add"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground">Invite by email</p>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="member@email.com" 
                  className="flex-1 block h-[44px] rounded-full border border-input bg-background px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50" 
                />
                <Button className="h-[44px] rounded-full px-6" disabled={sending || !email.trim()} onClick={sendInvite}>
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
  onRefreshList: (options?: { silent?: boolean }) => Promise<void>;
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwner = userRole === "owner";

  const deleteLedger = async () => {
    if (!ledger) return;
    setDeletingLedger(true);
    try {
      const { error: fnError } = await supabase.functions.invoke('send-ledger-export', {
        body: { ledgerId: ledger.id }
      });
      if (fnError) {
        console.warn('CSV Export email failed:', fnError);
      }

      const { data, error } = await supabase.rpc('delete_ledger' as any, { p_ledger_id: ledger.id });
      if (error || (data as any)?.error) throw error || new Error((data as any)?.error);

      toast({ title: "Ledger deleted and export emailed" });
      onOpenChange(false);
      onBack();
      await onRefreshList();
    } catch (error: any) {
      console.error(error);
      toast({ title: "Failed to delete ledger", variant: "destructive" });
    } finally {
      setDeletingLedger(false);
      setConfirmDelete(false);
    }
  };

  const makeBudgetAdmin = async (userId: string) => {
    try {
      const { error } = (await supabase
        .from("ledgers" as never)
        .update({ budget_admin_id: userId } as never)
        .eq("id" as never, ledger.id as never)) as unknown as { error: Error | null };
      if (error) throw error;
      toast({ title: "Budget admin updated" });
      await onRefreshList({ silent: true });
    } catch (e) {
      toast({ title: "Failed to update budget admin", variant: "destructive" });
    }
  };

  const makeOwner = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('transfer_ledger_ownership' as any, { 
        p_ledger_id: ledger.id, 
        p_new_owner_id: userId 
      });
      if (error || (data as any)?.error) throw error || new Error((data as any)?.error);
      toast({ title: "Ownership transferred successfully" });
      await onRefreshList({ silent: true });
    } catch (e) {
      toast({ title: "Failed to transfer ownership", variant: "destructive" });
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
      await onRefreshList({ silent: true });
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
                {ledger.ledger_members.map((m) => {
                  const isBudgetAdmin = ledger.budget_admin_id === m.user_id;
                  const currentUserIsBudgetAdmin = ledger.budget_admin_id === currentUserId;
                  const canManage = isOwner || currentUserIsBudgetAdmin;
                  
                  return (
                    <div key={m.user_id} className="flex items-center justify-between gap-3 rounded-2xl bg-elevated p-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-card text-sm font-black text-primary">
                          {displayName(m.profiles).charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground">{displayName(m.profiles)}</p>
                          </div>
                          <p className="text-xs capitalize text-muted-foreground">
                            {m.role}{isBudgetAdmin ? ", budget admin" : ""}
                          </p>
                        </div>
                      </div>
                      
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8 rounded-full">
                              <MoreHorizontal className="size-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-2xl">
                            {!isBudgetAdmin && (isOwner || currentUserIsBudgetAdmin) && (
                              <DropdownMenuItem 
                                onClick={() => makeBudgetAdmin(m.user_id)}
                                className="font-semibold py-2"
                              >
                                Make Budget Admin
                              </DropdownMenuItem>
                            )}
                            {isOwner && m.user_id !== currentUserId && (
                              <DropdownMenuItem 
                                onClick={() => makeOwner(m.user_id)}
                                className="font-semibold py-2"
                              >
                                Make Owner
                              </DropdownMenuItem>
                            )}
                            {isOwner && m.user_id !== currentUserId && (
                              <DropdownMenuItem
                                className="text-destructive font-semibold py-2 focus:bg-destructive/10 focus:text-destructive"
                                disabled={deletingExpenseId === m.user_id}
                                onClick={() => removeMember(m.user_id, displayName(m.profiles))}
                              >
                                Remove Member
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Danger zone */}
            <div className="mt-4 space-y-3">
              <p className="px-1 text-xs font-bold uppercase tracking-wide text-destructive/70">
                Danger Zone
              </p>
              {isOwner ? (
                confirmDelete ? (
                  <div className="overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/5">
                    <div className="p-4 text-center">
                      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/10">
                        <Trash2 className="size-5 text-destructive" />
                      </div>
                      <h4 className="mb-1 text-sm font-bold text-destructive">Delete Ledger?</h4>
                      <p className="text-xs font-medium leading-relaxed text-destructive/80">
                        A CSV export will be emailed to all members, and all data will be permanently deleted. This cannot be undone.
                      </p>
                    </div>
                    <div className="flex border-t border-destructive/10">
                      <button
                        className="flex-1 p-3 text-xs font-bold text-foreground/70 transition-colors hover:bg-foreground/5 active:bg-foreground/10"
                        onClick={() => setConfirmDelete(false)}
                        disabled={deletingLedger}
                      >
                        Cancel
                      </button>
                      <div className="w-[1px] bg-destructive/10" />
                      <button
                        className="flex-1 p-3 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/20 disabled:opacity-50"
                        onClick={deleteLedger}
                        disabled={deletingLedger}
                      >
                        {deletingLedger ? "Deleting..." : "Confirm Delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="h-12 w-full rounded-2xl border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive" 
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete Ledger
                  </Button>
                )
              ) : (
                <Button 
                  variant="outline" 
                  className="h-12 w-full rounded-2xl border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive" 
                  onClick={leaveledger} 
                  disabled={deletingLedger}
                >
                  <UserMinus className="mr-2 size-4" />
                  {deletingLedger ? "Leaving…" : "Leave Ledger"}
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

// ————————————————— Main LedgerDetail View ————————————————————————————————————

interface LedgerDetailProps {
  ledger: LedgerRow;
  currentUserId: string;
  onBack: () => void;
  onRefreshList: (options?: { silent?: boolean }) => Promise<void>;
}

type ExpenseFilter = "all" | "pending" | "approved" | "paid" | "rejected";

export const LedgerDetail = ({
  ledger,
  currentUserId,
  onBack,
  onRefreshList,
}: LedgerDetailProps) => {
  const { toast } = useToast();
  const { expenses, budgetAdditions, monthlyClosures, invites, activities, loading, refresh } =
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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const pendingCount = expenses.filter((e) => e.status === "pending").length;

  // Expense card click
  const handleExpenseClick = (expense: LedgerExpenseRow) => {
    setReviewExpense(expense);
  };

  const handleExpenseEditClick = (expense: LedgerExpenseRow) => {
    setEditExpense(expense);
  };

  const handleExpenseApproveClick = async (expense: LedgerExpenseRow) => {
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
        .eq("id" as never, expense.id as never);

      if (error) throw error;
      toast({ title: "Marked as paid" });
      await refresh();
    } catch (e) {
      toast({ title: "Failed to mark paid", variant: "destructive" });
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

  const applyDateFilter = (dateString: string | undefined | null, dFilter: string, customStart?: string, customEnd?: string) => {
    if (dFilter === "all") return true;
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    if (Number.isNaN(date.getTime())) return false;
    
    if (dFilter === "custom") {
      const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
      const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    }
    
    if (dFilter === "today") return date.toDateString() === now.toDateString();
    
    if (dFilter === "this_week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay()); 
      start.setHours(0, 0, 0, 0);
      return date >= start;
    }
    
    if (dFilter === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return date >= start && date <= end;
    }
    
    if (dFilter === "previous_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return date >= start && date <= end;
    }
    
    if (dFilter === "this_year") {
      const start = new Date(now.getFullYear(), 0, 1);
      return date >= start;
    }
    
    return true;
  };

  const visibleExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (categoryFilter !== "all" && (e.category || "Uncategorized") !== categoryFilter) return false;
      if (!applyDateFilter(e.created_at, dateFilter, dateStart, dateEnd)) return false;
      return true;
    });
  }, [expenses, filter, categoryFilter, dateFilter, dateStart, dateEnd]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    expenses.forEach(e => {
      if (e.category) cats.add(e.category);
      else cats.add("Uncategorized");
    });
    return Array.from(cats).sort();
  }, [expenses]);
  
  const activeFilterCount = (filter !== "all" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0) + (dateFilter !== "all" ? 1 : 0);
  const ActiveIcon = getLedgerIcon(ledger.icon);

  return (
    <div className="space-y-5 pt-0 pb-32">
      {/* ── Header ── */}
      <header className="flex items-center gap-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          className="grid size-9 shrink-0 place-items-center rounded-full text-primary hover:bg-primary/10 -ml-2"
        >
          <ArrowLeft className="size-5" />
        </button>
        
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ActiveIcon className="size-5" />
        </div>

        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate text-xl font-bold text-foreground">
            {ledger.name}
          </h1>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {ledger.ledger_type === "shared" ? `${ledger.ledger_members.length} MEMBERS` : "PERSONAL"}
            </p>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
              {ledger.budget_type === "monthly" ? "Monthly" : "One-Time"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="grid size-9 place-items-center rounded-full text-primary hover:bg-primary/10"
            aria-label="Ledger settings"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </header>



      {/* ── Budget Summary ── */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Budget Overview
            {isMonthly && monthLabel && (
              <span className="ml-2">
                · {monthLabel}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {isMonthly && monthlyClosures.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-primary transition-colors hover:text-primary/80"
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

      {/* ── Quick Actions ── */}
      <section className={`grid grid-cols-1 gap-3 min-[420px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
          <Button
            className="h-[52px] w-full rounded-2xl shadow-primary-action"
            onClick={() => setAddExpenseOpen(true)}
          >
            <Plus className="mr-1 size-4" />
            Add Expense
          </Button>
          <Button
            variant="outline"
            className="h-[52px] w-full rounded-2xl border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => setAddBudgetOpen(true)}
          >
            <Plus className="mr-1 size-4" />
            Add Budget
          </Button>
        </section>

      {ledger.ledger_type === "shared" && (
        <Button
          variant="quiet"
          className="relative h-11 w-full rounded-2xl text-primary hover:bg-primary/10"
          onClick={() => setInviteOpen(true)}
        >
          <UserPlus className="mr-2 size-4" />
          Invite Members
        </Button>
      )}

      {/* ── Activity Timeline ── */}
      {activities && activities.length > 0 && (
        <section className="pt-2">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Activity
          </h2>
          <div className="space-y-3">
            {activities.slice(0, 3).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} ledger={ledger} />
            ))}
          </div>
        </section>
      )}

      {/* ── Expense Timeline ── */}
      <section className="pt-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
            Expense History
            {pendingCount > 0 && isOwnerOrAdmin && (
              <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
                {pendingCount} pending
              </span>
            )}
          </h2>
          <FilterTrigger count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
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
            {filter === "all" && (
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
                  isBudgetAdmin={ledger.budget_admin_id === currentUserId}
                  onClick={handleExpenseClick}
                  onEdit={handleExpenseEditClick}
                  onApprove={handleExpenseApproveClick}
                />
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
        members={ledger.ledger_members}
      />

      <AddExpenseDrawer
        open={Boolean(editExpense)}
        onOpenChange={(o) => !o && setEditExpense(null)}
        ledger={ledger}
        currentUserId={currentUserId}
        onSuccess={async () => { setEditExpense(null); await refresh(); }}
        editExpense={editExpense}
        members={ledger.ledger_members}
      />

      <ViewExpenseDrawer
        open={Boolean(reviewExpense)}
        onOpenChange={(o) => !o && setReviewExpense(null)}
        expense={reviewExpense}
        ledgerId={ledger.id}
        currentUserId={currentUserId}
        budgetAdminId={ledger.budget_admin_id}
        onSuccess={async () => { setReviewExpense(null); await refresh(); }}
        onDelete={async (e) => { setReviewExpense(null); await handleDeleteExpense(e); }}
        onEdit={(e) => { setReviewExpense(null); setEditExpense(e); }}
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
        ledgerName={ledger.name}
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

      <FilterSheet 
        open={filtersOpen} 
        onOpenChange={setFiltersOpen} 
        title="Expense filters" 
        onClear={() => {
          setFilter("all");
          setCategoryFilter("all");
          setDateFilter("all");
          setDateStart("");
          setDateEnd("");
        }}
      >
        <FilterField 
          label="Status" 
          value={filter} 
          onChange={(value) => setFilter(value as ExpenseFilter)} 
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "paid", label: "Paid" },
          ]} 
        />

        {availableCategories.length > 0 && (
          <FilterField 
            label="Category" 
            value={categoryFilter} 
            onChange={setCategoryFilter} 
            options={[
              { value: "all", label: "All categories" },
              ...availableCategories.map(c => ({ value: c, label: c }))
            ]} 
          />
        )}
        
        <DateFilterControls 
          value={dateFilter} 
          start={dateStart} 
          end={dateEnd} 
          onDateChange={setDateFilter} 
          onStartChange={setDateStart} 
          onEndChange={setDateEnd} 
        />
      </FilterSheet>

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