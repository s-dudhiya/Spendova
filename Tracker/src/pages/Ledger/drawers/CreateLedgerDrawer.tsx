// ============================================================
// Budget Ledger – Create Ledger Drawer
// ============================================================

import { useState } from "react";
import { Plus, Link as LinkIcon, Copy, Check } from "lucide-react";
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
import type { LedgerType, BudgetType } from "../types";
import { logLedgerActivity } from "../hooks";

// ── Primitives ───────────────────────────────────────────────

const inputCls =
  "w-full rounded-2xl border border-input bg-elevated px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

interface RadioGroupProps<T extends string> {
  id: string;
  options: Array<{ value: T; label: string; description: string }>;
  value: T;
  onChange: (v: T) => void;
}

const RadioGroup = <T extends string>({
  id,
  options,
  value,
  onChange,
}: RadioGroupProps<T>) => (
  <div className="space-y-2" id={id}>
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
          value === opt.value
            ? "border-primary bg-primary/10"
            : "border-border bg-elevated"
        }`}
      >
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
            value === opt.value
              ? "border-primary bg-primary"
              : "border-muted-foreground/40 bg-transparent"
          }`}
        >
          {value === opt.value && (
            <span className="size-2 rounded-full bg-primary-foreground" />
          )}
        </span>
        <span>
          <span className="block text-sm font-bold text-foreground">
            {opt.label}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {opt.description}
          </span>
        </span>
      </button>
    ))}
  </div>
);

// ── Main component ───────────────────────────────────────────

interface CreateLedgerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  onSuccess: () => Promise<void>;
}

type Step = "form" | "invite";

export const CreateLedgerDrawer = ({
  open,
  onOpenChange,
  currentUserId,
  onSuccess,
}: CreateLedgerDrawerProps) => {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ledgerType, setLedgerType] = useState<LedgerType>("personal");
  const [budgetType, setBudgetType] = useState<BudgetType>("one_time");
  const [initialBudget, setInitialBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Created ledger state (used in invite step)
  const [createdLedgerId, setCreatedLedgerId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const reset = () => {
    setStep("form");
    setName("");
    setDescription("");
    setLedgerType("personal");
    setBudgetType("one_time");
    setInitialBudget("");
    setSubmitting(false);
    setCreatedLedgerId(null);
    setShareLink(null);
    setCopied(false);
    setInviteEmail("");
    setGeneratingLink(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const parsedBudget = parseFloat(initialBudget);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Ledger name is required", variant: "destructive" });
      return;
    }
    if (!parsedBudget || parsedBudget <= 0) {
      toast({ title: "Enter a valid budget amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const now = new Date();
    const currentMonth = budgetType === "monthly" ? now.getMonth() + 1 : null;
    const currentYear = budgetType === "monthly" ? now.getFullYear() : null;

    try {
      // 1. Create ledger
      const { data: ledgerData, error: ledgerError } = await (supabase
        .from("ledgers" as never)
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          ledger_type: ledgerType,
          budget_type: budgetType,
          owner_id: currentUserId,
          total_savings: 0,
        } as never)
        .select("id")
        .single() as unknown as { data: { id: string } | null; error: Error | null });

      if (ledgerError) throw ledgerError;
      if (!ledgerData) throw new Error("Failed to create ledger.");

      const ledgerId = ledgerData.id;
      setCreatedLedgerId(ledgerId);

      // 2. Add owner to ledger_members
      const { error: mErr } = (await supabase
        .from("ledger_members" as never)
        .insert({ ledger_id: ledgerId, user_id: currentUserId, role: "owner" } as never)) as unknown as { error: Error | null };
      if (mErr) throw mErr;

      // 3. Add initial budget
      const { error: bErr } = (await supabase
        .from("ledger_budget_additions" as never)
        .insert({
          ledger_id: ledgerId,
          amount: parsedBudget,
          note: "Initial budget",
          added_by: currentUserId,
          month: currentMonth,
          year: currentYear,
        } as never)) as unknown as { error: Error | null };
      if (bErr) throw bErr;

      // 4. Log activity
      await logLedgerActivity(ledgerId, currentUserId, "ledger_created", {
        entityType: "ledger",
        entityId: ledgerId,
      });

      toast({ title: "Ledger created!", description: `"${name.trim()}" is ready.` });

      if (ledgerType === "shared") {
        setStep("invite");
      } else {
        handleOpenChange(false);
        await onSuccess();
      }
    } catch (error) {
      toast({
        title: "Failed to create ledger",
        description:
          error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const generateShareLink = async () => {
    if (!createdLedgerId || generatingLink) return;
    setGeneratingLink(true);
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h
      const { data, error } = await (supabase
        .from("ledger_invites" as never)
        .insert({
          ledger_id: createdLedgerId,
          invite_type: "link",
          invited_by: currentUserId,
          expires_at: expiresAt,
        } as never)
        .select("token")
        .single() as unknown as { data: { token: string } | null; error: Error | null });

      if (error) throw error;
      if (!data) throw new Error("Failed to generate invite link.");

      const link = `${window.location.origin}/invite-ledger?token=${data.token}`;
      setShareLink(link);
    } catch (error) {
      toast({
        title: "Failed to generate link",
        description:
          error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyShareLink = () => {
    if (!shareLink) return;
    navigator.clipboard
      .writeText(shareLink)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() =>
        toast({ title: "Could not copy link", variant: "destructive" })
      );
  };

  const sendEmailInvite = async () => {
    if (!createdLedgerId || !inviteEmail.trim() || sendingInvite) return;
    setSendingInvite(true);
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = (await supabase
        .from("ledger_invites" as never)
        .insert({
          ledger_id: createdLedgerId,
          email: inviteEmail.trim().toLowerCase(),
          invite_type: "email",
          invited_by: currentUserId,
          expires_at: expiresAt,
        } as never)) as unknown as { error: Error | null };

      if (error) throw error;
      toast({ title: "Invite sent!", description: `Invited ${inviteEmail.trim()}` });
      setInviteEmail("");
    } catch (error) {
      toast({
        title: "Failed to send invite",
        description:
          error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleDone = async () => {
    handleOpenChange(false);
    await onSuccess();
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto flex max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.75rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <DrawerHeader className="shrink-0 px-0 pb-2 text-left">
          <DrawerTitle>
            {step === "form" ? "Create Ledger" : "Invite Members"}
          </DrawerTitle>
          <DrawerDescription>
            {step === "form"
              ? "Set up your budget ledger."
              : "Add members to your shared ledger."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {step === "form" ? (
            <div className="space-y-5 pb-3">
              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="cl-name" className="text-sm font-bold text-foreground">
                  Ledger Name *
                </label>
                <input
                  id="cl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Family Budget, Office Petty Cash"
                  className={inputCls}
                  maxLength={100}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label htmlFor="cl-desc" className="text-sm font-bold text-foreground">
                  Description <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="cl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this ledger for?"
                  rows={2}
                  className={`${inputCls} resize-none`}
                  maxLength={500}
                />
              </div>

              {/* Ledger Type */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-foreground">Ledger Type *</p>
                <RadioGroup<LedgerType>
                  id="cl-type"
                  value={ledgerType}
                  onChange={setLedgerType}
                  options={[
                    {
                      value: "personal",
                      label: "Personal",
                      description: "Only you manage this budget.",
                    },
                    {
                      value: "shared",
                      label: "Shared",
                      description:
                        "Invite members to submit expenses against this budget.",
                    },
                  ]}
                />
              </div>

              {/* Budget Type */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-foreground">Budget Type *</p>
                <RadioGroup<BudgetType>
                  id="cl-budget-type"
                  value={budgetType}
                  onChange={setBudgetType}
                  options={[
                    {
                      value: "one_time",
                      label: "One-Time",
                      description:
                        "A fixed budget with no monthly reset. Good for events and trips.",
                    },
                    {
                      value: "monthly",
                      label: "Monthly",
                      description:
                        "Budget resets every month. Remaining amount rolls over to savings.",
                    },
                  ]}
                />
              </div>

              {/* Initial Budget */}
              <div className="space-y-1.5">
                <label htmlFor="cl-budget" className="text-sm font-bold text-foreground">
                  {budgetType === "monthly" ? "Budget for this Month (₹) *" : "Total Budget (₹) *"}
                </label>
                <input
                  id="cl-budget"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={initialBudget}
                  onChange={(e) => setInitialBudget(e.target.value)}
                  placeholder="e.g. 20000"
                  className={inputCls}
                />
              </div>
            </div>
          ) : (
            // Invite step
            <div className="space-y-4 pb-3">
              <p className="rounded-2xl bg-elevated p-4 text-sm text-muted-foreground">
                Your ledger is ready. You can invite members now or do it later from the ledger settings.
              </p>

              {/* Share link */}
              <div className="rounded-2xl border border-border bg-elevated p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">Share invite link</p>
                    {shareLink ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {shareLink}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Generate a link that expires in 24 hours.
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={generatingLink}
                    onClick={shareLink ? copyShareLink : generateShareLink}
                  >
                    {copied ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {generatingLink
                      ? "Generating…"
                      : shareLink
                      ? copied
                        ? "Copied!"
                        : "Copy"
                      : "Generate"}
                  </Button>
                </div>
              </div>

              {/* Email invite */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-foreground">Invite by email</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="member@email.com"
                    className={`${inputCls} flex-1`}
                  />
                  <Button
                    disabled={sendingInvite || !inviteEmail.trim()}
                    onClick={sendEmailInvite}
                  >
                    {sendingInvite ? "Sending…" : "Invite"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-2 border-t border-border/60 bg-card pt-3">
          {step === "form" ? (
            <>
              <Button
                variant="quiet"
                className="flex-1"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 shadow-primary-action"
                onClick={handleCreate}
                disabled={
                  submitting || !name.trim() || !parsedBudget || parsedBudget <= 0
                }
              >
                {submitting ? "Creating…" : "Create Ledger"}
              </Button>
            </>
          ) : (
            <Button
              className="flex-1 shadow-primary-action"
              onClick={handleDone}
            >
              Done
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
