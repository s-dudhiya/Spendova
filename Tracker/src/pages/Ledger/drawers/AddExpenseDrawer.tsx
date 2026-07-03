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
import { useLedgerExpenseMutation, useSharedLedgerCategories } from "../hooks";
import { Field, Textarea } from "../components/Fields";
import { ImageUpload } from "@/components/ImageUpload";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { CategoryPicker } from "@/components/CategoryPicker";

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
  const isShared = ledger.ledger_type === "shared";

  const personalHook = useExpenseCategories(currentUserId);
  const sharedHook = useSharedLedgerCategories(ledger.id, currentUserId);
  const { saveExpense } = useLedgerExpenseMutation(ledger, currentUserId);

  useEffect(() => {
    if (open) {
      if (isShared) {
        sharedHook.fetchCategories();
      } else {
        personalHook.fetchCategories();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isShared]);

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

  const displayCategories = isShared
    ? sharedHook.categories
    : personalHook.categories.filter((c) => c.type === "personal");

  const handleCreateCategory = (name: string) => {
    if (isShared) {
      return sharedHook.createCategory(name);
    } else {
      return personalHook.createCategory("personal", name, null);
    }
  };

  const handleRenameCategory = (id: string, name: string) => {
    if (isShared) {
      return sharedHook.renameCategory(id, name);
    } else {
      return personalHook.renameCategory(id, name);
    }
  };

  const handleDeleteCategory = (id: string) => {
    if (isShared) {
      return sharedHook.deleteCategory(id);
    } else {
      return personalHook.deleteCategory(id);
    }
  };

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
    const picked = displayCategories.find((c) => c.id === value);
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
          category_id: categoryId || null,
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
  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="mx-auto grid h-[88dvh] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-0">
        <DrawerHeader className="px-0 pb-3 pt-4 text-left">
          <DrawerTitle>{isEdit ? "Edit Expense" : "Add Expense"}</DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "Update your pending expense."
              : `Submit an expense for "${ledger.name}".`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          <form id="ledger-expense-form" onSubmit={handleSubmit} className="space-y-3 pb-3">
            <CategoryPicker
              categories={displayCategories}
              value={categoryId}
              onChange={handleCategoryChange}
              onCreate={handleCreateCategory}
              onRename={handleRenameCategory}
              onDelete={handleDeleteCategory}
            />
            
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

        <div className="grid grid-cols-[1fr_min-content] items-end gap-3 border-t border-border/60 bg-card py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="col-span-2 flex gap-2">
            <Button
              type="button"
              variant="quiet"
              className="flex-1 h-12 rounded-full"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="ledger-expense-form"
              className="flex-1 h-12 rounded-full shadow-primary-action"
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
        </div>
      </DrawerContent>
    </Drawer>
  );
};
