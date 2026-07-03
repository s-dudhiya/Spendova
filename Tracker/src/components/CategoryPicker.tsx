import { useState, useEffect } from "react";
import { Plus, Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { getFriendlyErrorMessage } from "@/lib/friendly-error";
import type { ExpenseCategoryRow } from "@/pages/Index";

export interface PickerCategory {
  id: string;
  name: string;
}

const CREATE_CATEGORY_ACTION = "___create_category___";
const MANAGE_CATEGORIES_ACTION = "___manage_categories___";
const UNCATEGORIZED_CATEGORY = "___uncategorized___";

export const CategoryPicker = ({
  categories,
  value,
  onChange,
  onCreate,
  onRename,
  onDelete,
}: {
  categories: PickerCategory[];
  value: string;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<PickerCategory>;
  onRename: (categoryId: string, name: string) => Promise<void>;
  onDelete: (categoryId: string) => Promise<void>;
}) => {
  const { toast } = useToast();
  const [localCategories, setLocalCategories] = useState(categories);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setLocalCategories(categories), [categories]);
  const filteredCategories = localCategories.filter((category) => category.name.toLowerCase().includes(search.trim().toLowerCase()));

  const createCategory = async () => {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const created = await onCreate(name);
      setLocalCategories((current) => [...current.filter((category) => category.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id);
      setNewName("");
      setCreateOpen(false);
      toast({ title: "Category created" });
    } catch (error) {
      toast({ title: "Could not save category", description: getFriendlyErrorMessage(error, "expense"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const renameCategory = async (categoryId: string) => {
    const name = editingName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await onRename(categoryId, name);
      setLocalCategories((current) => current.map((category) => category.id === categoryId ? { ...category, name } : category).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
      setEditingName("");
      toast({ title: "Category renamed" });
    } catch (error) {
      toast({ title: "Could not rename category", description: getFriendlyErrorMessage(error, "expense"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    const confirmed = window.confirm("Deleting this category will not delete any expenses. Existing expenses will appear as Uncategorized.");
    if (!confirmed || saving) return;
    setSaving(true);
    try {
      await onDelete(categoryId);
      setLocalCategories((current) => current.filter((category) => category.id !== categoryId));
      if (value === categoryId) onChange("");
      toast({ title: "Category deleted", description: "Expenses using it now appear as Uncategorized." });
    } catch (error) {
      toast({ title: "Could not delete category", description: getFriendlyErrorMessage(error, "expense"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const handleSelectChange = (nextValue: string) => {
    if (nextValue === CREATE_CATEGORY_ACTION) {
      setCreateOpen(true);
      return;
    }
    if (nextValue === MANAGE_CATEGORIES_ACTION) {
      setManageOpen(true);
      return;
    }
    onChange(nextValue === UNCATEGORIZED_CATEGORY ? "" : nextValue);
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-foreground">
        Category
        <div className="mt-2">
          <Select value={value || UNCATEGORIZED_CATEGORY} onValueChange={handleSelectChange}>
            <SelectTrigger className="min-h-11 rounded-full border-input bg-background px-4 py-3 text-sm font-normal focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNCATEGORIZED_CATEGORY}>Uncategorized</SelectItem>
              {localCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
              <SelectSeparator />
              <SelectItem value={CREATE_CATEGORY_ACTION} className="pl-3 font-bold text-primary focus:text-primary">
                <span className="flex items-center gap-2"><Plus className="size-4" />Create Category</span>
              </SelectItem>
              <SelectItem value={MANAGE_CATEGORIES_ACTION} className="pl-3 font-bold text-primary focus:text-primary">Manage Categories</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </label>
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setNewName(""); }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-[1.25rem] border-border bg-card p-5 shadow-panel sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Category</DialogTitle>
            <DialogDescription>Add a category for future expenses.</DialogDescription>
          </DialogHeader>
          <label className="block text-sm font-semibold text-foreground">
            Category name
            <input value={newName} onChange={(event) => setNewName(event.target.value)} className="mt-2 block min-h-11 w-full rounded-full border border-input bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring" placeholder="Groceries" />
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="quiet" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="button" className="flex-1" onClick={createCategory} disabled={saving || !newName.trim()}>{saving ? "Creating..." : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={manageOpen} onOpenChange={(open) => { setManageOpen(open); if (!open) { setSearch(""); setEditingId(null); setEditingName(""); } }}>
        <DialogContent className="grid max-h-[calc(100svh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1rem)] w-[calc(100vw-1.5rem)] max-w-md grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-[1.25rem] border-border bg-card p-5 shadow-panel sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-foreground">Manage Categories</DialogTitle>
            <DialogDescription>Edit or delete expense categories.</DialogDescription>
          </DialogHeader>
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 w-full rounded-full border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-ring" placeholder="Search categories" />
          <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1">
            {filteredCategories.length === 0 ? (
              <div className="rounded-2xl bg-elevated p-4 text-sm font-medium text-muted-foreground">No categories found.</div>
            ) : filteredCategories.map((category) => (
              <div key={category.id} className="flex min-h-12 items-center gap-2 rounded-xl bg-background p-2 text-sm">
                {editingId === category.id ? (
                  <>
                    <input value={editingName} onChange={(event) => setEditingName(event.target.value)} className="min-w-0 flex-1 rounded-full border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-ring" />
                    <Button type="button" size="sm" onClick={() => renameCategory(category.id)} disabled={saving || !editingName.trim()}><Check />Save</Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{category.name}</span>
                    <Button type="button" size="icon" variant="quiet" onClick={() => { setEditingId(category.id); setEditingName(category.name); }}><Pencil /></Button>
                    <Button type="button" size="icon" variant="quiet" onClick={() => deleteCategory(category.id)}><Trash2 /></Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
