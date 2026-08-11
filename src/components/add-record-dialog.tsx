import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CURRENT_PERIOD, TODAY, getAccounts, getCategories, getSlices } from "@/data/repository";
import {
  createAccount,
  createBudget,
  createGoal,
  createHolding,
  createTransaction,
} from "@/data/mutations";
import type { Account, Category, Slice } from "@/data/schema";
import { cn } from "@/lib/utils";

export type RecordKind = "transaction" | "account" | "goal" | "budget" | "investment";

export const recordLabels: Record<RecordKind, string> = {
  transaction: "Transaction",
  account: "Account",
  goal: "Goal",
  budget: "Budget",
  investment: "Investment",
};

const rupees = z
  .string()
  .trim()
  .refine((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) > 0, {
    message: "Enter an amount greater than 0",
  });

const text = (max = 80) => z.string().trim().min(1, "Required").max(max, `Max ${max} characters`);
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

const schemas = {
  transaction: z
    .object({
      occurred_at: isoDate,
      account_id: text(40),
      to_account_id: z.string().optional(),
      merchant: text(60),
      descriptor: z.string().trim().max(120).optional(),
      amount: rupees,
      type: z.enum(["expense", "income", "transfer"]),
      category_id: text(40),
      label_id: z.string().optional(),
      to_label_id: z.string().optional(),
      note: z.string().trim().max(280).optional(),
    })
    .superRefine((val, ctx) => {
      if (val.type === "transfer") {
        if (!val.to_account_id?.trim()) {
          ctx.addIssue({ code: "custom", path: ["to_account_id"], message: "Pick a destination account" });
        } else if (val.to_account_id === val.account_id) {
          ctx.addIssue({ code: "custom", path: ["to_account_id"], message: "Accounts must differ" });
        }
      }
    }),
  account: z.object({
    name: text(60),
    institution: text(60),
    kind: z.enum(["bank", "cash", "credit_card", "investment", "loan"]),
    balance: rupees,
    credit_limit: z.string().optional(),
  }),
  goal: z.object({
    name: text(60),
    blurb: z.string().trim().max(120).optional(),
    target: rupees,
    saved: z.string().optional(),
    target_date: isoDate,
    account_id: text(40),
    monthly_contribution: rupees,
  }),
  budget: z.object({
    category_id: text(40),
    planned: rupees,
    period: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
  }),
  investment: z.object({
    name: text(60),
    asset_class: z.enum(["equity", "mutual_fund", "gold", "fixed_income", "crypto"]),
    units: z
      .string()
      .trim()
      .refine((v) => Number(v) > 0, "Enter units greater than 0"),
    invested: rupees,
    current_value: rupees,
    account_id: text(40),
  }),
} as const;

const paise = (v: string | undefined) => Math.round(Number(v || 0) * 100);

const defaults: Record<RecordKind, Record<string, string>> = {
  transaction: {
    occurred_at: TODAY,
    account_id: "",
    to_account_id: "",
    merchant: "",
    descriptor: "",
    amount: "",
    type: "expense",
    category_id: "",
    label_id: "",
    to_label_id: "",
    note: "",
  },
  account: { name: "", institution: "", kind: "bank", balance: "", credit_limit: "" },
  goal: {
    name: "",
    blurb: "",
    target: "",
    saved: "",
    target_date: "",
    account_id: "",
    monthly_contribution: "",
  },
  budget: { category_id: "", planned: "", period: CURRENT_PERIOD },
  investment: {
    name: "",
    asset_class: "equity",
    units: "",
    invested: "",
    current_value: "",
    account_id: "",
  },
};

const fieldBase =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60";

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="block text-[11px] text-destructive">{error}</span>}
    </label>
  );
}

export function AddRecordDialog({
  kind,
  onOpenChange,
}: {
  kind: RecordKind | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slices, setSlices] = useState<Slice[]>([]);

  useEffect(() => {
    void Promise.all([getAccounts(), getCategories(), getSlices()]).then(([a, c, s]) => {
      setAccounts(a);
      setCategories(c);
      setSlices(s);
    });
  }, [kind]);

  useEffect(() => {
    if (kind) {
      setValues({ ...defaults[kind] });
      setErrors({});
    }
  }, [kind]);

  const set = (name: string, value: string) => {
    // Switching account invalidates any slice picked from the previous one.
    setValues((v) => ({
      ...v,
      [name]: value,
      ...(name === "account_id" ? { label_id: "" } : {}),
      ...(name === "to_account_id" ? { to_label_id: "" } : {}),
      ...(name === "type" && value !== "transfer" ? { to_account_id: "", to_label_id: "" } : {}),
    }));
    setErrors((e) => {
      if (!e[name]) return e;
      const { [name]: _drop, ...rest } = e;
      return rest;
    });
  };

  const isTransfer = values["type"] === "transfer";

  // Slices belong to one account, so the picker only ever offers that account's.
  const accountSlices = useMemo(
    () => slices.filter((s) => s.account_id === values["account_id"]),
    [slices, values],
  );
  const toAccountSlices = useMemo(
    () => slices.filter((s) => s.account_id === values["to_account_id"]),
    [slices, values],
  );

  const fromAccount = accounts.find((a) => a.id === values["account_id"]);
  const toAccount = accounts.find((a) => a.id === values["to_account_id"]);
  const fromSliceable = fromAccount
    ? fromAccount.kind === "bank" || fromAccount.kind === "cash" || fromAccount.kind === "investment"
    : false;
  const toSliceable = toAccount
    ? toAccount.kind === "bank" || toAccount.kind === "cash" || toAccount.kind === "investment"
    : false;

  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.kind === "investment"),
    [accounts],
  );

  if (!kind) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = schemas[kind].safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    const v = parsed.data as Record<string, string>;

    try {
      if (kind === "transaction") {
        const type = v["type"] as "income" | "expense" | "transfer";
        await createTransaction({
          occurred_at: v["occurred_at"]!,
          merchant: v["merchant"]!,
          descriptor: v["descriptor"] || v["merchant"]!,
          amount: paise(v["amount"]),
          type,
          account_id: v["account_id"]!,
          to_account_id: type === "transfer" ? v["to_account_id"] || null : null,
          category_id: v["category_id"]!,
          label_id: v["label_id"] ? v["label_id"] : null,
          to_label_id: type === "transfer" && v["to_label_id"] ? v["to_label_id"] : null,
          note: v["note"] ? v["note"] : null,
        });
      } else if (kind === "account") {
        await createAccount({
          name: v['name']!,
          institution: v['institution']!,
          kind: v['kind'] as Account["kind"],
          balance: paise(v['balance']),
          credit_limit: v['kind'] === "credit_card" && v['credit_limit'] ? paise(v['credit_limit']) : null,
        });
      } else if (kind === "goal") {
        await createGoal({
          name: v['name']!,
          blurb: v['blurb'] || "Saving towards this goal.",
          target: paise(v['target']),
          saved: paise(v['saved']),
          target_date: v['target_date']!,
          account_id: v['account_id']!,
          monthly_contribution: paise(v['monthly_contribution']),
        });
      } else if (kind === "budget") {
        await createBudget({
          period: v['period']!,
          category_id: v['category_id']!,
          planned: paise(v['planned']),
        });
      } else {
        await createHolding({
          name: v['name']!,
          asset_class: v['asset_class'] as
            | "equity"
            | "mutual_fund"
            | "gold"
            | "fixed_income"
            | "crypto",
          units: Number(v['units']),
          invested: paise(v['invested']),
          current_value: paise(v['current_value']),
          account_id: v['account_id']!,
        });
      }

      toast.success(`${recordLabels[kind]} added`, { description: "Your ledger has been updated." });
      onOpenChange(false);
      void router.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Failed to add ${recordLabels[kind].toLowerCase()}`, { description: message });
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="grain max-w-lg border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-2xl">New {recordLabels[kind]}</DialogTitle>
          <DialogDescription>
            Added to this session's ledger and reflected across every page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {kind === "transaction" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date" error={errors['occurred_at']}>
                  <input
                    type="date"
                    className={fieldBase}
                    value={values['occurred_at'] ?? ""}
                    onChange={(e) => set("occurred_at", e.target.value)}
                  />
                </Field>
                <Field label="Direction" error={errors['type']}>
                  <select
                    className={fieldBase}
                    value={values['type'] ?? "expense"}
                    onChange={(e) => set("type", e.target.value)}
                  >
                    <option value="expense">Money out</option>
                    <option value="income">Money in</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Merchant" error={errors['merchant']}>
                  <input
                    className={fieldBase}
                    placeholder="Blue Tokai"
                    value={values['merchant'] ?? ""}
                    onChange={(e) => set("merchant", e.target.value)}
                  />
                </Field>
                <Field label="Amount (₹)" error={errors['amount']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    placeholder="1250"
                    value={values['amount'] ?? ""}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={isTransfer ? "From account" : "Account"} error={errors["account_id"]}>
                  <select
                    className={fieldBase}
                    value={values["account_id"] ?? ""}
                    onChange={(e) => set("account_id", e.target.value)}
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {isTransfer ? (
                  <Field label="To account" error={errors["to_account_id"]}>
                    <select
                      className={fieldBase}
                      value={values["to_account_id"] ?? ""}
                      onChange={(e) => set("to_account_id", e.target.value)}
                    >
                      <option value="">Select account</option>
                      {accounts
                        .filter((a) => a.id !== values["account_id"])
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Category" error={errors["category_id"]}>
                    <select
                      className={fieldBase}
                      value={values["category_id"] ?? ""}
                      onChange={(e) => set("category_id", e.target.value)}
                    >
                      <option value="">Select category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              {isTransfer && (
                <Field label="Category" error={errors["category_id"]}>
                  <select
                    className={fieldBase}
                    value={values["category_id"] ?? ""}
                    onChange={(e) => set("category_id", e.target.value)}
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label={isTransfer ? "From slice (optional)" : "Slice (optional)"}>
                  <select
                    className={fieldBase}
                    disabled={!values["account_id"] || !fromSliceable}
                    value={values["label_id"] ?? ""}
                    onChange={(e) => set("label_id", e.target.value)}
                  >
                    <option value="">
                      {!values["account_id"]
                        ? "Pick an account first"
                        : !fromSliceable
                          ? "No slices on this account"
                          : "Whole account (unallocated)"}
                    </option>
                    {accountSlices.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {isTransfer ? (
                  <Field label="To slice (optional)">
                    <select
                      className={fieldBase}
                      disabled={!values["to_account_id"] || !toSliceable}
                      value={values["to_label_id"] ?? ""}
                      onChange={(e) => set("to_label_id", e.target.value)}
                    >
                      <option value="">
                        {!values["to_account_id"]
                          ? "Pick a destination first"
                          : !toSliceable
                            ? "No slices on this account"
                            : "Whole account (unallocated)"}
                      </option>
                      {toAccountSlices.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Description (optional)" error={errors["descriptor"]}>
                    <input
                      className={fieldBase}
                      placeholder="Order #1234"
                      value={values["descriptor"] ?? ""}
                      onChange={(e) => set("descriptor", e.target.value)}
                    />
                  </Field>
                )}
              </div>
              {isTransfer && (
                <Field label="Description (optional)" error={errors["descriptor"]}>
                  <input
                    className={fieldBase}
                    placeholder="Order #1234"
                    value={values["descriptor"] ?? ""}
                    onChange={(e) => set("descriptor", e.target.value)}
                  />
                </Field>
              )}
              <Field label="Note (optional)" error={errors["note"]}>
                <textarea
                  className={cn(fieldBase, "h-20 resize-none py-2")}
                  value={values["note"] ?? ""}
                  onChange={(e) => set("note", e.target.value)}
                />
              </Field>
            </>
          )}

          {kind === "account" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account name" error={errors['name']}>
                  <input
                    className={fieldBase}
                    placeholder="HDFC Savings"
                    value={values['name'] ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Institution" error={errors['institution']}>
                  <input
                    className={fieldBase}
                    placeholder="HDFC Bank"
                    value={values['institution'] ?? ""}
                    onChange={(e) => set("institution", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Kind" error={errors['kind']}>
                  <select
                    className={fieldBase}
                    value={values['kind'] ?? "bank"}
                    onChange={(e) => set("kind", e.target.value)}
                  >
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                    <option value="credit_card">Credit card</option>
                    <option value="investment">Investment</option>
                    <option value="loan">Loan</option>
                  </select>
                </Field>
                <Field label="Opening balance (₹)" error={errors['balance']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    placeholder="48520"
                    value={values['balance'] ?? ""}
                    onChange={(e) => set("balance", e.target.value)}
                  />
                </Field>
              </div>
              {values['kind'] === "credit_card" && (
                <Field label="Credit limit (₹)" error={errors['credit_limit']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    placeholder="250000"
                    value={values['credit_limit'] ?? ""}
                    onChange={(e) => set("credit_limit", e.target.value)}
                  />
                </Field>
              )}
            </>
          )}

          {kind === "goal" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Goal name" error={errors['name']}>
                  <input
                    className={fieldBase}
                    placeholder="Japan in Spring"
                    value={values['name'] ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Target date" error={errors['target_date']}>
                  <input
                    type="date"
                    className={fieldBase}
                    value={values['target_date'] ?? ""}
                    onChange={(e) => set("target_date", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Target amount (₹)" error={errors['target']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values['target'] ?? ""}
                    onChange={(e) => set("target", e.target.value)}
                  />
                </Field>
                <Field label="Already saved (₹)">
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values['saved'] ?? ""}
                    onChange={(e) => set("saved", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Linked account" error={errors['account_id']}>
                  <select
                    className={fieldBase}
                    value={values['account_id'] ?? ""}
                    onChange={(e) => set("account_id", e.target.value)}
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Monthly contribution (₹)" error={errors['monthly_contribution']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values['monthly_contribution'] ?? ""}
                    onChange={(e) => set("monthly_contribution", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Blurb (optional)" error={errors['blurb']}>
                <input
                  className={fieldBase}
                  placeholder="Two weeks, cherry blossom season."
                  value={values['blurb'] ?? ""}
                  onChange={(e) => set("blurb", e.target.value)}
                />
              </Field>
            </>
          )}

          {kind === "budget" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category" error={errors['category_id']}>
                <select
                  className={fieldBase}
                  value={values['category_id'] ?? ""}
                  onChange={(e) => set("category_id", e.target.value)}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Planned (₹)" error={errors['planned']}>
                <input
                  inputMode="decimal"
                  className={fieldBase}
                  value={values['planned'] ?? ""}
                  onChange={(e) => set("planned", e.target.value)}
                />
              </Field>
              <Field label="Period" error={errors['period']} className="col-span-2">
                <input
                  className={fieldBase}
                  placeholder="2026-08"
                  value={values['period'] ?? ""}
                  onChange={(e) => set("period", e.target.value)}
                />
              </Field>
            </div>
          )}

          {kind === "investment" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Holding" error={errors['name']}>
                  <input
                    className={fieldBase}
                    placeholder="Nifty 50 Index Fund"
                    value={values['name'] ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Asset class" error={errors['asset_class']}>
                  <select
                    className={fieldBase}
                    value={values['asset_class'] ?? "equity"}
                    onChange={(e) => set("asset_class", e.target.value)}
                  >
                    <option value="equity">Equity</option>
                    <option value="mutual_fund">Mutual fund</option>
                    <option value="gold">Gold</option>
                    <option value="fixed_income">Fixed income</option>
                    <option value="crypto">Crypto</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Units" error={errors['units']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values['units'] ?? ""}
                    onChange={(e) => set("units", e.target.value)}
                  />
                </Field>
                <Field label="Invested (₹)" error={errors['invested']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values['invested'] ?? ""}
                    onChange={(e) => set("invested", e.target.value)}
                  />
                </Field>
                <Field label="Current value (₹)" error={errors['current_value']}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values['current_value'] ?? ""}
                    onChange={(e) => set("current_value", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Investment account" error={errors['account_id']}>
                <select
                  className={fieldBase}
                  value={values['account_id'] ?? ""}
                  onChange={(e) => set("account_id", e.target.value)}
                >
                  <option value="">Select account</option>
                  {(investmentAccounts.length ? investmentAccounts : accounts).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
            >
              Save {recordLabels[kind].toLowerCase()}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
