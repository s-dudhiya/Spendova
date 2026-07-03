// ============================================================
// Budget Ledger – Add Expense Drawer (Member & Owner)
// ============================================================

import { useState, useRef } from "react";
import { Upload, X, Receipt } from "lucide-react";
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
import type { LedgerRow } from "./types";
import { uploadLedgerReceipt, logLedgerActivity } from "./hooks";
import { compressReceiptImage } from "./utils";

interface Field {
  label: string;
  id: string;
  children: React.ReactNode;
}

const FormField = ({ label, id, children }: Field) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="text-sm font-bold text-foreground">
      {label}
    </label>
    {children}
  </div>
);

const inputCls =
  "w-full rounded-2xl border border-input bg-elevated px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

const CATEGORIES = [
  "Food & Drinks",
  "Transport",
  "Groceries",
  "Fuel",
  "Shopping",
  "Medical",
  "Entertainment",
  "Utilities",
  "Travel",
  "Office",
  "Miscellaneous",
];

interface AddExpenseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerRow;
  currentUserId: string;
  onSuccess: () => Promise<void>;
  /** If set, prefills and edit existing pending expense */
  editExpense?: {
    id: string;
    title: string;
    amount: number;
    category: string | null;
    notes: string | null;
    proof_path: string | null;
  } | null;
}

export const AddExpenseDrawer = ({
  open,
  onOpenChange,
  ledger,
  currentUserId,
  onSuccess,
  editExpense,
}: AddExpenseDrawerProps) => {
  const { toast } = useToast();
  const isEdit = Boolean(editExpense);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(editExpense?.title ?? "");
  const [amount, setAmount] = useState(
    editExpense ? String(editExpense.amount) : ""
  );
  const [category, setCategory] = useState(editExpense?.category ?? "");
  const [notes, setNotes] = useState(editExpense?.notes ?? "");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset when drawer opens/closes
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setTitle(editExpense?.title ?? "");
      setAmount(editExpense ? String(editExpense.amount) : "");
      setCategory(editExpense?.category ?? "");
      setNotes(editExpense?.notes ?? "");
      setProofFile(null);
      setProofPreview(null);
    }
    onOpenChange(o);
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "Invalid file",
        description: "Please upload a JPEG, PNG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    setProofFile(file);
    const url = URL.createObjectURL(file);
    setProofPreview(url);
  };

  const removeProof = () => {
    setProofFile(null);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parsedAmount = parseFloat(amount);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const now = new Date();
    const currentMonth = ledger.budget_type === "monthly" ? now.getMonth() + 1 : null;
    const currentYear = ledger.budget_type === "monthly" ? now.getFullYear() : null;

    try {
      let expenseId = editExpense?.id ?? "";

      if (isEdit && editExpense) {
        // Update existing pending expense
        const { error } = await (supabase as never as {
          from: (t: string) => {
            update: (d: object) => { eq: (c: string, v: string) => { error: Error | null } };
          };
        })
          .from("ledger_expenses")
          .update({
            title: title.trim(),
            amount: parsedAmount,
            category: category.trim() || null,
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editExpense.id);
        if (error) throw error;
      } else {
        // Insert new expense
        const { data, error } = await (supabase
          .from("ledger_expenses" as never)
          .insert({
            ledger_id: ledger.id,
            user_id: currentUserId,
            title: title.trim(),
            amount: parsedAmount,
            category: category.trim() || null,
            notes: notes.trim() || null,
            status: "pending",
            month: currentMonth,
            year: currentYear,
          } as never)
          .select("id")
          .single() as unknown as { data: { id: string } | null; error: Error | null });

        if (error) throw error;
        if (!data) throw new Error("Failed to create expense.");
        expenseId = data.id;

        await logLedgerActivity(ledger.id, currentUserId, "expense_submitted", {
          entityType: "expense",
          entityId: expenseId,
          metadata: { title: title.trim(), amount: parsedAmount },
        });
      }

      // Upload receipt if provided
      if (proofFile && expenseId) {
        try {
          const blob = await compressReceiptImage(proofFile);
          const path = await uploadLedgerReceipt(currentUserId, ledger.id, expenseId, blob);
          (await supabase
            .from("ledger_expenses" as never)
            .update({
              proof_path: path,
              proof_uploaded_at: new Date().toISOString(),
            } as never)
            .eq("id" as never, expenseId as never)) as unknown as { error: Error | null };
        } catch (proofError) {
          toast({
            title: "Receipt upload failed",
            description:
              proofError instanceof Error
                ? proofError.message
                : "Could not upload receipt. Expense was saved without it.",
            variant: "destructive",
          });
        }
      }

      toast({
        title: isEdit ? "Expense updated" : "Expense submitted",
        description: isEdit
          ? "Your expense has been updated."
          : "Your expense is pending owner approval.",
      });

      handleOpenChange(false);
      await onSuccess();
    } catch (error) {
      toast({
        title: isEdit ? "Update failed" : "Submission failed",
        description:
          error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto flex max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.75rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <DrawerHeader className="shrink-0 px-0 pb-2 text-left">
          <DrawerTitle>{isEdit ? "Edit Expense" : "Add Expense"}</DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "Update your pending expense."
              : `Submit an expense for "${ledger.name}".`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-4 pb-3">
            {/* Title */}
            <FormField label="Title *" id="le-title">
              <input
                id="le-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Office Lunch"
                className={inputCls}
                maxLength={200}
              />
            </FormField>

            {/* Amount */}
            <FormField label="Amount (₹) *" id="le-amount">
              <input
                id="le-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </FormField>

            {/* Category */}
            <FormField label="Category" id="le-category">
              <input
                id="le-category"
                list="le-category-list"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Select or type a category"
                className={inputCls}
                maxLength={100}
              />
              <datalist id="le-category-list">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </FormField>

            {/* Notes */}
            <FormField label="Notes" id="le-notes">
              <textarea
                id="le-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional details…"
                rows={3}
                maxLength={1000}
                className={`${inputCls} resize-none`}
              />
            </FormField>

            {/* Receipt Upload */}
            <FormField label="Receipt / Proof" id="le-receipt">
              {proofPreview ? (
                <div className="relative overflow-hidden rounded-2xl border border-border">
                  <img
                    src={proofPreview}
                    alt="Receipt preview"
                    className="h-48 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={removeProof}
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-card/90 text-foreground shadow-soft"
                    aria-label="Remove receipt"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-elevated/50"
                >
                  <Receipt className="size-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      Upload receipt
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JPEG, PNG or WebP — max 5 MB
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-xs font-bold text-muted-foreground">
                    <Upload className="size-3" />
                    Choose file
                  </span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                id="le-receipt"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </FormField>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-2 border-t border-border/60 bg-card pt-3">
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
            onClick={handleSubmit}
            disabled={
              submitting || !title.trim() || !parsedAmount || parsedAmount <= 0
            }
          >
            {submitting
              ? isEdit
                ? "Saving…"
                : "Submitting…"
              : isEdit
              ? "Save Changes"
              : "Submit Expense"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
