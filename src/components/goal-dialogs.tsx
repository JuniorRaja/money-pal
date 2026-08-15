import { useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  addGoalContribution,
  archiveGoal,
  linkGoalContribution,
  unlinkGoalContribution,
  updateGoal,
  voidGoalContribution,
} from "@/data/mutations";
import type { Account, Goal, GoalContribution, Transaction } from "@/data/schema";
import { formatMoney } from "@/lib/money";
import { localISODate } from "@/lib/period";

const fieldBase =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60";

function uniqueTxnOptions(
  txns: Transaction[],
  linkedHeaderIds: Set<string>,
  preferAccount: string,
): Transaction[] {
  const seen = new Set<string>();
  const sorted = [...txns].sort((a, b) => {
    if (preferAccount) {
      const ap = a.account_id === preferAccount ? 0 : 1;
      const bp = b.account_id === preferAccount ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    return a.occurred_at < b.occurred_at ? 1 : -1;
  });
  const out: Transaction[] = [];
  for (const t of sorted) {
    if (linkedHeaderIds.has(t.transaction_id) || seen.has(t.transaction_id)) continue;
    seen.add(t.transaction_id);
    out.push(t);
  }
  return out.slice(0, 80);
}

function txnLabel(t: Transaction): string {
  const date = t.occurred_at.slice(0, 10);
  return `${date} · ${t.merchant} · ${formatMoney(Math.abs(t.amount), { whole: true })}`;
}

export function EditGoalDialog({
  goal,
  accounts,
  open,
  onOpenChange,
}: {
  goal: Goal | null;
  accounts: Account[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthly, setMonthly] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (goal && open) {
      setName(goal.name);
      setBlurb(goal.blurb);
      setTarget(String(goal.target / 100));
      setTargetDate(goal.target_date);
      setMonthly(goal.monthly_contribution ? String(goal.monthly_contribution / 100) : "");
      setAccountId(goal.account_id);
      setError(null);
    }
  }, [goal, open]);

  if (!goal) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const amount = Number(target);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a target greater than 0");
      return;
    }
    const plan = monthly === "" ? 0 : Number(monthly);
    if (!Number.isFinite(plan) || plan < 0) {
      setError("Monthly plan must be 0 or more");
      return;
    }
    setSaving(true);
    try {
      await updateGoal({
        id: goal.id,
        name: name.trim(),
        blurb: blurb.trim(),
        target: Math.round(amount * 100),
        target_date: targetDate,
        account_id: accountId,
        monthly_contribution: Math.round(plan * 100),
      });
      toast.success("Goal updated", { description: name.trim() });
      onOpenChange(false);
      void router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error("Could not update this goal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit goal</DialogTitle>
            <DialogDescription>
              Saved amount is changed by contributing, not here.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Name
              </span>
              <input className={fieldBase} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Blurb
              </span>
              <input
                className={fieldBase}
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Target (₹)
                </span>
                <input
                  inputMode="decimal"
                  className={fieldBase}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Target date
                </span>
                <input
                  type="date"
                  className={fieldBase}
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Monthly plan (₹)
                </span>
                <input
                  inputMode="decimal"
                  className={fieldBase}
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Linked account
                </span>
                <select
                  className={fieldBase}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">None</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>
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

export function ArchiveGoalDialog({
  goal,
  open,
  onOpenChange,
}: {
  goal: Goal | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!goal) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      const ok = await archiveGoal(goal.id);
      if (ok) {
        toast.success(`Archived ${goal.name}`);
        onOpenChange(false);
        void router.invalidate();
      } else {
        toast.error("Failed to archive goal");
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
            Archive goal
          </DialogTitle>
          <DialogDescription>
            Archive <strong>{goal.name}</strong>? Contributions stay on file. Accounts and
            transactions are not changed.
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
            onClick={() => void confirm()}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {busy ? "Archiving…" : "Archive"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContributeGoalDialog({
  goal,
  transactions,
  linkedHeaderIds,
  open,
  onOpenChange,
}: {
  goal: Goal | null;
  transactions: Transaction[];
  linkedHeaderIds: Set<string>;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"add" | "withdraw">("add");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localISODate());
  const [txnId, setTxnId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => (goal ? uniqueTxnOptions(transactions, linkedHeaderIds, goal.account_id) : []),
    [goal, transactions, linkedHeaderIds],
  );

  useEffect(() => {
    if (goal && open) {
      setDirection("add");
      setAmount("");
      setDate(localISODate());
      setTxnId("");
      setError(null);
    }
  }, [goal, open]);

  if (!goal) return null;

  const pickTxn = (id: string) => {
    setTxnId(id);
    const t = options.find((row) => row.transaction_id === id);
    if (!t) return;
    setAmount(String(Math.abs(t.amount) / 100));
    setDate(t.occurred_at.slice(0, 10));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    const paise = Math.round(rupees * 100);
    const signed = direction === "withdraw" ? -paise : paise;
    if (direction === "withdraw" && paise > goal.saved) {
      setError("Withdraw cannot exceed saved so far");
      return;
    }
    setSaving(true);
    try {
      await addGoalContribution({
        goal_id: goal.id,
        amount: signed,
        contributed_on: date,
        transaction_id: txnId || null,
      });
      toast.success(direction === "withdraw" ? "Withdrawn from goal" : "Contribution added", {
        description: goal.name,
      });
      onOpenChange(false);
      void router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not save contribution");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Contribute</DialogTitle>
            <DialogDescription>
              {goal.name}. Linking a transaction does not move ledger money.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Direction
              </span>
              <select
                className={fieldBase}
                value={direction}
                onChange={(e) => setDirection(e.target.value as "add" | "withdraw")}
              >
                <option value="add">Add to saved</option>
                <option value="withdraw">Withdraw from saved</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Amount (₹)
                </span>
                <input
                  inputMode="decimal"
                  className={fieldBase}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Date
                </span>
                <input
                  type="date"
                  className={fieldBase}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Link transaction (optional)
              </span>
              <select className={fieldBase} value={txnId} onChange={(e) => pickTxn(e.target.value)}>
                <option value="">None — manual</option>
                {options.map((t) => (
                  <option key={t.transaction_id} value={t.transaction_id}>
                    {txnLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>
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

export function GoalHistoryDialog({
  goal,
  rows,
  transactions,
  linkedHeaderIds,
  open,
  onOpenChange,
}: {
  goal: Goal | null;
  rows: GoalContribution[];
  transactions: Transaction[];
  linkedHeaderIds: Set<string>;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<GoalContribution | null>(null);
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => (goal ? uniqueTxnOptions(transactions, linkedHeaderIds, goal.account_id) : []),
    [goal, transactions, linkedHeaderIds],
  );

  useEffect(() => {
    if (open) {
      setLinkingId(null);
      setVoiding(null);
    }
  }, [open]);

  if (!goal) return null;

  const unlink = async (id: string) => {
    setBusy(true);
    try {
      await unlinkGoalContribution(id);
      toast.success("Unlinked transaction", { description: "Saved amount is unchanged." });
      void router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error("Could not unlink");
    } finally {
      setBusy(false);
    }
  };

  const link = async (id: string, transactionId: string) => {
    if (!transactionId) return;
    setBusy(true);
    try {
      await linkGoalContribution(id, transactionId);
      toast.success("Transaction linked");
      setLinkingId(null);
      void router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not link");
    } finally {
      setBusy(false);
    }
  };

  const confirmVoid = async () => {
    if (!voiding) return;
    setBusy(true);
    try {
      await voidGoalContribution(voiding.id);
      toast.success("Contribution voided");
      setVoiding(null);
      void router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error("Could not void this contribution");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>History · {goal.name}</DialogTitle>
          <DialogDescription>
            Newest first. Voiding removes the amount from saved. Unlinking keeps it.
          </DialogDescription>
        </DialogHeader>
        {voiding ? (
          <div className="mt-4 rounded-xl border border-border bg-accent/40 p-4">
            <p className="text-sm text-foreground">
              Void {formatMoney(voiding.amount, { sign: true, whole: true })} from{" "}
              {voiding.contributed_on}?
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground"
                onClick={() => setVoiding(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
                onClick={() => void confirmVoid()}
              >
                Void
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-4 py-8 text-center text-sm text-muted-foreground">
            No contributions yet.
          </p>
        ) : (
          <ul className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-border bg-accent/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="numeric text-sm text-foreground">
                      {formatMoney(row.amount, { sign: true, whole: true })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.contributed_on}
                      {" · "}
                      {row.transaction_id
                        ? row.merchant || row.descriptor || "Linked transaction"
                        : "Manual"}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {row.transaction_id ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                        onClick={() => void unlink(row.id)}
                      >
                        Unlink
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                        onClick={() => setLinkingId(linkingId === row.id ? null : row.id)}
                      >
                        Link
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-muted"
                      onClick={() => setVoiding(row)}
                    >
                      Void
                    </button>
                  </div>
                </div>
                {linkingId === row.id && (
                  <select
                    className={`${fieldBase} mt-2`}
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) => void link(row.id, e.target.value)}
                  >
                    <option value="">Pick a transaction</option>
                    {options.map((t) => (
                      <option key={t.transaction_id} value={t.transaction_id}>
                        {txnLabel(t)}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
