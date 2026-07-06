// ============================================================
// Budget Ledger – Shared Utility Functions
// ============================================================

import type {
  LedgerBudgetAddition,
  LedgerExpenseRow,
  LedgerBudgetSummary,
  LedgerMemberProfile,
} from "./types";

// ── Formatting ──────────────────────────────────────────────

export const money = (amount: number): string => {
  const value = Number.isFinite(amount) ? amount : 0;
  const hasPaise = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(value);
};

export const dateLabel = (value?: string | null): string =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "Today";

export const timeAgo = (value?: string | null): string => {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return dateLabel(value);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return dateLabel(value);
};

export const displayName = (
  profile?: LedgerMemberProfile | null
): string =>
  profile?.full_name || profile?.username || "User";

export const getInitial = (name: string): string =>
  name.trim().charAt(0).toUpperCase() || "?";

// ── Budget Calculations (no stored current_budget – all derived) ──

/**
 * For one_time ledgers: use all additions and all expenses.
 * For monthly ledgers: filter by the active month/year before calling.
 */
export const computeBudgetSummary = (
  budgetAdditions: LedgerBudgetAddition[],
  expenses: LedgerExpenseRow[],
  totalSavings: number
): LedgerBudgetSummary => {
  const totalBudget = budgetAdditions.reduce(
    (sum, a) => sum + Number(a.amount || 0),
    0
  );
  const paidExpenses = expenses
    .filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const pendingExpenses = expenses
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const availableBudget = Math.max(totalBudget - paidExpenses, 0);
  const expectedAvailable = Math.max(
    totalBudget - paidExpenses - pendingExpenses,
    0
  );
  return {
    totalBudget,
    paidExpenses,
    pendingExpenses,
    availableBudget,
    expectedAvailable,
    totalSavings,
  };
};

// ── Monthly Rollover Detection ────────────────────────────────

export interface RolloverInfo {
  needed: boolean;
  fromMonth: number;
  fromYear: number;
}

/**
 * Determine if a monthly rollover is needed.
 * Returns the month/year of the last budget addition if it's behind the current month.
 */
export const detectRolloverNeeded = (
  budgetAdditions: LedgerBudgetAddition[]
): RolloverInfo => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  if (budgetAdditions.length === 0) {
    return { needed: false, fromMonth: currentMonth, fromYear: currentYear };
  }

  // Find the latest addition with month+year set
  const withDate = budgetAdditions.filter(
    (a) => a.month !== null && a.year !== null
  );
  if (withDate.length === 0) {
    return { needed: false, fromMonth: currentMonth, fromYear: currentYear };
  }

  const latest = withDate.reduce((max, a) => {
    const aDate = (a.year! * 12 + a.month!);
    const maxDate = (max.year! * 12 + max.month!);
    return aDate > maxDate ? a : max;
  }, withDate[0]);

  const latestDate = latest.year! * 12 + latest.month!;
  const currentDate = currentYear * 12 + currentMonth;

  if (latestDate < currentDate) {
    return {
      needed: true,
      fromMonth: latest.month!,
      fromYear: latest.year!,
    };
  }

  return { needed: false, fromMonth: currentMonth, fromYear: currentYear };
};

// ── Image Compression (mirrors Index.tsx pattern) ─────────────

const MAX_RECEIPT_SIZE = 2 * 1024 * 1024; // 2 MB
const RECEIPT_MAX_SIDE = 1200;

export const compressReceiptImage = async (file: File): Promise<Blob> => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Please upload a JPEG, PNG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File must be under 10 MB.");
  }
  // Always compress the image, regardless of initial size, to save maximum storage space

  const bitmap = await (async () => {
    if ("createImageBitmap" in window) return createImageBitmap(file);
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image.")); };
      img.src = url;
    });
  })();

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, RECEIPT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap && typeof (bitmap as ImageBitmap).close === "function") {
    (bitmap as ImageBitmap).close();
  }

  const toBlob = (q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", q));

  // Convert to WebP at a low quality setting for maximum compression
  const blob = await toBlob(0.58);
  if (blob) return blob;
  
  return file;
};
