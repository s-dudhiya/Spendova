// ============================================================
// Budget Ledger – TypeScript types
// ============================================================

export type LedgerType = "personal" | "shared";
export type BudgetType = "monthly" | "one_time";
export type LedgerRole = "owner" | "admin" | "member";
export type ExpenseStatus = "pending" | "approved" | "paid" | "rejected";
export type InviteType = "email" | "link";

export interface LedgerMemberProfile {
  user_id: string;
  full_name: string | null;
  username: string | null;
}

export interface LedgerMemberRow {
  id: string;
  ledger_id: string;
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
}

export interface LedgerMonthlyBudget {
  id: string;
  ledger_id: string;
  month: number;
  year: number;
  budget_amount: number;
  paid_amount: number;
  saved_amount: number;
  rolled_over_at: string | null;
  created_at: string;
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
  approvedExpenses: number;
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
  approved: {
    label: "Approved",
    className: "bg-primary/15 text-primary",
  },
  paid: {
    label: "Paid",
    className: "bg-success/15 text-success",
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/15 text-destructive",
  },
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
