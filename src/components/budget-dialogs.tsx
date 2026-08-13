import { useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyBudgetTemplate,
  archiveBudgetLine,
  updateBudgetLine,
} from "@/data/mutations";
import type { BudgetPeriod } from "@/data/schema";
import { formatPeriodLabel } from "@/lib/period";

const fieldBase =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60";

export function EditBudgetLineDialog({
  line,
  categoryName,
  open,
  onOpenChange,
}: {
  line: BudgetPeriod | null;
  categoryName: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [planned, setPlanned] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (line && open) {
      setPlanned(String(line.planned / 100));
      setError(null);
    }
  }, [line, open]);

  if (!line) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(planned);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a planned amount of 0 or more");
      return;
    }
    setSaving(true);
    try {
      await updateBudgetLine({ id: line.id, planned: Math.round(amount * 100) });
      toast.success("Budget updated", { description: categoryName });
      onOpenChange(false);
      void router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error("Could not update this budget");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit planned amount</DialogTitle>
            <DialogDescription>
              {categoryName} · {formatPeriodLabel(line.period)}. Spent stays derived from the
              ledger.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-4 block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Planned (₹)
            </span>
            <input
              inputMode="decimal"
              className={fieldBase}
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              autoFocus
            />
            {error && <span className="block text-[11px] text-destructive">{error}</span>}
          </label>
          <DialogFooter className="pt-4">
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveBudgetLineDialog({
  line,
  categoryName,
  open,
  onOpenChange,
}: {
  line: BudgetPeriod | null;
  categoryName: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!line) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      const ok = await archiveBudgetLine(line.id);
      if (ok) {
        toast.success(`Removed ${categoryName} from this month`);
        onOpenChange(false);
        void router.invalidate();
      } else {
        toast.error("Failed to remove budget line");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Remove category
          </DialogTitle>
          <DialogDescription>
            Remove <strong>{categoryName}</strong> from {formatPeriodLabel(line.period)}? Spending
            is not deleted — only the planned amount for this month.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApplyBudgetTemplateDialog({
  period,
  open,
  onOpenChange,
}: {
  period: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [income, setIncome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIncome("");
      setError(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(income);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter monthly income greater than 0");
      return;
    }
    setSaving(true);
    try {
      const result = await applyBudgetTemplate({ period, monthly_income: Math.round(amount * 100) });
      if (result.linesAdded === 0) {
        toast("Template applied", {
          description: "All categories already have a budget. No changes made.",
          duration: 4000,
        });
      } else {
        toast.success("50/30/20 applied", {
          description: `Added ${result.linesAdded} categor${result.linesAdded === 1 ? "y" : "ies"} for ${formatPeriodLabel(period)}. Existing lines were left as-is.`,
        });
      }
      onOpenChange(false);
      void router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error("Could not apply the template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Apply Balanced 50/30/20</DialogTitle>
            <DialogDescription>
              Splits this month’s income across essentials, lifestyle and savings categories.
              Categories that already have a plan are not overwritten.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-4 block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Monthly income (₹)
            </span>
            <input
              inputMode="decimal"
              className={fieldBase}
              placeholder="120000"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              autoFocus
            />
            {error && <span className="block text-[11px] text-destructive">{error}</span>}
          </label>
          <DialogFooter className="pt-4">
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {saving ? "Applying…" : "Apply template"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
