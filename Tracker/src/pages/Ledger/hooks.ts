// ============================================================
// Budget Ledger – Data Fetching & Mutations Hooks
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  LedgerRow,
  LedgerExpenseRow,
  LedgerBudgetAddition,
  LedgerMonthlyClosure,
  LedgerInvite,
} from "./types";
import { compressReceiptImage } from "./utils";

interface UseLedgerDetailResult {
  expenses: LedgerExpenseRow[];
  budgetAdditions: LedgerBudgetAddition[];
  monthlyClosures: LedgerMonthlyClosure[];
  invites: LedgerInvite[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useLedgerDetail(
  ledgerId: string | null
): UseLedgerDetailResult {
  const [expenses, setExpenses] = useState<LedgerExpenseRow[]>([]);
  const [budgetAdditions, setBudgetAdditions] = useState<LedgerBudgetAddition[]>([]);
  const [monthlyClosures, setMonthlyClosures] = useState<LedgerMonthlyClosure[]>([]);
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
              "id, ledger_id, user_id, title, amount, category, category_id, linked_expense_id, notes, proof_path, proof_uploaded_at, status, reviewed_by, reviewed_at, paid_at, month, year, created_at, updated_at, profiles!ledger_expenses_user_id_fkey(user_id, full_name, username)"
            )
            .eq("ledger_id", ledgerId)
            .order("created_at", { ascending: false }),

          supabase
            .from("ledger_budget_additions" as never)
            .select("id, ledger_id, amount, note, added_by, month, year, is_savings_rollover, created_at")
            .eq("ledger_id", ledgerId)
            .order("created_at", { ascending: true }),

          supabase
            .from("ledger_monthly_closures" as never)
            .select("id, ledger_id, month, year, saved_amount, deficit, rolled_over_at, created_at")
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
        setMonthlyClosures((monthlyRes.data || []) as unknown as LedgerMonthlyClosure[]);
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

  return { expenses, budgetAdditions, monthlyClosures, invites, loading, refresh };
}

/** Hook for Ledger Expense Mutations with syncing */
export function useLedgerExpenseMutation(ledger: LedgerRow, currentUserId: string) {
  const saveExpense = async (
    payload: {
      id?: string;
      title: string;
      amount: number;
      category: string | null;
      category_id: string | null;
      notes: string | null;
      month: number | null;
      year: number | null;
      linked_expense_id?: string | null;
    },
    proofFile?: File | null
  ) => {
    let finalLinkedExpenseId = payload.linked_expense_id ?? null;

    if (ledger.ledger_type === "personal") {
      // Sync to core expenses table
      const expenseData = {
        user_id: currentUserId,
        paid_by: currentUserId,
        category: payload.title,
        category_id: payload.category_id || null,
        amount: payload.amount,
        note: payload.notes || null,
        status: "cleared",
        split_type: "none",
        group_id: null,
      };

      if (payload.id && finalLinkedExpenseId) {
        // Update existing core expense
        await supabase
          .from("expenses" as never)
          .update(expenseData as never)
          .eq("id", finalLinkedExpenseId);
      } else {
        // Create new core expense
        const { data, error } = await supabase
          .from("expenses" as never)
          .insert(expenseData as never)
          .select("id")
          .single();
        if (error) throw error;
        finalLinkedExpenseId = (data as { id: string }).id;
      }
    }

    let expenseId = payload.id;

    if (payload.id) {
      // Update ledger expense
      const { error } = await supabase
        .from("ledger_expenses" as never)
        .update({
          title: payload.title,
          amount: payload.amount,
          category: payload.category,
          category_id: payload.category_id,
          notes: payload.notes,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", payload.id);
      if (error) throw error;
    } else {
      // Insert new ledger expense
      const { data, error } = await supabase
        .from("ledger_expenses" as never)
        .insert({
          ledger_id: ledger.id,
          user_id: currentUserId,
          title: payload.title,
          amount: payload.amount,
          category: payload.category,
          category_id: payload.category_id,
          linked_expense_id: finalLinkedExpenseId,
          notes: payload.notes,
          status: "pending",
          month: payload.month,
          year: payload.year,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      expenseId = (data as { id: string }).id;

      await logLedgerActivity(ledger.id, currentUserId, "expense_submitted", {
        entityType: "expense",
        entityId: expenseId,
        metadata: { title: payload.title, amount: payload.amount },
      });
    }

    if (proofFile && expenseId) {
      const blob = await compressReceiptImage(proofFile);
      const path = await uploadLedgerReceipt(currentUserId, ledger.id, expenseId, blob);
      await supabase
        .from("ledger_expenses" as never)
        .update({ proof_path: path, proof_uploaded_at: new Date().toISOString() } as never)
        .eq("id", expenseId);
    }
  };

  const deleteExpense = async (expense: LedgerExpenseRow) => {
    // Delete from ledger
    const { error } = await supabase
      .from("ledger_expenses" as never)
      .delete()
      .eq("id", expense.id);
    if (error) throw error;

    // Delete linked personal expense if it exists
    if (expense.linked_expense_id && ledger.ledger_type === "personal") {
      await supabase
        .from("expenses" as never)
        .delete()
        .eq("id", expense.linked_expense_id);
    }

    await logLedgerActivity(ledger.id, currentUserId, "expense_deleted", {
      entityType: "expense",
      entityId: expense.id,
      metadata: { title: expense.title, amount: expense.amount },
    });
  };

  const closeMonth = async (
    month: number,
    year: number,
    savedAmount: number,
    deficit: number,
    useSavingsForNextMonth: boolean
  ) => {
    const { error } = await supabase.rpc("perform_ledger_monthly_rollover" as never, {
      p_ledger_id: ledger.id,
      p_from_month: month,
      p_from_year: year,
      p_saved_amount: savedAmount,
      p_deficit: deficit,
    } as never);
    if (error) throw error;

    if (useSavingsForNextMonth && savedAmount > 0) {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const { error: additionError } = await supabase
        .from("ledger_budget_additions" as never)
        .insert({
          ledger_id: ledger.id,
          amount: savedAmount,
          note: "Rolled over savings",
          added_by: currentUserId,
          month: nextMonth,
          year: nextYear,
          is_savings_rollover: true,
        } as never);
      if (additionError) throw additionError;
    }
  };

  return { saveExpense, deleteExpense, closeMonth };
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
