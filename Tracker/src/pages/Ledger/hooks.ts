// ============================================================
// Budget Ledger – Data Fetching Hooks
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  LedgerExpenseRow,
  LedgerBudgetAddition,
  LedgerMonthlyBudget,
  LedgerInvite,
} from "./types";

interface UseLedgerDetailResult {
  expenses: LedgerExpenseRow[];
  budgetAdditions: LedgerBudgetAddition[];
  monthlyBudgets: LedgerMonthlyBudget[];
  invites: LedgerInvite[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useLedgerDetail(
  ledgerId: string | null
): UseLedgerDetailResult {
  const [expenses, setExpenses] = useState<LedgerExpenseRow[]>([]);
  const [budgetAdditions, setBudgetAdditions] = useState<LedgerBudgetAddition[]>([]);
  const [monthlyBudgets, setMonthlyBudgets] = useState<LedgerMonthlyBudget[]>([]);
  const [invites, setInvites] = useState<LedgerInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!ledgerId) return;
    setLoading(true);
    try {
      const [expensesRes, additionsRes, monthlyRes, invitesRes] =
        await Promise.all([
          supabase
            .from("ledger_expenses" as never)
            .select(
              "id, ledger_id, user_id, title, amount, category, notes, proof_path, proof_uploaded_at, status, reviewed_by, reviewed_at, paid_at, month, year, created_at, updated_at, profiles!ledger_expenses_user_id_fkey(user_id, full_name, username)"
            )
            .eq("ledger_id", ledgerId)
            .order("created_at", { ascending: false }),

          supabase
            .from("ledger_budget_additions" as never)
            .select("id, ledger_id, amount, note, added_by, month, year, created_at")
            .eq("ledger_id", ledgerId)
            .order("created_at", { ascending: true }),

          supabase
            .from("ledger_monthly_budgets" as never)
            .select("id, ledger_id, month, year, budget_amount, paid_amount, saved_amount, rolled_over_at, created_at")
            .eq("ledger_id", ledgerId)
            .order("year", { ascending: false })
            .order("month", { ascending: false }),

          supabase
            .from("ledger_invites" as never)
            .select("id, ledger_id, email, token, status, invite_type, invited_by, created_at, expires_at")
            .eq("ledger_id", ledgerId)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
        ]);

      if (!expensesRes.error)
        setExpenses((expensesRes.data || []) as unknown as LedgerExpenseRow[]);
      if (!additionsRes.error)
        setBudgetAdditions((additionsRes.data || []) as unknown as LedgerBudgetAddition[]);
      if (!monthlyRes.error)
        setMonthlyBudgets((monthlyRes.data || []) as unknown as LedgerMonthlyBudget[]);
      if (!invitesRes.error)
        setInvites((invitesRes.data || []) as unknown as LedgerInvite[]);
    } catch (error) {
      console.error("Ledger detail fetch failed", error);
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Debounced realtime refresh
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh();
    }, 350);
  }, [refresh]);

  useEffect(() => {
    if (!ledgerId) return;
    const channel = supabase
      .channel(`ledger-detail-${ledgerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_expenses", filter: `ledger_id=eq.${ledgerId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_budget_additions", filter: `ledger_id=eq.${ledgerId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_invites", filter: `ledger_id=eq.${ledgerId}` }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [ledgerId, scheduleRefresh]);

  return { expenses, budgetAdditions, monthlyBudgets, invites, loading, refresh };
}

/** Upload a receipt image to ledger-receipts bucket */
export async function uploadLedgerReceipt(
  userId: string,
  ledgerId: string,
  expenseId: string,
  blob: Blob
): Promise<string> {
  const path = `${userId}/${ledgerId}/${expenseId}/${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from("ledger-receipts")
    .upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(error.message || "Could not upload receipt.");
  return path;
}

/** Get a short-lived signed URL for viewing a receipt */
export async function getLedgerReceiptUrl(
  proofPath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("ledger-receipts")
    .createSignedUrl(proofPath, 300); // 5 min
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Log an activity event */
export async function logLedgerActivity(
  ledgerId: string,
  actorId: string,
  action: string,
  opts?: {
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase
    .from("ledger_activity" as never)
    .insert({
      ledger_id: ledgerId,
      actor_id: actorId,
      action,
      entity_type: opts?.entityType ?? null,
      entity_id: opts?.entityId ?? null,
      metadata: opts?.metadata ?? null,
    } as never)
    .then(({ error }) => {
      if (error) console.warn("Activity log failed", error);
    });
}
