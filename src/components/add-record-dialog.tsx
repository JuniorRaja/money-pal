import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Landmark,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CURRENT_PERIOD,
  TODAY,
  getAccounts,
  getCategories,
  getMerchantSuggestions,
  getSlices,
  type MerchantSuggestion,
} from "@/data/repository";
import {
  createAccount,
  createBudget,
  createGoal,
  createHolding,
  createTransaction,
} from "@/data/mutations";
import type { Account, Category, HoldingClass, Slice } from "@/data/schema";
import { BUDGETABLE_GROUPS } from "@/data/schema";
import { getCategoryIcon } from "@/lib/category-icons";
import { caretForDigits, formatAmountInput, unformatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

export type RecordKind = "transaction" | "account" | "goal" | "budget" | "investment";

export const recordLabels: Record<RecordKind, string> = {
  transaction: "Transaction",
  account: "Account",
  goal: "Goal",
  budget: "Budget",
  investment: "Investment",
};

/** The amount field is grouped as it is typed, so every read strips separators first. */
const num = (v: string | undefined) => Number(unformatAmount(v ?? ""));

const rupees = z
  .string()
  .trim()
  .refine((v) => v !== "" && Number.isFinite(num(v)) && num(v) > 0, {
    message: "Enter an amount greater than 0",
  });

const text = (max = 80) => z.string().trim().min(1, "Required").max(max, `Max ${max} characters`);
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

const schemas = {
  transaction: z
    .object({
      occurred_at: isoDate,
      account_id: text(40),
      to_account_id: z.string().optional(),
      // Required for income/expense only — enforced in superRefine below.
      // A transfer between your own accounts has no merchant to name.
      merchant: z.string().trim().max(60, "Max 60 characters"),
      descriptor: z.string().trim().max(120).optional(),
      amount: rupees,
      type: z.enum(["expense", "income", "transfer"]),
      category_id: text(40),
      label_id: z.string().optional(),
      to_label_id: z.string().optional(),
      note: z.string().trim().max(280).optional(),
    })
    .superRefine((val, ctx) => {
      if (val.type !== "transfer" && !val.merchant) {
        ctx.addIssue({ code: "custom", path: ["merchant"], message: "Required" });
      }
      if (val.type === "transfer") {
        if (!val.to_account_id?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["to_account_id"],
            message: "Pick a destination account",
          });
        } else if (val.to_account_id === val.account_id) {
          ctx.addIssue({
            code: "custom",
            path: ["to_account_id"],
            message: "Accounts must differ",
          });
        }
      }
    }),
  account: z.object({
    name: text(60),
    institution: text(60),
    kind: z.enum(["bank", "cash", "credit_card", "investment", "loan"]),
    balance: rupees,
    credit_limit: z.string().optional(),
    bill_generation_day: z.string().optional(),
    due_day: z.string().optional(),
    interest_rate_pct: z.string().optional(),
    emi_amount: z.string().optional(),
    tenure_months: z.string().optional(),
    lender: z.string().optional(),
  }),
  goal: z
    .object({
      name: text(60),
      blurb: z.string().trim().max(120).optional(),
      target: rupees,
      saved: z.string().optional(),
      target_date: z
        .string()
        .trim()
        .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a valid date"),
      account_id: z.string().optional(),
      monthly_contribution: z
        .string()
        .trim()
        .refine(
          (v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
          "Enter 0 or more",
        ),
    })
    .superRefine((val, ctx) => {
      const targetAmount = Number(val.target || 0);
      const savedAmount = Number(val.saved || 0);
      if (savedAmount > targetAmount) {
        ctx.addIssue({
          code: "custom",
          path: ["saved"],
          message: "Already saved cannot exceed target amount",
        });
      }
    }),
  budget: z.object({
    category_id: text(40),
    planned: rupees,
    period: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
  }),
  investment: z.object({
    name: text(60),
    asset_class: z.enum(["equity", "mutual_fund", "gold", "fixed_income", "crypto", "property"]),
    // Optional: blank means "price this by hand". Must be listed even so —
    // safeParse strips keys the schema does not mention, so an absent `symbol`
    // here silently drops whatever the user typed.
    symbol: z.string().trim().max(40).optional(),
    units: z
      .string()
      .trim()
      .refine((v) => Number(v) > 0, "Enter units greater than 0"),
    invested: rupees,
    current_value: rupees,
    account_id: text(40),
  }),
} as const;

const paise = (v: string | undefined) => Math.round(num(v) * 100);

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
  account: {
    name: "",
    institution: "",
    kind: "bank",
    balance: "",
    credit_limit: "",
    bill_generation_day: "",
    due_day: "",
    interest_rate_pct: "",
    emi_amount: "",
    tenure_months: "",
    lender: "",
  },
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
    symbol: "",
    units: "",
    invested: "",
    current_value: "",
    account_id: "",
  },
};

/** Icon and label per account kind, for the account picker. */
const accountKindMeta: Record<Account["kind"], { icon: LucideIcon; label: string }> = {
  bank: { icon: Landmark, label: "Bank" },
  cash: { icon: Wallet, label: "Cash" },
  credit_card: { icon: CreditCard, label: "Credit card" },
  investment: { icon: TrendingUp, label: "Investment" },
  loan: { icon: Banknote, label: "Loan" },
};

/** Order accounts are offered in — spendable first, debt last. */
const accountKindOrder: Account["kind"][] = ["bank", "cash", "credit_card", "investment", "loan"];

const txTypes = [
  { value: "income", label: "Income", icon: ArrowDownLeft, tone: "text-success" },
  { value: "expense", label: "Expense", icon: ArrowUpRight, tone: "text-destructive" },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight, tone: "text-primary" },
] as const;

/** Pill used by the slice pickers — a dropdown hides slices that exist to be seen. */
function PickChip({
  active,
  token,
  onClick,
  children,
}: {
  active: boolean;
  token?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {token && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: `var(--color-${token})` }}
        />
      )}
      {children}
    </button>
  );
}

const fieldBase =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60";

function Field({
  label,
  error,
  children,
  className,
  plain,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
  className?: string;
  /** Renders a <div>: a <label> wrapping a grid of buttons steals their clicks. */
  plain?: boolean;
}) {
  const Wrapper: "div" | "label" = plain ? "div" : "label";
  return (
    <Wrapper className={cn("block space-y-1.5", className)}>
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="block text-[11px] text-destructive">{error}</span>}
    </Wrapper>
  );
}

/**
 * Account chooser. A bare <select> hid the one thing that matters when picking
 * where money moves — whether it is a bank, cash in hand, or a credit line.
 * Scrolls inside its own box so adding accounts never grows the dialog.
 */
function AccountPicker({
  accounts,
  value,
  onChange,
  emptyHint,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  emptyHint: string;
}) {
  const ordered = useMemo(
    () =>
      [...accounts].sort(
        (a, b) => accountKindOrder.indexOf(a.kind) - accountKindOrder.indexOf(b.kind),
      ),
    [accounts],
  );

  if (ordered.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        {emptyHint}
      </p>
    );
  }

  return (
    <div data-testid="account-picker" className="max-h-[8.5rem] space-y-1.5 overflow-y-auto pr-1">
      {ordered.map((a) => {
        const meta = accountKindMeta[a.kind];
        const Icon = meta.icon;
        const active = value === a.id;
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(a.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
              active
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40 hover:bg-accent/40",
            )}
          >
            <Icon
              className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{a.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {meta.label}
                {a.institution ? ` · ${a.institution}` : ""}
              </span>
            </span>
            {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

/** One row of the category list — parents and children share it. */
function CategoryRow({
  category,
  parentName,
}: {
  category: Category;
  /** Set on child rows. Indents them, and names the parent — once a search
   *  narrows the list to one child, the group heading it sat under is gone. */
  parentName?: string | undefined;
}) {
  const Icon = getCategoryIcon(category.icon);
  return (
    <>
      <Icon
        className={cn("h-4 w-4 shrink-0", parentName && "ml-3")}
        style={{ color: `var(--color-${category.color_token})` }}
      />
      <span className="truncate">{category.name}</span>
      {parentName && (
        <span className="truncate text-xs text-muted-foreground">in {parentName}</span>
      )}
    </>
  );
}

/**
 * Type-to-filter category chooser. A flat 25-icon grid stopped being readable
 * once categories became user-defined and nested, so this searches names and
 * shows children grouped under the parent they belong to. Rendered in a
 * popover, not inline: an expanding list would resize the dialog mid-entry.
 */
function CategoryPicker({
  categories,
  value,
  onChange,
  invalid,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Children whose parent is not in this list (archived, or filed under the
  // other direction) would otherwise vanish — they surface as top-level.
  const { parents, childrenOf } = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const kids = new Map<string, Category[]>();
    const tops: Category[] = [];
    for (const c of categories) {
      const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
      if (parent) kids.set(parent.id, [...(kids.get(parent.id) ?? []), c]);
      else tops.push(c);
    }
    return { parents: tops, childrenOf: kids };
  }, [categories]);

  const selected = categories.find((c) => c.id === value);
  const selectedParent = selected?.parent_id
    ? categories.find((c) => c.id === selected.parent_id)
    : undefined;

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    // `modal`: the dialog's scroll lock preventDefaults every wheel event
    // outside its own content, which includes this portalled popover — the
    // list could only be scrolled by keyboard. A modal popover installs its
    // own lock with its content whitelisted.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          data-testid="category-picker"
          aria-expanded={open}
          className={cn(
            fieldBase,
            "flex items-center gap-2 text-left",
            invalid && "border-destructive",
          )}
        >
          {selected ? (
            <CategoryRow category={selected} parentName={selectedParent?.name} />
          ) : (
            <span className="flex-1 text-muted-foreground">Search categories…</span>
          )}
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        // The dialog traps focus; without this the popover input never gets it.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command
          // Default cmdk scoring matches the uuid we use as each item's value.
          // Only the names the user can actually see are searchable.
          filter={(_value, search, keywords) =>
            (keywords ?? []).join(" ").toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search categories…" autoFocus />
          <CommandList className="max-h-56">
            <CommandEmpty>No matching category.</CommandEmpty>
            {parents.map((parent) => {
              const kids = childrenOf.get(parent.id) ?? [];
              return (
                <CommandGroup key={parent.id}>
                  <CommandItem
                    value={parent.id}
                    keywords={[parent.name]}
                    onSelect={() => pick(parent.id)}
                    className="gap-2"
                  >
                    <CategoryRow category={parent} />
                    {value === parent.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                  </CommandItem>
                  {kids.map((kid) => (
                    <CommandItem
                      key={kid.id}
                      value={kid.id}
                      keywords={[kid.name, parent.name]}
                      onSelect={() => pick(kid.id)}
                      className="gap-2"
                    >
                      <CategoryRow category={kid} parentName={parent.name} />
                      {value === kid.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AddRecordDialog({
  kind,
  onOpenChange,
  defaultPeriod,
}: {
  kind: RecordKind | null;
  onOpenChange: (open: boolean) => void;
  defaultPeriod?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slices, setSlices] = useState<Slice[]>([]);
  const [merchants, setMerchants] = useState<MerchantSuggestion[]>([]);
  // Without this, a double-click on Save posts the ledger write twice.
  const [saving, setSaving] = useState(false);
  // Fields the user has picked themselves. History never overwrites those.
  const touched = useRef(new Set<string>());

  useEffect(() => {
    void Promise.all([getAccounts(), getCategories(), getSlices()]).then(([a, c, s]) => {
      setAccounts(a);
      setCategories(c);
      setSlices(s);
    });
    if (kind === "transaction") void getMerchantSuggestions().then(setMerchants);
  }, [kind]);

  useEffect(() => {
    if (kind) {
      setValues({
        ...defaults[kind],
        ...(kind === "budget" && defaultPeriod ? { period: defaultPeriod } : {}),
      });
      setErrors({});
      setSaving(false);
      touched.current = new Set();
    }
  }, [kind, defaultPeriod]);

  const set = (name: string, value: string) => {
    touched.current.add(name);
    // Switching account invalidates any slice picked from the previous one.
    setValues((v) => ({
      ...v,
      [name]: value,
      ...(name === "account_id" ? { label_id: "" } : {}),
      ...(name === "to_account_id" ? { to_label_id: "" } : {}),
      ...(name === "type" && value !== "transfer" ? { to_account_id: "", to_label_id: "" } : {}),
      // A category picked for one direction is wrong for the other, so it goes.
      ...(name === "type" && !categoryAllowedFor(value, v["category_id"] ?? "")
        ? { category_id: "" }
        : {}),
    }));
    setErrors((e) => {
      if (!e[name]) return e;
      const { [name]: _drop, ...rest } = e;
      return rest;
    });
  };

  const isTransfer = values["type"] === "transfer";

  const categoryAllowedFor = (type: string, categoryId: string) => {
    if (type === "transfer" || !categoryId) return true;
    const group = categories.find((c) => c.id === categoryId)?.group;
    return type === "income" ? group === "income" : group !== "income" && group !== "transfer";
  };

  // Slices belong to one account, so the picker only ever offers that account's.
  const accountSlices = useMemo(
    () => slices.filter((s) => s.account_id === values["account_id"]),
    [slices, values],
  );
  const toAccountSlices = useMemo(
    () => slices.filter((s) => s.account_id === values["to_account_id"]),
    [slices, values],
  );

  // Which kinds *can* be sliced is already settled by whether slices exist on
  // the account — one less copy of the kind list to drift out of sync.

  // Income and spend never share a category list; transfers book against the
  // dedicated transfer category rather than asking.
  const transferCategory = categories.find((c) => c.group === "transfer");
  // Archiving a category in Settings has to remove it from every picker, or
  // the archive only ever hides it from the one screen that offers the button.
  const activeCategories = useMemo(() => categories.filter((c) => !c.deleted_at), [categories]);
  const categoryOptions = useMemo(
    () =>
      values["type"] === "income"
        ? activeCategories.filter((c) => c.group === "income")
        : activeCategories.filter((c) => c.group !== "income" && c.group !== "transfer"),
    [activeCategories, values],
  );
  const selectedCategory = categories.find((c) => c.id === values["category_id"]);
  // Hidden only once there is something to hide it *for* — otherwise a user
  // with no transfer category would face a required field with no input.
  const categoryHidden = isTransfer && !!transferCategory;
  // An error hiding inside a closed <details> is an error the user never fixes.
  const detailsError = !!(errors["occurred_at"] || errors["descriptor"] || errors["note"]);

  const merchantMatch = useMemo(() => {
    const typed = (values["merchant"] ?? "").trim().toLowerCase();
    if (!typed) return undefined;
    return merchants.find((m) => m.merchant.toLowerCase() === typed);
  }, [merchants, values]);

  // Transfers carry a fixed category; fill it in as soon as categories land so
  // the hidden field is never the reason a submit fails.
  useEffect(() => {
    if (!isTransfer || !transferCategory) return;
    setValues((v) =>
      v["category_id"] === transferCategory.id ? v : { ...v, category_id: transferCategory.id },
    );
  }, [isTransfer, transferCategory]);

  // Smart defaults: what this merchant was last filed under, unless the user
  // has already answered that themselves.
  //
  // The updater must return `v` untouched when there is nothing to fill.
  // `categoryOptions` is a fresh array whenever `values` changes identity, so
  // an unconditional `{ ...v }` re-triggers this effect on its own output —
  // React caps it at "Maximum update depth exceeded" and every keystroke on a
  // known merchant burns ~50 render passes.
  useEffect(() => {
    if (!merchantMatch) return;
    setValues((v) => {
      const fitsDirection = categoryOptions.some((c) => c.id === merchantMatch.category_id);
      const fillCategory =
        !touched.current.has("category_id") &&
        !isTransfer &&
        fitsDirection &&
        v["category_id"] !== merchantMatch.category_id;
      const fillAccount =
        !touched.current.has("account_id") &&
        !!merchantMatch.account_id &&
        v["account_id"] !== merchantMatch.account_id;
      if (!fillCategory && !fillAccount) return v;

      const next = { ...v };
      if (fillCategory) next["category_id"] = merchantMatch.category_id;
      if (fillAccount) {
        next["account_id"] = merchantMatch.account_id;
        next["label_id"] = "";
      }
      return next;
    });
  }, [merchantMatch, isTransfer, categoryOptions]);

  const budgetCategories = useMemo(
    () =>
      activeCategories.filter((c) => (BUDGETABLE_GROUPS as readonly string[]).includes(c.group)),
    [activeCategories],
  );
  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.kind === "investment"),
    [accounts],
  );

  if (!kind) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsed = schemas[kind].safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    const v = parsed.data as Record<string, string>;
    setSaving(true);

    try {
      if (kind === "transaction") {
        const type = v["type"] as "income" | "expense" | "transfer";
        // A blank transfer merchant still needs a label in the ledger.
        const merchant = v["merchant"] || "Transfer";
        await createTransaction({
          occurred_at: v["occurred_at"]!,
          merchant,
          descriptor: v["descriptor"] || merchant,
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
          name: v["name"]!,
          institution: v["institution"]!,
          kind: v["kind"] as Account["kind"],
          balance: paise(v["balance"]),
          credit_limit:
            v["kind"] === "credit_card" && v["credit_limit"] ? paise(v["credit_limit"]) : null,
          bill_generation_day:
            v["kind"] === "credit_card" && v["bill_generation_day"]
              ? Number(v["bill_generation_day"])
              : null,
          due_day: v["kind"] === "credit_card" && v["due_day"] ? Number(v["due_day"]) : null,
          interest_rate_bps:
            v["kind"] === "loan" && v["interest_rate_pct"]
              ? Math.round(Number(v["interest_rate_pct"]) * 100)
              : null,
          emi_amount: v["kind"] === "loan" && v["emi_amount"] ? paise(v["emi_amount"]) : null,
          tenure_months:
            v["kind"] === "loan" && v["tenure_months"] ? Number(v["tenure_months"]) : null,
          lender: v["kind"] === "loan" ? v["lender"]?.trim() || null : null,
        });
      } else if (kind === "goal") {
        await createGoal({
          name: v["name"]!,
          blurb: v["blurb"] || "Saving towards this goal.",
          target: paise(v["target"]),
          saved: paise(v["saved"]),
          target_date: v["target_date"] || "",
          account_id: v["account_id"] || "",
          monthly_contribution: paise(v["monthly_contribution"]),
        });
      } else if (kind === "budget") {
        const result = await createBudget({
          period: v["period"]!,
          category_id: v["category_id"]!,
          planned: paise(v["planned"]),
        });
        const verb = result.wasUpdate ? "updated" : "added";
        toast.success(`Budget ${verb}`, { description: "Your ledger has been updated." });
        setSaving(false);
        onOpenChange(false);
        void router.invalidate();
        return;
      } else {
        await createHolding({
          name: v["name"]!,
          asset_class: v["asset_class"] as HoldingClass,
          units: Number(v["units"]),
          invested: paise(v["invested"]),
          current_value: paise(v["current_value"]),
          account_id: v["account_id"]!,
          symbol: v["symbol"] ?? null,
        });
      }

      toast.success(`${recordLabels[kind]} added`, {
        description: "Your ledger has been updated.",
      });
      onOpenChange(false);
      void router.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Failed to add ${recordLabels[kind].toLowerCase()}`, { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "grain border-border bg-card",
          kind === "transaction" ? "sm:max-w-3xl" : "max-w-lg",
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">New {recordLabels[kind]}</DialogTitle>
          <DialogDescription>
            Added to this session's ledger and reflected across every page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {kind === "transaction" && (
            <>
              <ToggleGroup
                type="single"
                value={values["type"] ?? "expense"}
                onValueChange={(v) => v && set("type", v)}
                className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/40 p-1"
              >
                {txTypes.map((t) => (
                  <ToggleGroupItem
                    key={t.value}
                    value={t.value}
                    aria-label={t.label}
                    className="h-9 w-full gap-1.5 rounded-lg text-xs data-[state=on]:bg-card data-[state=on]:shadow-sm"
                  >
                    <t.icon className={cn("h-3.5 w-3.5", values["type"] === t.value && t.tone)} />
                    {t.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* Two columns so the whole entry fits without scrolling, and a
                  floor on the height so switching type does not resize the
                  dialog under the pointer mid-entry. */}
              <div className="grid min-h-[19rem] gap-x-6 gap-y-4 sm:grid-cols-2">
                <div className="space-y-4">
                  <Field
                    label={`Amount${isTransfer ? "" : values["type"] === "income" ? " in" : " out"}`}
                    error={errors["amount"]}
                  >
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">
                        &#8377;
                      </span>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        autoFocus
                        className={cn(
                          fieldBase,
                          "h-16 pl-11 text-3xl font-medium tabular-nums",
                          errors["amount"] && "border-destructive",
                        )}
                        value={values["amount"] ?? ""}
                        onChange={(e) => {
                          const el = e.currentTarget;
                          const caret = el.selectionStart ?? el.value.length;
                          const digits = el.value.slice(0, caret).replace(/[^\d.]/g, "").length;
                          const next = formatAmountInput(el.value);
                          set("amount", next);
                          // React rewrites value on the next commit; put the caret back
                          // afterwards or every regroup throws it to the end of the field.
                          const pos = caretForDigits(next, digits);
                          requestAnimationFrame(() => el.setSelectionRange(pos, pos));
                        }}
                      />
                    </div>
                  </Field>

                  <Field
                    plain
                    label={isTransfer ? "From account" : "Account"}
                    error={errors["account_id"]}
                  >
                    <AccountPicker
                      accounts={accounts}
                      value={values["account_id"] ?? ""}
                      onChange={(id) => set("account_id", id)}
                      emptyHint="No accounts yet — add one first."
                    />
                  </Field>

                  {accountSlices.length > 0 && (
                    <Field plain label={isTransfer ? "From slice" : "Slice"}>
                      <div className="flex flex-wrap gap-2">
                        <PickChip active={!values["label_id"]} onClick={() => set("label_id", "")}>
                          Whole account
                        </PickChip>
                        {accountSlices.map((l) => (
                          <PickChip
                            key={l.id}
                            token={l.color_token}
                            active={values["label_id"] === l.id}
                            onClick={() => set("label_id", l.id)}
                          >
                            {l.name}
                          </PickChip>
                        ))}
                      </div>
                    </Field>
                  )}
                </div>

                <div className="space-y-4">
                  {isTransfer ? (
                    <>
                      <Field plain label="To account" error={errors["to_account_id"]}>
                        <AccountPicker
                          accounts={accounts.filter((a) => a.id !== values["account_id"])}
                          value={values["to_account_id"] ?? ""}
                          onChange={(id) => set("to_account_id", id)}
                          emptyHint="A transfer needs a second account."
                        />
                      </Field>
                      {toAccountSlices.length > 0 && (
                        <Field plain label="To slice">
                          <div className="flex flex-wrap gap-2">
                            <PickChip
                              active={!values["to_label_id"]}
                              onClick={() => set("to_label_id", "")}
                            >
                              Whole account
                            </PickChip>
                            {toAccountSlices.map((l) => (
                              <PickChip
                                key={l.id}
                                token={l.color_token}
                                active={values["to_label_id"] === l.id}
                                onClick={() => set("to_label_id", l.id)}
                              >
                                {l.name}
                              </PickChip>
                            ))}
                          </div>
                        </Field>
                      )}
                    </>
                  ) : (
                    <Field plain label="Category" error={errors["category_id"]}>
                      <CategoryPicker
                        categories={categoryOptions}
                        value={values["category_id"] ?? ""}
                        onChange={(id) => set("category_id", id)}
                        invalid={!!errors["category_id"]}
                      />
                    </Field>
                  )}

                  <Field
                    label={isTransfer ? "Merchant (optional)" : "Merchant"}
                    error={errors["merchant"]}
                  >
                    <input
                      className={fieldBase}
                      list="merchant-history"
                      autoComplete="off"
                      placeholder={isTransfer ? "Transfer" : "Blue Tokai"}
                      value={values["merchant"] ?? ""}
                      onChange={(e) => set("merchant", e.target.value)}
                    />
                    <datalist id="merchant-history">
                      {merchants.map((m) => (
                        <option key={m.merchant} value={m.merchant} />
                      ))}
                    </datalist>
                  </Field>
                  {merchantMatch && (
                    <p className="-mt-2 text-[11px] text-muted-foreground">
                      Usually{" "}
                      {categories.find((c) => c.id === merchantMatch.category_id)?.name ??
                        "uncategorised"}
                      {" · "}
                      {accounts.find((a) => a.id === merchantMatch.account_id)?.name ??
                        "unknown account"}
                      {" — from your history"}
                    </p>
                  )}

                  <Field label="Date" error={errors["occurred_at"]}>
                    <input
                      type="date"
                      className={fieldBase}
                      value={values["occurred_at"] ?? ""}
                      onChange={(e) => set("occurred_at", e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <details
                className="group rounded-lg border border-border px-3 py-2"
                open={detailsError || undefined}
              >
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  More options
                </summary>
                <div className="grid gap-4 pb-1 pt-3 sm:grid-cols-2">
                  <Field label="Description (optional)" error={errors["descriptor"]}>
                    <input
                      className={fieldBase}
                      list="descriptor-history"
                      autoComplete="off"
                      placeholder="Order #1234"
                      value={values["descriptor"] ?? ""}
                      onChange={(e) => set("descriptor", e.target.value)}
                    />
                    <datalist id="descriptor-history">
                      {(merchantMatch?.descriptors ?? []).map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Note (optional)" error={errors["note"]}>
                    <input
                      className={fieldBase}
                      value={values["note"] ?? ""}
                      onChange={(e) => set("note", e.target.value)}
                    />
                  </Field>
                </div>
              </details>
            </>
          )}

          {kind === "account" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account name" error={errors["name"]}>
                  <input
                    className={fieldBase}
                    placeholder="HDFC Savings"
                    value={values["name"] ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Institution" error={errors["institution"]}>
                  <input
                    className={fieldBase}
                    placeholder="HDFC Bank"
                    value={values["institution"] ?? ""}
                    onChange={(e) => set("institution", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Kind" error={errors["kind"]}>
                  <select
                    className={fieldBase}
                    value={values["kind"] ?? "bank"}
                    onChange={(e) => set("kind", e.target.value)}
                  >
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                    <option value="credit_card">Credit card</option>
                    <option value="investment">Investment</option>
                    <option value="loan">Loan</option>
                  </select>
                </Field>
                <Field label="Opening balance (₹)" error={errors["balance"]}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    placeholder="48520"
                    value={values["balance"] ?? ""}
                    onChange={(e) => set("balance", e.target.value)}
                  />
                </Field>
              </div>
              {values["kind"] === "credit_card" && (
                <>
                  <Field label="Credit limit (₹)" error={errors["credit_limit"]}>
                    <input
                      inputMode="decimal"
                      className={fieldBase}
                      placeholder="250000"
                      value={values["credit_limit"] ?? ""}
                      onChange={(e) => set("credit_limit", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Bill generation day" error={errors["bill_generation_day"]}>
                      <input
                        inputMode="numeric"
                        className={fieldBase}
                        placeholder="1–31"
                        value={values["bill_generation_day"] ?? ""}
                        onChange={(e) => set("bill_generation_day", e.target.value)}
                      />
                    </Field>
                    <Field label="Due day" error={errors["due_day"]}>
                      <input
                        inputMode="numeric"
                        className={fieldBase}
                        placeholder="1–31"
                        value={values["due_day"] ?? ""}
                        onChange={(e) => set("due_day", e.target.value)}
                      />
                    </Field>
                  </div>
                </>
              )}
              {values["kind"] === "loan" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Interest rate (% p.a.)" error={errors["interest_rate_pct"]}>
                      <input
                        inputMode="decimal"
                        className={fieldBase}
                        placeholder="8.5"
                        value={values["interest_rate_pct"] ?? ""}
                        onChange={(e) => set("interest_rate_pct", e.target.value)}
                      />
                    </Field>
                    <Field label="EMI (₹)" error={errors["emi_amount"]}>
                      <input
                        inputMode="decimal"
                        className={fieldBase}
                        placeholder="25000"
                        value={values["emi_amount"] ?? ""}
                        onChange={(e) => set("emi_amount", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Tenure (months)" error={errors["tenure_months"]}>
                      <input
                        inputMode="numeric"
                        className={fieldBase}
                        placeholder="36"
                        value={values["tenure_months"] ?? ""}
                        onChange={(e) => set("tenure_months", e.target.value)}
                      />
                    </Field>
                    <Field label="Lender" error={errors["lender"]}>
                      <input
                        className={fieldBase}
                        placeholder="HDFC Bank"
                        value={values["lender"] ?? ""}
                        onChange={(e) => set("lender", e.target.value)}
                      />
                    </Field>
                  </div>
                </>
              )}
            </>
          )}

          {kind === "goal" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Goal name" error={errors["name"]}>
                  <input
                    className={fieldBase}
                    placeholder="Japan in Spring"
                    value={values["name"] ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Target date" error={errors["target_date"]}>
                  <input
                    type="date"
                    className={fieldBase}
                    value={values["target_date"] ?? ""}
                    onChange={(e) => set("target_date", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Target amount (₹)" error={errors["target"]}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values["target"] ?? ""}
                    onChange={(e) => set("target", e.target.value)}
                  />
                </Field>
                <Field label="Already saved (₹)" error={errors["saved"]}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values["saved"] ?? ""}
                    onChange={(e) => set("saved", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Linked account">
                  <select
                    className={fieldBase}
                    value={values["account_id"] ?? ""}
                    onChange={(e) => set("account_id", e.target.value)}
                  >
                    <option value="">None</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Monthly plan (₹)" error={errors["monthly_contribution"]}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values["monthly_contribution"] ?? ""}
                    onChange={(e) => set("monthly_contribution", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Blurb (optional)" error={errors["blurb"]}>
                <input
                  className={fieldBase}
                  placeholder="Two weeks, cherry blossom season."
                  value={values["blurb"] ?? ""}
                  onChange={(e) => set("blurb", e.target.value)}
                />
              </Field>
            </>
          )}

          {kind === "budget" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category" error={errors["category_id"]}>
                <select
                  className={fieldBase}
                  value={values["category_id"] ?? ""}
                  onChange={(e) => set("category_id", e.target.value)}
                >
                  <option value="">Select category</option>
                  {budgetCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Planned (₹)" error={errors["planned"]}>
                <input
                  inputMode="decimal"
                  className={fieldBase}
                  value={values["planned"] ?? ""}
                  onChange={(e) => set("planned", e.target.value)}
                />
              </Field>
              <Field label="Period" error={errors["period"]} className="col-span-2">
                <input
                  className={fieldBase}
                  placeholder="2026-08"
                  value={values["period"] ?? ""}
                  onChange={(e) => set("period", e.target.value)}
                />
              </Field>
            </div>
          )}

          {kind === "investment" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Holding" error={errors["name"]}>
                  <input
                    className={fieldBase}
                    placeholder="Nifty 50 Index Fund"
                    value={values["name"] ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Asset class" error={errors["asset_class"]}>
                  <select
                    className={fieldBase}
                    value={values["asset_class"] ?? "equity"}
                    onChange={(e) => set("asset_class", e.target.value)}
                  >
                    <option value="equity">Equity</option>
                    <option value="mutual_fund">Mutual fund</option>
                    <option value="gold">Gold</option>
                    <option value="fixed_income">Fixed income</option>
                    <option value="crypto">Crypto</option>
                    <option value="property">Property</option>
                  </select>
                </Field>
              </div>

              {/* Only the two fed classes get a symbol field. Asking for a ticker
                  on a flat or an FD would collect something nothing can price. */}
              {(() => {
                const assetClass = values["asset_class"] ?? "equity";
                if (assetClass === "mutual_fund")
                  return (
                    <Field label="AMFI scheme code" error={errors["symbol"]}>
                      <input
                        className={fieldBase}
                        placeholder="122639 — leave blank to value by hand"
                        value={values["symbol"] ?? ""}
                        onChange={(e) => set("symbol", e.target.value)}
                      />
                    </Field>
                  );
                if (assetClass === "equity" || assetClass === "gold")
                  return (
                    <Field label="Ticker" error={errors["symbol"]}>
                      <input
                        className={fieldBase}
                        placeholder={
                          assetClass === "gold"
                            ? "GOLDBEES.NS — leave blank to value by hand"
                            : "RELIANCE.NS — leave blank to value by hand"
                        }
                        value={values["symbol"] ?? ""}
                        onChange={(e) => set("symbol", e.target.value)}
                      />
                    </Field>
                  );
                return null;
              })()}
              <div className="grid grid-cols-3 gap-4">
                <Field label="Units" error={errors["units"]}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values["units"] ?? ""}
                    onChange={(e) => set("units", e.target.value)}
                  />
                </Field>
                <Field label="Invested (₹)" error={errors["invested"]}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values["invested"] ?? ""}
                    onChange={(e) => set("invested", e.target.value)}
                  />
                </Field>
                <Field label="Current value (₹)" error={errors["current_value"]}>
                  <input
                    inputMode="decimal"
                    className={fieldBase}
                    value={values["current_value"] ?? ""}
                    onChange={(e) => set("current_value", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Investment account" error={errors["account_id"]}>
                <select
                  className={fieldBase}
                  value={values["account_id"] ?? ""}
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
              disabled={saving}
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] disabled:pointer-events-none disabled:opacity-60"
            >
              {saving ? "Saving…" : `Save ${recordLabels[kind].toLowerCase()}`}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
