import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ExpenseCategoryRow } from "@/pages/Index";

export function useExpenseCategories(currentUserId: string, onMutate?: () => void) {
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("expense_categories" as never)
        .select("*")
        .eq("is_deleted", false);
      if (error) throw error;
      setCategories((data || []) as unknown as ExpenseCategoryRow[]);
    } catch (error) {
      console.error("Failed to fetch categories", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createCategory = async (scope: "personal" | "group", name: string, groupId?: string | null) => {
    const payload = scope === "personal"
      ? { name: name.trim(), type: "personal", user_id: currentUserId, group_id: null, created_by: currentUserId }
      : { name: name.trim(), type: "group", user_id: null, group_id: groupId, created_by: currentUserId };
    const { data: created, error } = await supabase
      .from("expense_categories" as never)
      .insert(payload as never)
      .select("id, name, type, user_id, group_id, created_by, is_deleted, created_at, updated_at")
      .single();
    if (error) throw error;
    setCategories((prev) => [...prev, created as unknown as ExpenseCategoryRow]);
    if (onMutate) onMutate();
    return created as unknown as ExpenseCategoryRow;
  };

  const renameCategory = async (categoryId: string, name: string) => {
    const { error } = await supabase
      .from("expense_categories" as never)
      .update({ name: name.trim(), updated_at: new Date().toISOString() } as never)
      .eq("id", categoryId);
    if (error) throw error;
    setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, name: name.trim() } : c));
    if (onMutate) onMutate();
  };

  const deleteCategory = async (categoryId: string) => {
    const { error } = await supabase
      .from("expense_categories" as never)
      .update({ is_deleted: true, updated_at: new Date().toISOString() } as never)
      .eq("id", categoryId);
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
    setCategories, // Exposed just in case external refresh is needed
  };
}
