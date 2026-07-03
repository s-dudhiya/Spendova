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
  LedgerActivityRow,
  LedgerBudgetSummary,
} from "./types";
import { compressReceiptImage, computeBudgetSummary } from "./utils";

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
      date: string | null;
      linked_expense_id?: string | null;
    },
    proofFile?: File | null
  ) => {
    const action = payload.id ? "update" : "insert";

    const { data, error } = await (supabase.rpc("sync_ledger_expense" as never, {
      p_action: action,
      p_ledger_id: ledger.id,
      p_user_id: currentUserId,
      p_expense_id: payload.id || null,
      p_title: payload.title,
      p_amount: payload.amount,
      p_category: payload.category || null,
      p_category_id: payload.category_id || null,
      p_notes: payload.notes || null,
      p_status: "pending",
      p_month: payload.month || null,
      p_year: payload.year || null,
      p_created_at: payload.date || null,
    } as never) as unknown as { data: { error?: string; expense_id?: string } | null; error: Error | null });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || "Failed to save expense");
    }

    const expenseId = data?.expense_id;

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
      const { data, error } = await (supabase.rpc("sync_ledger_expense" as never, {
        p_action: "delete",
        p_ledger_id: ledger.id,
        p_user_id: currentUserId,
        p_expense_id: expense.id,
        p_title: null,
        p_amount: null,
        p_category: null,
        p_category_id: null,
        p_notes: null,
        p_status: null,
        p_month: null,
        p_year: null,
        p_created_at: null,
      } as never) as unknown as { data: { error?: string } | null; error: Error | null });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || "Failed to delete expense");
    }
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

// ── Dashboard Hook ────────────────────────────────────────────────────────

export interface DashboardLedgerSummary extends LedgerBudgetSummary {
  ledgerId: string;
}

export interface UseLedgersDashboardResult {
  globalSummary: LedgerBudgetSummary;
  ledgerSummaries: Record<string, DashboardLedgerSummary>;
  recentActivity: LedgerActivityRow[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useLedgersDashboard(ledgers: LedgerRow[]): UseLedgersDashboardResult {
  const [globalSummary, setGlobalSummary] = useState<LedgerBudgetSummary>({
    totalBudget: 0,
    paidExpenses: 0,
    pendingExpenses: 0,
    approvedExpenses: 0,
    availableBudget: 0,
    expectedAvailable: 0,
    totalSavings: 0,
  });
  const [ledgerSummaries, setLedgerSummaries] = useState<Record<string, DashboardLedgerSummary>>({});
  const [recentActivity, setRecentActivity] = useState<LedgerActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (ledgers.length === 0) {
      setGlobalSummary({
        totalBudget: 0,
        paidExpenses: 0,
        pendingExpenses: 0,
        approvedExpenses: 0,
        availableBudget: 0,
        expectedAvailable: 0,
        totalSavings: 0,
      });
      setLedgerSummaries({});
      setRecentActivity([]);
      return;
    }

    setLoading(true);
    try {
      const ledgerIds = ledgers.map((l) => l.id);
      
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const [expensesRes, additionsRes, activityRes] = await Promise.all([
        supabase
          .from("ledger_expenses" as never)
          .select("ledger_id, amount, status, month, year")
          .in("ledger_id", ledgerIds),
        
        supabase
          .from("ledger_budget_additions" as never)
          .select("ledger_id, amount, month, year")
          .in("ledger_id", ledgerIds),

        supabase
          .from("ledger_activity" as never)
          .select("id, ledger_id, actor_id, action, entity_type, entity_id, metadata, created_at, profiles!ledger_activity_actor_id_fkey(full_name, username)")
          .in("ledger_id", ledgerIds)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (expensesRes.error) throw expensesRes.error;
      if (additionsRes.error) throw additionsRes.error;
      if (activityRes.error) throw activityRes.error;

      const newLedgerSummaries: Record<string, DashboardLedgerSummary> = {};
      const newGlobalSummary = {
        totalBudget: 0,
        paidExpenses: 0,
        pendingExpenses: 0,
        approvedExpenses: 0,
        availableBudget: 0,
        expectedAvailable: 0,
        totalSavings: 0,
      };

      ledgers.forEach((ledger) => {
        // Filter for this ledger
        // If monthly, only take current month/year. If one-time, take all.
        const isMonthly = ledger.budget_type === "monthly";
        
        const lExpenses = ((expensesRes.data || []) as LedgerExpenseRow[]).filter((e) => 
          e.ledger_id === ledger.id && 
          (!isMonthly || (e.month === currentMonth && e.year === currentYear))
        );

        const lAdditions = ((additionsRes.data || []) as LedgerBudgetAddition[]).filter((a) => 
          a.ledger_id === ledger.id && 
          (!isMonthly || (a.month === currentMonth && a.year === currentYear))
        );

        const summary = computeBudgetSummary(lAdditions, lExpenses, ledger.total_savings || 0);
        
        newLedgerSummaries[ledger.id] = { ...summary, ledgerId: ledger.id };
        
        newGlobalSummary.totalBudget += summary.totalBudget;
        newGlobalSummary.paidExpenses += summary.paidExpenses;
        newGlobalSummary.pendingExpenses += summary.pendingExpenses;
        newGlobalSummary.approvedExpenses += summary.approvedExpenses;
        newGlobalSummary.availableBudget += summary.availableBudget;
        newGlobalSummary.expectedAvailable += summary.expectedAvailable;
        newGlobalSummary.totalSavings += summary.totalSavings;
      });

      setLedgerSummaries(newLedgerSummaries);
      setGlobalSummary(newGlobalSummary);
      setRecentActivity((activityRes.data || []) as import("./types").LedgerActivityRow[]);
    } catch (error) {
      console.error("Dashboard fetch failed:", error);
    } finally {
      setLoading(false);
    }
  }, [ledgers]);

  useEffect(() => {
    refresh();
    
    if (refreshTimerRef.current !== null) {
      window.clearInterval(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setInterval(refresh, 60000);
    
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearInterval(refreshTimerRef.current);
      }
    };
  }, [refresh]);

  return { globalSummary, ledgerSummaries, recentActivity, loading, refresh };
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

/** Hook for managing isolated categories within a Shared Ledger */
export function useSharedLedgerCategories(ledgerId: string, currentUserId: string, onMutate?: () => void) {
  const [categories, setCategories] = useState<import("./types").LedgerCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    if (!ledgerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ledger_categories" as never)
        .select("*")
        .eq("ledger_id", ledgerId)
        .eq("is_deleted", false)
        .order("name", { ascending: true });
      if (error) throw error;
      setCategories((data || []) as unknown as import("./types").LedgerCategoryRow[]);
    } catch (error) {
      console.error("Failed to fetch ledger categories", error);
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  const createCategory = async (name: string) => {
    const payload = { 
      ledger_id: ledgerId, 
      name: name.trim(), 
      created_by: currentUserId 
    };
    const { data: created, error } = await supabase
      .from("ledger_categories" as never)
      .insert(payload as never)
      .select("*")
      .single();
    if (error) throw error;
    setCategories((prev) => [...prev, created as unknown as import("./types").LedgerCategoryRow]);
    if (onMutate) onMutate();
    return created as unknown as import("./types").LedgerCategoryRow;
  };

  const renameCategory = async (categoryId: string, name: string) => {
    const { error } = await supabase
      .from("ledger_categories" as never)
      .update({ name: name.trim(), updated_at: new Date().toISOString() } as never)
      .eq("id", categoryId)
      .eq("ledger_id", ledgerId); // safety
    if (error) throw error;
    setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, name: name.trim() } : c));
    if (onMutate) onMutate();
  };

  const deleteCategory = async (categoryId: string) => {
    const { error } = await supabase
      .from("ledger_categories" as never)
      .update({ is_deleted: true, updated_at: new Date().toISOString() } as never)
      .eq("id", categoryId)
      .eq("ledger_id", ledgerId); // safety
    if (error) throw error;
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    if (onMutate) onMutate();
  };

  return {
    categories,
    loading,
    fetchCategories,
    createCategory,
    renameCategory,
    deleteCategory,
    setCategories,
  };
}
