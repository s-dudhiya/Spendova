// ============================================================
// Budget Ledger – TypeScript types
// ============================================================

export type LedgerType = "personal" | "shared";
export type BudgetType = "monthly" | "one_time";
export type LedgerRole = "owner" | "admin" | "member";
export type ExpenseStatus = "pending" | "paid";
export type ExpenseFilter = "all" | "pending" | "paid";
export type InviteType = "email" | "link";

export interface LedgerMemberProfile {
  user_id: string;
  full_name: string | null;
  username: string | null;
}

export interface LedgerMemberRow {
  id: string;
  ledger_id?: string;
  user_id: string;
  role: LedgerRole;
  joined_at: string | null;
  profiles: LedgerMemberProfile;
}

export interface LedgerRow {
  id: string;
  name: string;
  description: string | null;
  ledger_type: LedgerType;
  budget_type: BudgetType;
  total_savings: number;
  owner_id: string;
  budget_admin_id?: string;
  icon?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string | null;
  ledger_members: LedgerMemberRow[];
}

export interface LedgerBudgetAddition {
  id: string;
  ledger_id: string;
  amount: number;
  note: string | null;
  added_by: string;
  month: number | null;
  year: number | null;
  is_savings_rollover: boolean;
  created_at: string;
}

export interface LedgerExpenseRow {
  id: string;
  ledger_id: string;
  user_id: string;
  title: string;
  amount: number;
  category: string | null;
  category_id: string | null;
  linked_expense_id: string | null;
  notes: string | null;
  proof_path: string | null;
  proof_uploaded_at: string | null;
  status: ExpenseStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  month: number | null;
  year: number | null;
  created_at: string;
  updated_at: string | null;
  profiles?: LedgerMemberProfile | null;
  reviewer?: LedgerMemberProfile | null;
}

export interface LedgerMonthlyClosure {
  id: string;
  ledger_id: string;
  month: number;
  year: number;
  saved_amount: number;
  deficit: number;
  rolled_over_at: string | null;
  created_at: string;
}

export interface LedgerCategoryRow {
  id: string;
  ledger_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface LedgerInvite {
  id: string;
  ledger_id: string;
  email: string | null;
  token: string;
  status: "pending" | "accepted" | "expired";
  invite_type: InviteType;
  invited_by: string;
  created_at: string;
  expires_at: string | null;
}

export interface LedgerContribution {
  id: string;
  ledger_id: string;
  user_id: string;
  month: number | null;
  year: number | null;
  expected_amount: number;
  created_at: string;
  updated_at: string | null;
}

export interface LedgerActivityRow {
  id: string;
  ledger_id: string;
  actor_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profiles?: LedgerMemberProfile | null;
}

/** Computed budget summary (no stored current_budget – all derived) */
export interface LedgerBudgetSummary {
  totalBudget: number;
  paidExpenses: number;
  pendingExpenses: number;
  availableBudget: number;
  expectedAvailable: number;
  totalSavings: number;
}

/** Status configuration for display */
export const EXPENSE_STATUS_CONFIG: Record<
  ExpenseStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-warning/15 text-warning",
  },
  paid: {
    label: "Paid",
    className: "bg-success/15 text-success",
  },
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
