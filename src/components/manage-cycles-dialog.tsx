import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Archive, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { archiveCreditCardCycle, upsertCreditCardCycle } from "@/data/mutations";
import { getCreditCardCycles } from "@/data/repository";
import type { Account, CreditCardCycle } from "@/data/schema";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const fieldBase =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary";

const emptyForm = {
  statement_date: "",
  due_date: "",
  credit_limit: "",
  statement_balance: "",
  payment_due_amount: "",
  minimum_due: "",
  amount_paid: "0",
  is_current: true,
  notes: "",
};

export function ManageCyclesDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [cycles, setCycles] = useState<CreditCardCycle[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = async () => {
    if (!account) return;
    setCycles(await getCreditCardCycles(account.id));
  };

  useEffect(() => {
    if (open && account) {
      void reload();
      setShowForm(false);
      setEditingId(null);
      setForm({
        ...emptyForm,
        credit_limit: account.credit_limit !== null ? String(account.credit_limit / 100) : "",
      });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);

  if (!account) return null;

  const startCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      credit_limit: account.credit_limit !== null ? String(account.credit_limit / 100) : "",
    });
    setShowForm(true);
    setError(null);
  };

  const startEdit = (cycle: CreditCardCycle) => {
    setEditingId(cycle.id);
    setForm({
      statement_date: cycle.statement_date,
      due_date: cycle.due_date,
      credit_limit: String(cycle.credit_limit / 100),
      statement_balance: String(cycle.statement_balance / 100),
      payment_due_amount: String(cycle.payment_due_amount / 100),
      minimum_due: String(cycle.minimum_due / 100),
      amount_paid: String(cycle.amount_paid / 100),
      is_current: cycle.is_current,
      notes: cycle.notes ?? "",
    });
    setShowForm(true);
    setError(null);
  };

  const paise = (v: string) => Math.round(Number(v || 0) * 100);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.statement_date || !form.due_date) {
      return setError("Statement and due dates are required");
    }
    setSaving(true);
    try {
      await upsertCreditCardCycle({
        id: editingId ?? undefined,
        account_id: account.id,
        statement_date: form.statement_date,
        due_date: form.due_date,
        credit_limit: paise(form.credit_limit),
        statement_balance: paise(form.statement_balance),
        payment_due_amount: paise(form.payment_due_amount),
        minimum_due: paise(form.minimum_due),
        amount_paid: paise(form.amount_paid),
        is_current: form.is_current,
        notes: form.notes.trim() || null,
      });
      toast.success(editingId ? "Cycle updated" : "Cycle added");
      setShowForm(false);
      await reload();
      router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save cycle");
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: string) => {
    try {
      await archiveCreditCardCycle(id);
      toast.success("Cycle archived");
      await reload();
      router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error("Failed to archive cycle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Billing cycles — {account.name}</DialogTitle>
          <DialogDescription>
            Track statement history, dues, and the current cycle for this card.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 max-h-[420px] space-y-3 overflow-y-auto">
          {cycles.length === 0 && !showForm && (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No billing cycles yet.
            </p>
          )}

          {cycles.map((c) => (
            <div
              key={c.id}
              className={cn(
                "rounded-xl border border-border px-4 py-3",
                c.is_current && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Statement {c.statement_date}
                    {c.is_current && (
                      <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Due {c.due_date} · Min {formatMoney(c.minimum_due, { whole: true })} · Pay{" "}
                    {formatMoney(c.payment_due_amount, { whole: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void archive(c.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="Archive cycle"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="numeric mt-2 text-lg text-foreground">
                {formatMoney(c.statement_balance, { whole: true })}
                <span className="ml-2 text-xs font-normal text-muted-foreground">statement</span>
              </p>
            </div>
          ))}

          {showForm && (
            <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {editingId ? "Edit cycle" : "New cycle"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Statement date
                  <input
                    type="date"
                    className={fieldBase}
                    value={form.statement_date}
                    onChange={(e) => setForm((f) => ({ ...f, statement_date: e.target.value }))}
                    required
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Due date
                  <input
                    type="date"
                    className={fieldBase}
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                    required
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Credit limit (₹)
                  <input
                    className={fieldBase}
                    inputMode="decimal"
                    value={form.credit_limit}
                    onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Statement balance (₹)
                  <input
                    className={fieldBase}
                    inputMode="decimal"
                    value={form.statement_balance}
                    onChange={(e) => setForm((f) => ({ ...f, statement_balance: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Payment due (₹)
                  <input
                    className={fieldBase}
                    inputMode="decimal"
                    value={form.payment_due_amount}
                    onChange={(e) => setForm((f) => ({ ...f, payment_due_amount: e.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Minimum due (₹)
                  <input
                    className={fieldBase}
                    inputMode="decimal"
                    value={form.minimum_due}
                    onChange={(e) => setForm((f) => ({ ...f, minimum_due: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Amount paid (₹)
                  <input
                    className={fieldBase}
                    inputMode="decimal"
                    value={form.amount_paid}
                    onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
                  />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.is_current}
                    onChange={(e) => setForm((f) => ({ ...f, is_current: e.target.checked }))}
                  />
                  Mark as current cycle
                </label>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <DialogFooter className="pt-1">
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save cycle"}
                </button>
              </DialogFooter>
            </form>
          )}
        </div>

        {!showForm && (
          <button
            type="button"
            onClick={startCreate}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> Add billing cycle
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
