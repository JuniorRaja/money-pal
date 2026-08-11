import { useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Dot } from "@/components/mm-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { archiveSlice, createSlice } from "@/data/mutations";
import type { Account, Slice, SliceKind } from "@/data/schema";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const kinds: { value: SliceKind; label: string; blurb: string }[] = [
  { value: "owned", label: "Owned", blurb: "Yours. Counts in net worth." },
  { value: "custodial", label: "Custodial", blurb: "Someone else's. Excluded from net worth." },
  { value: "earmark", label: "Earmark", blurb: "Yours, but committed to something." },
];

const palette = ["chart-2", "chart-1", "chart-3", "chart-4", "chart-5"];

const fieldBase =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary";

/** Add, review and archive the slices that split one account's balance. */
export function ManageSlicesDialog({
  account,
  slices,
  open,
  onOpenChange,
}: {
  account: Account | null;
  slices: Slice[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SliceKind>("owned");
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => (account ? slices.filter((s) => s.account_id === account.id) : []),
    [account, slices],
  );
  const allocated = rows.reduce((t, s) => t + s.amount, 0);
  const unallocated = (account?.balance ?? 0) - allocated;

  if (!account) return null;

  const reset = () => {
    setName("");
    setKind("owned");
    setAmount("");
    setTarget("");
    setError(null);
  };

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the slice a name");
    if (rows.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()))
      return setError("That slice already exists on this account");
    const paise = Math.round(Number(amount || "0") * 100);
    if (!Number.isFinite(paise) || paise < 0) return setError("Enter a valid amount");
    
    try {
      await createSlice({
        account_id: account.id,
        name: trimmed,
        kind,
        amount: paise,
        color_token: palette[rows.length % palette.length]!,
        target_amount: target ? Math.round(Number(target) * 100) : null,
        target_date: null,
      });
      reset();
      toast.success(`${trimmed} added to ${account.name}`);
      router.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error("Failed to add slice", { description: message });
    }
  };

  const remove = async (slice: Slice) => {
    try {
      const success = await archiveSlice(slice.id);
      if (!success) {
        toast.error("An account must keep at least one slice");
        return;
      }
      toast.success(`${slice.name} archived — balance returned to the default slice`);
      router.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error("Failed to archive slice", { description: message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : (reset(), onOpenChange(false)))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Slices — {account.name}</DialogTitle>
          <DialogDescription>
            Split {formatMoney(account.balance, { whole: true })} into named parts so you can see
            whose money is whose.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <Dot token={s.color_token} />
                <span className="truncate text-foreground">{s.name}</span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  {s.kind}
                </span>
                {s.is_default && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">default</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="numeric text-sm text-foreground">{formatMoney(s.amount)}</span>
                {!s.is_default && (
                  <button
                    type="button"
                    aria-label={`Archive ${s.name}`}
                    onClick={() => remove(s)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between px-3 pt-1 text-xs text-muted-foreground">
            <span>{unallocated < 0 ? "Over-allocated" : "Unallocated"}</span>
            <span className={cn("numeric", unallocated < 0 && "text-destructive")}>
              {formatMoney(unallocated)}
            </span>
          </li>
        </ul>

        <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
          <div className="grid grid-cols-2 gap-3">
            <input
              className={fieldBase}
              placeholder="Slice name — Mom, Rent, Trip"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              inputMode="decimal"
              className={fieldBase}
              placeholder="Amount (₹)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                title={k.blurb}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                  kind === k.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          {kind === "earmark" && (
            <input
              inputMode="decimal"
              className={fieldBase}
              placeholder="Target amount (₹, optional)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={add}
            className="h-9 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.01]"
          >
            Add slice
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
