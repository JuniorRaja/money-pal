/**
 * Dialog for creating and editing categories.
 * Supports parent-child hierarchy, icon selection, and color picking.
 */
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { IconPicker } from "@/components/icon-picker";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Category } from "@/data/schema";
import { cn } from "@/lib/utils";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null; // null = create new, Category = edit existing
  parentCategory?: Category | null; // If set, creating a sub-category
  defaultKind?: "income" | "expense"; // Default kind when creating new category
  categories: Category[]; // All categories for parent selection
  onSave: (input: {
    name: string;
    kind: "income" | "expense";
    parent_id?: string | null;
    icon: string;
    color_token: string;
  }) => Promise<void>;
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  parentCategory,
  defaultKind = "expense",
  categories,
  onSave,
}: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [parentId, setParentId] = useState<string | null>(null);
  const [icon, setIcon] = useState("tag");
  const [colorToken, setColorToken] = useState("chart-1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when editing or opening for new
  useEffect(() => {
    if (!open) return; // Don't reset when closing

    if (category) {
      setName(category.name);
      setKind(category.group === "income" ? "income" : "expense");
      setIcon(category.icon ?? "tag");
      setColorToken(category.color_token ?? "chart-1");
      setParentId(category.parent_id ?? null);
    } else if (parentCategory) {
      setName("");
      setKind(parentCategory.group === "income" ? "income" : "expense");
      setParentId(parentCategory.id);
      setIcon("tag");
      setColorToken(parentCategory.color_token ?? "chart-1");
    } else {
      setName("");
      setKind(defaultKind);
      setParentId(null);
      setIcon("tag");
      setColorToken("chart-1");
    }
    setError(null);
  }, [category, parentCategory, defaultKind, open]);

  const isEditing = Boolean(category);
  const isSubCategory = Boolean(parentCategory) || Boolean(parentId);

  // Filter parent candidates: same kind, no parent already, not current category
  const parentOptions = categories.filter((c) => {
    if (category && c.id === category.id) return false;
    const cKind = c.group === "income" ? "income" : "expense";
    return cKind === kind;
  });

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Category name is required");
      return;
    }
    if (trimmed.length > 40) {
      setError("Category name cannot exceed 40 characters");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: trimmed,
        kind,
        parent_id: parentId,
        icon,
        color_token: colorToken,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category");
    } finally {
      setSaving(false);
    }
  }

  const Icon = getCategoryIcon(icon);
  const previewColor = `var(--color-${colorToken})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? "Edit category"
              : isSubCategory
                ? "Add sub-category"
                : "Add category"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the category details."
              : isSubCategory
                ? `Create a sub-category under "${parentCategory?.name}".`
                : "Create a new category for organizing transactions."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Groceries, Salary, Rent"
              maxLength={40}
              className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </label>

          {/* Kind (income/expense) - only for parent categories */}
          {!isSubCategory && (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Type
              </span>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setKind("expense")}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                    kind === "expense"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setKind("income")}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                    kind === "income"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  Income
                </button>
              </div>
            </label>
          )}

          {/* Parent category selector (only when not already a sub-category) */}
          {!isSubCategory && !isEditing && parentOptions.length > 0 && (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Parent category (optional)
              </span>
              <select
                value={parentId ?? ""}
                onChange={(e) => setParentId(e.target.value || null)}
                className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/60"
              >
                <option value="">None — top-level category</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Icon & Color picker */}
          <div className="block">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Icon & color
            </span>
            <div className="mt-2">
              <IconPicker
                value={icon}
                onChange={setIcon}
                colorValue={colorToken}
                onColorChange={setColorToken}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-accent/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">Preview:</span>
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
              <Icon className="h-3.5 w-3.5" style={{ color: previewColor }} />
              <span className="text-sm text-foreground">
                {name.trim() || "Category name"}
              </span>
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
