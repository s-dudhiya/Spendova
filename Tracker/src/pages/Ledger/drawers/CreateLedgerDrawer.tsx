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
import { Field, Textarea, SelectField } from "../components/Fields";
import { logLedgerActivity } from "../hooks";

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
  const [inviteUsername, setInviteUsername] = useState("");
  const [addingUsername, setAddingUsername] = useState(false);

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
    setInviteUsername("");
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
      const { data: profile } = await supabase.from('profiles').select('full_name, username').eq('id', currentUserId).maybeSingle();
      const inviterName = profile?.full_name || profile?.username || "A Spendova user";

      const { data, error } = await supabase.functions.invoke('send-ledger-invite', {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          ledger_id: createdLedgerId,
          ledger_name: name,
          inviter_name: inviterName,
        }
      });
      if (error || data?.error) throw error || new Error(data?.error);

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

  const addByUsername = async () => {
    if (!createdLedgerId || !inviteUsername.trim() || addingUsername) return;
    setAddingUsername(true);
    try {
      const cleanUsername = inviteUsername.trim().replace(/^@/, "").toLowerCase();
      
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
        .eq("ledger_id", createdLedgerId)
        .eq("user_id", foundUser.user_id)
        .maybeSingle();
      
      if (existing) {
        toast({ title: "User is already in ledger", variant: "destructive" });
        return;
      }
      
      const { error } = await supabase
        .from("ledger_members" as never)
        .insert({ ledger_id: createdLedgerId, user_id: foundUser.user_id, role: "member" } as never);
      
      if (error) throw error;
      
      toast({ title: "User added successfully", description: `${foundUser.full_name || foundUser.username} was added to the ledger.` });
      setInviteUsername("");
    } catch (e: any) {
      toast({ title: "Failed to add user", description: e.message || "Network error.", variant: "destructive" });
    } finally {
      setAddingUsername(false);
    }
  };

  const handleDone = async () => {
    handleOpenChange(false);
    await onSuccess();
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto grid h-[88dvh] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-0">
        <DrawerHeader className="px-0 pb-3 pt-4 text-left">
          <DrawerTitle>
            {step === "form" ? "Create Ledger" : "Invite Members"}
          </DrawerTitle>
          <DrawerDescription>
            {step === "form"
              ? "Set up your budget ledger."
              : "Add members to your shared ledger."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          {step === "form" ? (
            <div className="space-y-5 pb-3">
              <Field
                id="cl-name"
                label="Ledger Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Family Budget, Office Petty Cash"
                maxLength={100}
              />

              <Textarea
                id="cl-desc"
                label="Description (optional)"
                hint="What is this ledger for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this ledger for?"
                rows={2}
                maxLength={500}
              />

              <SelectField
                label="Ledger Type *"
                value={ledgerType}
                onChange={(v) => setLedgerType(v as LedgerType)}
                options={[
                  {
                    value: "personal",
                    label: "Personal (Only you manage this budget)",
                  },
                  {
                    value: "shared",
                    label: "Shared (Invite members to submit expenses)",
                  },
                ]}
              />

              <SelectField
                label="Budget Type *"
                value={budgetType}
                onChange={(v) => setBudgetType(v as BudgetType)}
                options={[
                  {
                    value: "one_time",
                    label: "One-Time (Fixed budget)",
                  },
                  {
                    value: "monthly",
                    label: "Monthly (Resets every month)",
                  },
                ]}
              />

              {/* Initial Budget */}
              <Field
                id="cl-budget"
                type="number"
                inputMode="decimal"
                min="1"
                step="1"
                label={budgetType === "monthly" ? "Budget for this Month (₹) *" : "Total Budget (₹) *"}
                value={initialBudget}
                onChange={(e) => setInitialBudget(e.target.value)}
                placeholder="e.g. 20000"
              />
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

              {/* Add by Username */}
              <div className="space-y-2">
                <p className="text-sm font-bold text-foreground">Add by Username</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={inviteUsername} 
                    onChange={(e) => setInviteUsername(e.target.value)} 
                    placeholder="@username" 
                    className="flex-1 block h-[44px] rounded-full border border-input bg-background px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50" 
                  />
                  <Button className="h-[44px] rounded-full px-6" disabled={addingUsername || !inviteUsername.trim()} onClick={addByUsername}>
                    {addingUsername ? "…" : "Add"}
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
                    className="flex-1 block h-[44px] rounded-full border border-input bg-background px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50" 
                  />
                  <Button className="h-[44px] rounded-full px-6" disabled={sendingInvite || !inviteEmail.trim()} onClick={sendEmailInvite}>
                    {sendingInvite ? "…" : "Send"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-[1fr_min-content] items-end gap-3 border-t border-border/60 bg-card py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {step === "form" ? (
            <div className="col-span-2 flex gap-2">
              <Button
                variant="quiet"
                className="flex-1 h-12 rounded-full"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 rounded-full shadow-primary-action"
                onClick={handleCreate}
                disabled={submitting || !name.trim() || !initialBudget.trim()}
              >
                {submitting ? "Creating…" : "Create"}
              </Button>
            </div>
          ) : (
            <Button
              className="col-span-2 h-12 rounded-full shadow-primary-action"
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
