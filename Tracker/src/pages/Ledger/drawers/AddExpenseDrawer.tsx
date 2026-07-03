// ============================================================
// Budget Ledger – Add Expense Drawer (Member & Owner)
// ============================================================

import { useState, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import type { LedgerRow } from "../types";
import { useLedgerExpenseMutation } from "../hooks";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ImageUpload } from "@/components/ImageUpload";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";

const Field = ({ label, hint, type = "text", ...props }: { label: string; hint?: ReactNode; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block text-sm font-semibold text-foreground">
    {label}
    <input type={type} className="mt-2 block min-h-11 w-full rounded-full border border-input bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50" {...props} />
    {hint && <div className="mt-1.5 text-xs font-medium text-muted-foreground">{hint}</div>}
  </label>
);

const Textarea = ({ label, hint, ...props }: { label: string; hint?: ReactNode } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <label className="block text-sm font-semibold text-foreground">
    {label}
    <textarea className="mt-2 block min-h-24 w-full rounded-3xl border border-input bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50" {...props} />
    {hint && <div className="mt-1.5 text-xs font-medium text-muted-foreground">{hint}</div>}
  </label>
);

interface AddExpenseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerRow;
  currentUserId: string;
  onSuccess: () => Promise<void>;
  editExpense?: {
    id: string;
    title: string;
    amount: number;
    category: string | null;
    category_id?: string | null;
    linked_expense_id?: string | null;
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

  const { categories, fetchCategories, createCategory, renameCategory, deleteCategory } = useExpenseCategories(currentUserId);
  const { saveExpense } = useLedgerExpenseMutation(ledger, currentUserId);

  useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open, fetchCategories]);

  const [title, setTitle] = useState(editExpense?.title ?? "");
  const [amount, setAmount] = useState(
    editExpense ? String(editExpense.amount) : ""
  );
  const [categoryId, setCategoryId] = useState(editExpense?.category_id ?? "");
  const [categoryName, setCategoryName] = useState(editExpense?.category ?? "");
  const [notes, setNotes] = useState(editExpense?.notes ?? "");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [autoNameCategoryId, setAutoNameCategoryId] = useState<string | null>(null);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setTitle(editExpense?.title ?? "");
      setAmount(editExpense ? String(editExpense.amount) : "");
      setCategoryId(editExpense?.category_id ?? "");
      setCategoryName(editExpense?.category ?? "");
      setNotes(editExpense?.notes ?? "");
      setProofFile(null);
      setProofPreview(null);
      setAutoNameCategoryId(null);
    }
    onOpenChange(o);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setAutoNameCategoryId(null);
  };

  const handleCategoryChange = (value: string) => {
    const picked = categories.find((c) => c.id === value);
    const shouldAutoFillName = !title.trim() || Boolean(autoNameCategoryId);

    setCategoryId(value);
    if (picked) {
      setCategoryName(picked.name);
      if (shouldAutoFillName) {
        setTitle(picked.name);
        setAutoNameCategoryId(picked.id);
      }
    } else {
      setCategoryName("");
      if (autoNameCategoryId) {
        setTitle("");
        setAutoNameCategoryId(null);
      }
    }
  };

  const handleProofChange = (file: File | null, url: string | null) => {
    setProofFile(file);
    setProofPreview(url);
  };

  const parsedAmount = parseFloat(amount);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const expenseTitle = title.trim() || categoryName || "";
    if (!expenseTitle) {
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
      await saveExpense(
        {
          id: editExpense?.id,
          title: expenseTitle,
          amount: parsedAmount,
          category: categoryName || null,
          category_id: ledger.ledger_type === "personal" ? (categoryId || null) : null,
          notes: notes.trim() || null,
          month: currentMonth,
          year: currentYear,
          linked_expense_id: editExpense?.linked_expense_id,
        },
        proofFile
      );

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

  const personalCategories = categories.filter((c) => c.type === "personal");

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
          <form id="ledger-expense-form" onSubmit={handleSubmit} className="space-y-3 pb-3">
            {ledger.ledger_type === "personal" ? (
              <CategoryPicker
                categories={personalCategories}
                value={categoryId}
                onChange={handleCategoryChange}
                onCreate={(name) => createCategory("personal", name, null)}
                onRename={renameCategory}
                onDelete={deleteCategory}
              />
            ) : (
              <Field
                label="Category (optional)"
                placeholder="e.g. Office Supplies"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
              />
            )}
            
            <Field 
              label="Expense name" 
              placeholder="Dinner, groceries..." 
              value={title} 
              onChange={handleTitleChange} 
              hint="Selecting a category can fill this if you leave it blank." 
            />
            
            <Field 
              label="Amount" 
              type="number" 
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="0" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
            />

            <Textarea 
              label="Notes (optional)" 
              placeholder="Add a note" 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              rows={3} 
              maxLength={1000} 
            />

            <ImageUpload
              file={proofFile}
              previewUrl={proofPreview}
              onChange={handleProofChange}
            />
          </form>
        </div>

        <div className="shrink-0 flex gap-2 border-t border-border/60 bg-card pt-3">
          <Button
            type="button"
            variant="quiet"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="ledger-expense-form"
            className="flex-1 shadow-primary-action"
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
