import { useRouter } from "@tanstack/react-router";
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
import { updateAccount } from "@/data/mutations";
import type { Account, AccountKind } from "@/data/schema";
import { cn } from "@/lib/utils";

const kindOptions: { value: AccountKind; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "investment", label: "Investment" },
  { value: "loan", label: "Loan" },
];

const fieldBase =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary";

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [creditLimit, setCreditLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate fields when dialog opens with account data
  useEffect(() => {
    if (account && open) {
      setName(account.name);
      setInstitution(account.institution);
      setKind(account.kind);
      setCreditLimit(
        account.credit_limit !== null ? String(account.credit_limit / 100) : "",
      );
      setError(null);
    }
  }, [account, open]);

  if (!account) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedInstitution = institution.trim();

    if (!trimmedName) return setError("Account name is required");
    if (!trimmedInstitution) return setError("Institution is required");

    const parsedLimit =
      kind === "credit_card" && creditLimit.trim()
        ? Math.round(Number(creditLimit) * 100)
        : null;

    if (kind === "credit_card" && creditLimit.trim() && (!Number.isFinite(parsedLimit) || parsedLimit! <= 0)) {
      return setError("Enter a valid credit limit");
    }

    setSaving(true);
    try {
      await updateAccount({
        id: account.id,
        name: trimmedName,
        institution: trimmedInstitution,
        kind,
        credit_limit: parsedLimit,
      });
      toast.success("Account updated");
      onOpenChange(false);
      router.invalidate();
    } catch (err) {
      toast.error("Failed to update account");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>Update the details for this account.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="edit-acc-name" className="text-xs font-medium text-muted-foreground">
              Account Name
            </label>
            <input
              id="edit-acc-name"
              className={fieldBase}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. HDFC Savings"
              autoFocus
            />
          </div>

          {/* Institution */}
          <div className="space-y-1.5">
            <label htmlFor="edit-acc-institution" className="text-xs font-medium text-muted-foreground">
              Institution
            </label>
            <input
              id="edit-acc-institution"
              className={fieldBase}
              value={institution}
              onChange={(e) => {
                setInstitution(e.target.value);
                setError(null);
              }}
              placeholder="e.g. HDFC Bank"
            />
          </div>

          {/* Kind */}
          <div className="space-y-1.5">
            <label htmlFor="edit-acc-kind" className="text-xs font-medium text-muted-foreground">
              Account Type
            </label>
            <select
              id="edit-acc-kind"
              className={cn(fieldBase, "appearance-none")}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as AccountKind);
                setError(null);
              }}
            >
              {kindOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Credit Limit (only for credit cards) */}
          {kind === "credit_card" && (
            <div className="space-y-1.5">
              <label htmlFor="edit-acc-limit" className="text-xs font-medium text-muted-foreground">
                Credit Limit
              </label>
              <input
                id="edit-acc-limit"
                className={fieldBase}
                value={creditLimit}
                onChange={(e) => {
                  setCreditLimit(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. 200000"
                inputMode="decimal"
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
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
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
