import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Building2,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  Circle,
  CreditCard,
  Film,
  Heart,
  Home,
  Landmark,
  Laptop,
  Percent,
  PiggyBank,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { caretForDigits, formatAmountInput, formatMoney, unformatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

export type RecordKind = "transaction" | "account" | "goal" | "budget" | "investment";

export const recordLabels: Record<RecordKind, string> = {
  transaction: "Transaction",
  account: "Account",
  goal: "Goal",
  budget: "Budget",
  investment: "Investment",
};

const num = (v: string | undefined) => Number(unformatAmount(v ?? ""));

const rupees = z
  .string()
  .trim()
  .refine((v) => v !== "" && Number.isFinite(num(v)) && num(v) > 0, {
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
      target_date: z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a valid date"),
      account_id: z.string().optional(),
      monthly_contribution: z.string().trim().refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), "Enter 0 or more"),
    })
    .superRefine((val, ctx) => {
      const targetAmount = Number(val.target || 0);
      const savedAmount = Number(val.saved || 0);
      if (savedAmount > targetAmount) {
        ctx.addIssue({ code: "custom", path: ["saved"], message: "Already saved cannot exceed target amount" });
      }
    }),
  budget: z.object({
    category_id: text(40),
    planned: rupees,
    period: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
  }),
  investment: z.object({
    name: text(60),
    asset_class: z.enum(["equity", "mutual_fund", "gold", "fixed_income", "crypto", "property"]),
    symbol: z.string().trim().max(40).optional(),
    units: z.string().trim().refine((v) => Number(v) > 0, "Enter units greater than 0"),
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
    name: "", institution: "", kind: "bank", balance: "",
    credit_limit: "", bill_generation_day: "", due_day: "",
    interest_rate_pct: "", emi_amount: "", tenure_months: "", lender: "",
  },
  goal: { name: "", blurb: "", target: "", saved: "", target_date: "", account_id: "", monthly_contribution: "" },
  budget: { category_id: "", planned: "", period: CURRENT_PERIOD },
  investment: { name: "", asset_class: "equity", symbol: "", units: "", invested: "", current_value: "", account_id: "" },
};

/** Category icon mapping - keys match the `icon` column in `categories` table */
const categoryIcons: Record<string, LucideIcon> = {
  // Income
  banknote: Banknote,
  laptop: Laptop,
  percent: Percent,
  // Essentials
  "shopping-cart": ShoppingCart,
  home: Home,
  zap: Zap,
  car: Car,
  heart: Heart,
  "credit-card": CreditCard,
  // Lifestyle
  utensils: Utensils,
  "shopping-bag": ShoppingBag,
  film: Film,
  plane: Plane,
  // Transfer & Investment
  "arrow-left-right": ArrowLeftRight,
  "trending-up": TrendingUp,
  // Fallbacks for common variants (case-insensitive DB values or alternate names)
  Banknote: Banknote,
  Laptop: Laptop,
  Percent: Percent,
  ShoppingCart: ShoppingCart,
  Home: Home,
  Zap: Zap,
  Car: Car,
  Heart: Heart,
  CreditCard: CreditCard,
  Utensils: Utensils,
  ShoppingBag: ShoppingBag,
  Film: Film,
  Plane: Plane,
  ArrowLeftRight: ArrowLeftRight,
  TrendingUp: TrendingUp,
};

const txTypes = [
  { value: "expense", label: "Expense", icon: ArrowUpRight, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/40", activeBg: "bg-rose-500" },
  { value: "income", label: "Income", icon: ArrowDownLeft, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/40", activeBg: "bg-emerald-500" },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/40", activeBg: "bg-blue-500" },
] as const;

const accountKinds = [
  { value: "bank", label: "Bank", icon: Landmark, desc: "Savings or current" },
  { value: "cash", label: "Cash", icon: Wallet, desc: "Physical wallet" },
  { value: "credit_card", label: "Credit Card", icon: CreditCard, desc: "Credit line" },
  { value: "investment", label: "Investment", icon: TrendingUp, desc: "Demat, brokerage" },
  { value: "loan", label: "Loan", icon: Building2, desc: "Home, car, personal" },
] as const;

const assetClasses = [
  { value: "equity", label: "Stocks", icon: TrendingUp },
  { value: "mutual_fund", label: "Mutual Funds", icon: PiggyBank },
  { value: "gold", label: "Gold", icon: Sparkles },
  { value: "fixed_income", label: "Fixed Income", icon: Landmark },
  { value: "crypto", label: "Crypto", icon: Zap },
  { value: "property", label: "Property", icon: Home },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED UI COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function Chip({ active, token, onClick, children, className }: {
  active: boolean; token?: string; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
        active ? "border-primary bg-primary/10 text-foreground shadow-sm" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
        className,
      )}
    >
      {token && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--color-${token})` }} />}
      {children}
    </button>
  );
}

function VisualOption({ icon: Icon, label, desc, active, onClick, className }: {
  icon: LucideIcon; label: string; desc?: string; active: boolean; onClick: () => void; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-center transition-all duration-200",
        active ? "border-primary bg-primary/5 shadow-sm" : "border-transparent bg-muted/30 hover:border-primary/30 hover:bg-muted/50",
        className,
      )}
    >
      {active && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
      <Icon className={cn("h-4 w-4 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      <span className={cn("text-[10px] font-medium leading-tight", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      {desc && <span className="text-[9px] text-muted-foreground/70 leading-tight hidden sm:block">{desc}</span>}
    </button>
  );
}

function MiniField({ label, error, children, className }: {
  label: string; error?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {error && <span className="block text-[10px] text-destructive">{error}</span>}
    </label>
  );
}

const inputClass = "h-10 w-full rounded-lg border border-border/60 bg-muted/20 px-3 text-sm outline-none transition-colors focus:border-primary/50 focus:bg-background";
const selectClass = cn(inputClass, "appearance-none cursor-pointer");

function OptionalSection({ label, children, defaultOpen = false }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground">
        <span>{label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div className={cn("overflow-hidden transition-all duration-200", open ? "max-h-96 opacity-100" : "max-h-0 opacity-0")}>
        <div className="space-y-3 border-t border-border/50 p-4">{children}</div>
      </div>
    </div>
  );
}

function GoalProgress({ target, saved }: { target: number; saved: number }) {
  const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Progress</span>
        <span className="font-medium">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatMoney(saved * 100, { whole: true })}</span>
        <span>{formatMoney(target * 100, { whole: true })}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRANSACTION FORM - STEP-BASED WITH ANIMATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

type TxStep = "type" | "account" | "category" | "details";

function StepIndicator({ current, steps }: { current: TxStep; steps: TxStep[] }) {
  const idx = steps.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1.5 py-2">
      {steps.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === idx ? "w-6 bg-primary" : i < idx ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

/** Animated container for step transitions */
function StepContainer({ children, direction }: { children: React.ReactNode; direction: "forward" | "backward" }) {
  return (
    <div
      className={cn(
        "animate-in duration-500 ease-out",
        direction === "forward"
          ? "slide-in-from-right-8 fade-in"
          : "slide-in-from-left-8 fade-in"
      )}
    >
      {children}
    </div>
  );
}

function TransactionForm({
  values,
  errors,
  set,
  accounts,
  categories,
  slices,
  merchants,
  onSubmit,
  onCancel,
  saving,
}: {
  values: Record<string, string>;
  errors: Record<string, string>;
  set: (name: string, value: string) => void;
  accounts: Account[];
  categories: Category[];
  slices: Slice[];
  merchants: MerchantSuggestion[];
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [step, setStep] = useState<TxStep>("type");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [selectedParentCategory, setSelectedParentCategory] = useState<string | null>(null);
  const [categoryDirection, setCategoryDirection] = useState<"forward" | "backward">("forward");
  const amountRef = useRef<HTMLInputElement>(null);

  const isTransfer = values.type === "transfer";
  const transferCategory = categories.find((c) => c.group === "transfer");

  // Build parent-child category hierarchy
  const parentCategories = useMemo(() => {
    const filtered = values.type === "income"
      ? categories.filter((c) => c.group === "income" && !c.parent_id)
      : categories.filter((c) => c.group !== "income" && c.group !== "transfer" && !c.parent_id);
    return filtered;
  }, [categories, values.type]);

  const childCategories = useMemo(() => {
    if (!selectedParentCategory) return [];
    return categories.filter((c) => c.parent_id === selectedParentCategory);
  }, [categories, selectedParentCategory]);

  // Get slices for the selected account
  const accountSlices = useMemo(
    () => slices.filter((s) => s.account_id === values.account_id),
    [slices, values.account_id]
  );
  const toAccountSlices = useMemo(
    () => slices.filter((s) => s.account_id === values.to_account_id),
    [slices, values.to_account_id]
  );

  // Auto-fill transfer category
  useEffect(() => {
    if (isTransfer && transferCategory && values.category_id !== transferCategory.id) {
      set("category_id", transferCategory.id);
    }
  }, [isTransfer, transferCategory, values.category_id, set]);

  const goTo = (nextStep: TxStep) => {
    const steps: TxStep[] = ["type", "account", "category", "details"];
    const currentIdx = steps.indexOf(step);
    const nextIdx = steps.indexOf(nextStep);
    setDirection(nextIdx > currentIdx ? "forward" : "backward");
    setStep(nextStep);
  };

  const canProceedFromType = !!values.type;
  const canProceedFromAccount = !!values.account_id && (!isTransfer || !!values.to_account_id);
  const canProceedFromCategory = isTransfer || !!values.category_id;

  const currentTxType = txTypes.find((t) => t.value === values.type) ?? txTypes[0];
  const steps: TxStep[] = isTransfer ? ["type", "account", "details"] : ["type", "account", "category", "details"];

  // Find selected category name for display
  const selectedCategory = categories.find((c) => c.id === values.category_id);
  const selectedParent = categories.find((c) => c.id === selectedParentCategory);

  return (
    <div className="flex flex-col">
      {/* Header with back button */}
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
        {step !== "type" && (
          <button
            type="button"
            onClick={() => {
              const idx = steps.indexOf(step);
              if (idx > 0) goTo(steps[idx - 1]);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            {step === "type" && "New Transaction"}
            {step === "account" && (isTransfer ? "Select Accounts" : "Select Account")}
            {step === "category" && "Select Category"}
            {step === "details" && "Transaction Details"}
          </h2>
          <StepIndicator current={step} steps={steps} />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {/* STEP 1: Transaction Type */}
        {step === "type" && (
          <StepContainer direction={direction}>
            <div className="space-y-6">
              <p className="text-center text-sm text-muted-foreground">What kind of transaction is this?</p>
              <div className="flex flex-col gap-3">
                {txTypes.map((t) => {
                  const active = values.type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set("type", t.value)}
                      className={cn(
                        "flex items-center gap-4 rounded-xl border-2 p-4 transition-all duration-200",
                        active ? `${t.border} ${t.bg}` : "border-transparent bg-muted/30 hover:bg-muted/50"
                      )}
                    >
                      <span className={cn("flex h-12 w-12 items-center justify-center rounded-full transition-colors", active ? t.activeBg : "bg-muted")}>
                        <t.icon className={cn("h-6 w-6", active ? "text-white" : "text-muted-foreground")} />
                      </span>
                      <div className="flex-1 text-left">
                        <span className={cn("block text-base font-medium", active ? "text-foreground" : "text-muted-foreground")}>{t.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t.value === "expense" && "Money going out"}
                          {t.value === "income" && "Money coming in"}
                          {t.value === "transfer" && "Move between accounts"}
                        </span>
                      </div>
                      {active && <Check className={cn("h-5 w-5", t.color)} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </StepContainer>
        )}

        {/* STEP 2: Account Selection */}
        {step === "account" && (
          <StepContainer direction={direction}>
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm font-medium">{isTransfer ? "From which account?" : "Which account?"}</p>
                <div className="grid grid-cols-1 gap-2">
                  {accounts.map((a) => {
                    const active = values.account_id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => set("account_id", a.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200",
                          active ? "border-primary bg-primary/5" : "border-transparent bg-muted/30 hover:bg-muted/50"
                        )}
                      >
                        <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", active ? "bg-primary/10" : "bg-muted")}>
                          <Landmark className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="block font-medium truncate">{a.name}</span>
                          <span className="block text-xs text-muted-foreground">{a.institution}</span>
                        </div>
                        {active && <Check className="h-5 w-5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {errors.account_id && <p className="text-xs text-destructive">{errors.account_id}</p>}
              </div>

              {/* Slice selection */}
              {accountSlices.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{isTransfer ? "From slice (optional)" : "Slice (optional)"}</p>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={!values.label_id} onClick={() => set("label_id", "")}>Full account</Chip>
                    {accountSlices.map((s) => (
                      <Chip key={s.id} token={s.color_token} active={values.label_id === s.id} onClick={() => set("label_id", s.id)}>
                        {s.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {/* Transfer destination */}
              {isTransfer && (
                <>
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-border" />
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">To which account?</p>
                    <div className="grid grid-cols-1 gap-2">
                      {accounts.filter((a) => a.id !== values.account_id).map((a) => {
                        const active = values.to_account_id === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => set("to_account_id", a.id)}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200",
                              active ? "border-primary bg-primary/5" : "border-transparent bg-muted/30 hover:bg-muted/50"
                            )}
                          >
                            <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", active ? "bg-primary/10" : "bg-muted")}>
                              <Landmark className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="block font-medium truncate">{a.name}</span>
                              <span className="block text-xs text-muted-foreground">{a.institution}</span>
                            </div>
                            {active && <Check className="h-5 w-5 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                    {errors.to_account_id && <p className="text-xs text-destructive">{errors.to_account_id}</p>}
                  </div>

                  {toAccountSlices.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">To slice (optional)</p>
                      <div className="flex flex-wrap gap-2">
                        <Chip active={!values.to_label_id} onClick={() => set("to_label_id", "")}>Full account</Chip>
                        {toAccountSlices.map((s) => (
                          <Chip key={s.id} token={s.color_token} active={values.to_label_id === s.id} onClick={() => set("to_label_id", s.id)}>
                            {s.name}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </StepContainer>
        )}

        {/* STEP 3: Category Selection (Parent → Child hierarchy) */}
        {step === "category" && !isTransfer && (
          <StepContainer direction={direction}>
            <div className="space-y-4">
              <div
                key={selectedParentCategory ?? "parents"}
                className={cn(
                  "animate-in duration-500 ease-out space-y-4",
                  categoryDirection === "forward"
                    ? "slide-in-from-right-6 fade-in"
                    : "slide-in-from-left-6 fade-in"
                )}
              >
                {!selectedParentCategory ? (
                  <>
                    <p className="text-sm text-muted-foreground">Select a category</p>
                    <div className="grid grid-cols-2 gap-2">
                      {parentCategories.map((c) => {
                        const Icon = categoryIcons[c.icon] ?? Circle;
                        const hasChildren = categories.some((child) => child.parent_id === c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              if (hasChildren) {
                                setCategoryDirection("forward");
                                setSelectedParentCategory(c.id);
                              } else {
                                set("category_id", c.id);
                                goTo("details");
                              }
                            }}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200",
                              values.category_id === c.id
                                ? "border-primary bg-primary/5"
                                : "border-transparent bg-muted/30 hover:bg-muted/50"
                            )}
                          >
                            <span
                              className="flex h-10 w-10 items-center justify-center rounded-lg"
                              style={{ backgroundColor: `var(--color-${c.color_token})20` }}
                            >
                              <Icon className="h-5 w-5" style={{ color: `var(--color-${c.color_token})` }} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="block text-sm font-medium truncate">{c.name}</span>
                              {hasChildren && <span className="block text-[10px] text-muted-foreground">Tap to see options</span>}
                            </div>
                            {hasChildren && <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryDirection("backward");
                        setSelectedParentCategory(null);
                      }}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back to categories
                    </button>
                    <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
                      {selectedParent && (
                        <>
                          {(() => {
                            const Icon = categoryIcons[selectedParent.icon] ?? Circle;
                            return (
                              <span
                                className="flex h-10 w-10 items-center justify-center rounded-lg"
                                style={{ backgroundColor: `var(--color-${selectedParent.color_token})20` }}
                              >
                                <Icon className="h-5 w-5" style={{ color: `var(--color-${selectedParent.color_token})` }} />
                              </span>
                            );
                          })()}
                          <span className="font-medium">{selectedParent.name}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Select a subcategory</p>
                    <div className="grid grid-cols-2 gap-2">
                      {childCategories.map((c) => {
                        const Icon = categoryIcons[c.icon] ?? Circle;
                        const active = values.category_id === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              set("category_id", c.id);
                              goTo("details");
                            }}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200",
                              active ? "border-primary bg-primary/5" : "border-transparent bg-muted/30 hover:bg-muted/50"
                            )}
                          >
                            <span
                              className="flex h-9 w-9 items-center justify-center rounded-lg"
                              style={{ backgroundColor: `var(--color-${c.color_token})20` }}
                            >
                              <Icon className="h-4 w-4" style={{ color: `var(--color-${c.color_token})` }} />
                            </span>
                            <span className="block text-sm font-medium truncate flex-1">{c.name}</span>
                            {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              {errors.category_id && <p className="text-xs text-destructive">{errors.category_id}</p>}
            </div>
          </StepContainer>
        )}

        {/* STEP 4: Transaction Details (Amount, Merchant, etc.) */}
        {step === "details" && (
          <StepContainer direction={direction}>
            <div className="space-y-4">
              {/* Summary of selections */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 p-3 text-xs">
                <span className={cn("rounded-full px-2 py-1 font-medium", currentTxType.bg, currentTxType.color)}>
                  {currentTxType.label}
                </span>
                <span className="text-muted-foreground">from</span>
                <span className="font-medium">{accounts.find((a) => a.id === values.account_id)?.name}</span>
                {isTransfer && (
                  <>
                    <span className="text-muted-foreground">to</span>
                    <span className="font-medium">{accounts.find((a) => a.id === values.to_account_id)?.name}</span>
                  </>
                )}
                {selectedCategory && !isTransfer && (
                  <>
                    <span className="text-muted-foreground">in</span>
                    <span className="font-medium">{selectedCategory.name}</span>
                  </>
                )}
              </div>

              {/* Amount - Hero input */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground/60">&#8377;</span>
                  <input
                    ref={amountRef}
                    inputMode="decimal"
                    autoComplete="off"
                    autoFocus
                    placeholder="0"
                    className={cn(
                      "h-16 w-full rounded-xl border bg-muted/20 pl-12 pr-4 text-3xl font-semibold tabular-nums outline-none transition-all",
                      "focus:border-primary/50 focus:bg-background",
                      errors.amount ? "border-destructive" : "border-border/60"
                    )}
                    value={values.amount ?? ""}
                    onChange={(e) => {
                      const el = e.currentTarget;
                      const caret = el.selectionStart ?? el.value.length;
                      const digits = el.value.slice(0, caret).replace(/[^\d.]/g, "").length;
                      const next = formatAmountInput(el.value);
                      set("amount", next);
                      const pos = caretForDigits(next, digits);
                      requestAnimationFrame(() => el.setSelectionRange(pos, pos));
                    }}
                  />
                </div>
                {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
              </div>

              {/* Merchant */}
              <MiniField label="Merchant / Payee" error={errors.merchant}>
                <input
                  className={inputClass}
                  list="merchant-history"
                  autoComplete="off"
                  placeholder={isTransfer ? "Transfer" : values.type === "income" ? "Employer, client..." : "Swiggy, Amazon, Uber..."}
                  value={values.merchant ?? ""}
                  onChange={(e) => set("merchant", e.target.value)}
                />
                <datalist id="merchant-history">
                  {merchants.map((m) => (
                    <option key={m.merchant} value={m.merchant} />
                  ))}
                </datalist>
              </MiniField>

              {/* Optional details */}
              <OptionalSection label="More details">
                <MiniField label="Date" error={errors.occurred_at}>
                  <input
                    type="date"
                    className={inputClass}
                    value={values.occurred_at ?? ""}
                    onChange={(e) => set("occurred_at", e.target.value)}
                  />
                </MiniField>
                <MiniField label="Description">
                  <input
                    className={inputClass}
                    placeholder="Order #1234"
                    value={values.descriptor ?? ""}
                    onChange={(e) => set("descriptor", e.target.value)}
                  />
                </MiniField>
                <MiniField label="Note">
                  <textarea
                    className={cn(inputClass, "h-16 resize-none py-2")}
                    placeholder="Any additional notes..."
                    value={values.note ?? ""}
                    onChange={(e) => set("note", e.target.value)}
                  />
                </MiniField>
              </OptionalSection>
            </div>
          </StepContainer>
        )}
      </div>

      {/* Footer with navigation */}
      <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Cancel
        </button>
        <div className="flex gap-2">
          {step !== "details" ? (
            <button
              type="button"
              onClick={() => {
                const idx = steps.indexOf(step);
                if (idx < steps.length - 1) {
                  // Special handling for category step - skip if transfer
                  goTo(steps[idx + 1]);
                }
              }}
              disabled={
                (step === "type" && !canProceedFromType) ||
                (step === "account" && !canProceedFromAccount) ||
                (step === "category" && !canProceedFromCategory)
              }
              className={cn(
                "h-10 rounded-xl px-6 text-sm font-semibold transition-all duration-200",
                "bg-primary text-primary-foreground shadow-sm",
                "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className={cn(
                "h-10 rounded-xl px-6 text-sm font-semibold transition-all duration-200",
                "bg-primary text-primary-foreground shadow-sm",
                "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              {saving ? "Saving..." : "Add transaction"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN DIALOG COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

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
  const [saving, setSaving] = useState(false);
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
      const initial = {
        ...defaults[kind],
        ...(kind === "budget" && defaultPeriod ? { period: defaultPeriod } : {}),
      };
      setValues(initial);
      setErrors({});
      touched.current = new Set();
    }
  }, [kind, defaultPeriod]);

  const set = useCallback((name: string, value: string) => {
    touched.current.add(name);
    setValues((v) => {
      const next = { ...v, [name]: value };
      if (name === "account_id") next.label_id = "";
      if (name === "to_account_id") next.to_label_id = "";
      if (name === "type" && value !== "transfer") {
        next.to_account_id = "";
        next.to_label_id = "";
      }
      return next;
    });
    setErrors((e) => {
      if (!e[name]) return e;
      const { [name]: _, ...rest } = e;
      return rest;
    });
  }, []);

  const budgetCategories = useMemo(
    () => categories.filter((c) => (BUDGETABLE_GROUPS as readonly string[]).includes(c.group)),
    [categories]
  );
  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.kind === "investment"),
    [accounts]
  );

  if (!kind) return null;

  const submit = async () => {
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
        const type = v.type as "income" | "expense" | "transfer";
        await createTransaction({
          occurred_at: v.occurred_at!,
          merchant: v.merchant!,
          descriptor: v.descriptor || v.merchant!,
          amount: paise(v.amount),
          type,
          account_id: v.account_id!,
          to_account_id: type === "transfer" ? v.to_account_id || null : null,
          category_id: v.category_id!,
          label_id: v.label_id || null,
          to_label_id: type === "transfer" && v.to_label_id ? v.to_label_id : null,
          note: v.note || null,
        });
      } else if (kind === "account") {
        await createAccount({
          name: v.name!,
          institution: v.institution!,
          kind: v.kind as Account["kind"],
          balance: paise(v.balance),
          credit_limit: v.kind === "credit_card" && v.credit_limit ? paise(v.credit_limit) : null,
          bill_generation_day: v.kind === "credit_card" && v.bill_generation_day ? Number(v.bill_generation_day) : null,
          due_day: v.kind === "credit_card" && v.due_day ? Number(v.due_day) : null,
          interest_rate_bps: v.kind === "loan" && v.interest_rate_pct ? Math.round(Number(v.interest_rate_pct) * 100) : null,
          emi_amount: v.kind === "loan" && v.emi_amount ? paise(v.emi_amount) : null,
          tenure_months: v.kind === "loan" && v.tenure_months ? Number(v.tenure_months) : null,
          lender: v.kind === "loan" ? v.lender?.trim() || null : null,
        });
      } else if (kind === "goal") {
        await createGoal({
          name: v.name!,
          blurb: v.blurb || "Saving towards this goal.",
          target: paise(v.target),
          saved: paise(v.saved),
          target_date: v.target_date || "",
          account_id: v.account_id || "",
          monthly_contribution: paise(v.monthly_contribution),
        });
      } else if (kind === "budget") {
        const result = await createBudget({
          period: v.period!,
          category_id: v.category_id!,
          planned: paise(v.planned),
        });
        const verb = result.wasUpdate ? "updated" : "added";
        toast.success(`Budget ${verb}`, { description: "Your ledger has been updated." });
        onOpenChange(false);
        void router.invalidate();
        setSaving(false);
        return;
      } else {
        await createHolding({
          name: v.name!,
          asset_class: v.asset_class as HoldingClass,
          units: Number(v.units),
          invested: paise(v.invested),
          current_value: paise(v.current_value),
          account_id: v.account_id!,
          symbol: v.symbol ?? null,
        });
      }

      toast.success(`${recordLabels[kind]} added`, { description: "Your ledger has been updated." });
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
      <DialogContent className={cn(
        "grain border-border bg-card p-0 overflow-hidden",
        kind === "transaction"
          ? "max-w-md h-[min(600px,85vh)] flex flex-col"
          : "max-w-md max-h-[85vh] overflow-y-auto"
      )}>
        {/* TRANSACTION FORM - Step-based */}
        {kind === "transaction" && (
          <TransactionForm
            values={values}
            errors={errors}
            set={set}
            accounts={accounts}
            categories={categories}
            slices={slices}
            merchants={merchants}
            onSubmit={submit}
            onCancel={() => onOpenChange(false)}
            saving={saving}
          />
        )}

        {/* ACCOUNT FORM */}
        {kind === "account" && (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="p-6 space-y-5">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Landmark className="h-5 w-5 text-primary" />
                New Account
              </DialogTitle>
              <DialogDescription>Add a bank, wallet, or credit line</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-5 gap-2">
              {accountKinds.map((k) => (
                <VisualOption
                  key={k.value}
                  icon={k.icon}
                  label={k.label}
                  active={values.kind === k.value}
                  onClick={() => set("kind", k.value)}
                />
              ))}
            </div>

            <div className="space-y-3">
              <MiniField label="Account name" error={errors.name}>
                <input className={inputClass} placeholder="HDFC Savings" value={values.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus />
              </MiniField>
              <MiniField label="Institution" error={errors.institution}>
                <input className={inputClass} placeholder="HDFC Bank" value={values.institution ?? ""} onChange={(e) => set("institution", e.target.value)} />
              </MiniField>
              <MiniField label="Current balance" error={errors.balance}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">&#8377;</span>
                  <input inputMode="decimal" className={cn(inputClass, "pl-7")} placeholder="50,000" value={values.balance ?? ""} onChange={(e) => set("balance", formatAmountInput(e.target.value))} />
                </div>
              </MiniField>
            </div>

            {values.kind === "credit_card" && (
              <OptionalSection label="Credit card details" defaultOpen>
                <MiniField label="Credit limit">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">&#8377;</span>
                    <input inputMode="decimal" className={cn(inputClass, "pl-7")} placeholder="2,00,000" value={values.credit_limit ?? ""} onChange={(e) => set("credit_limit", formatAmountInput(e.target.value))} />
                  </div>
                </MiniField>
                <div className="grid grid-cols-2 gap-3">
                  <MiniField label="Bill day">
                    <input inputMode="numeric" className={inputClass} placeholder="1-31" value={values.bill_generation_day ?? ""} onChange={(e) => set("bill_generation_day", e.target.value)} />
                  </MiniField>
                  <MiniField label="Due day">
                    <input inputMode="numeric" className={inputClass} placeholder="1-31" value={values.due_day ?? ""} onChange={(e) => set("due_day", e.target.value)} />
                  </MiniField>
                </div>
              </OptionalSection>
            )}

            {values.kind === "loan" && (
              <OptionalSection label="Loan details" defaultOpen>
                <div className="grid grid-cols-2 gap-3">
                  <MiniField label="Interest rate (% p.a.)">
                    <input inputMode="decimal" className={inputClass} placeholder="8.5" value={values.interest_rate_pct ?? ""} onChange={(e) => set("interest_rate_pct", e.target.value)} />
                  </MiniField>
                  <MiniField label="EMI">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">&#8377;</span>
                      <input inputMode="decimal" className={cn(inputClass, "pl-7")} placeholder="25,000" value={values.emi_amount ?? ""} onChange={(e) => set("emi_amount", formatAmountInput(e.target.value))} />
                    </div>
                  </MiniField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniField label="Tenure (months)">
                    <input inputMode="numeric" className={inputClass} placeholder="36" value={values.tenure_months ?? ""} onChange={(e) => set("tenure_months", e.target.value)} />
                  </MiniField>
                  <MiniField label="Lender">
                    <input className={inputClass} placeholder="Bank name" value={values.lender ?? ""} onChange={(e) => set("lender", e.target.value)} />
                  </MiniField>
                </div>
              </OptionalSection>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="h-10 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                {saving ? "Saving..." : "Add account"}
              </button>
            </div>
          </form>
        )}

        {/* GOAL FORM */}
        {kind === "goal" && (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="p-6 space-y-5">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Target className="h-5 w-5 text-primary" />
                New Goal
              </DialogTitle>
              <DialogDescription>Set a savings target to work towards</DialogDescription>
            </DialogHeader>

            <MiniField label="What are you saving for?" error={errors.name}>
              <input className={cn(inputClass, "text-base")} placeholder="Japan trip, Emergency fund, New laptop..." value={values.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus />
            </MiniField>

            <div className="rounded-xl bg-gradient-to-br from-primary/5 to-transparent p-4">
              <MiniField label="Target amount" error={errors.target}>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl text-muted-foreground/60">&#8377;</span>
                  <input inputMode="decimal" className="w-full bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/30" placeholder="0" value={values.target ?? ""} onChange={(e) => set("target", formatAmountInput(e.target.value))} />
                </div>
              </MiniField>
              {num(values.target) > 0 && <div className="mt-3"><GoalProgress target={num(values.target)} saved={num(values.saved)} /></div>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniField label="Already saved">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">&#8377;</span>
                  <input inputMode="decimal" className={cn(inputClass, "pl-7")} placeholder="0" value={values.saved ?? ""} onChange={(e) => set("saved", formatAmountInput(e.target.value))} />
                </div>
              </MiniField>
              <MiniField label="Target date">
                <input type="date" className={inputClass} value={values.target_date ?? ""} onChange={(e) => set("target_date", e.target.value)} />
              </MiniField>
            </div>

            <OptionalSection label="Saving plan">
              <div className="grid grid-cols-2 gap-3">
                <MiniField label="Monthly contribution">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">&#8377;</span>
                    <input inputMode="decimal" className={cn(inputClass, "pl-7")} placeholder="5,000" value={values.monthly_contribution ?? ""} onChange={(e) => set("monthly_contribution", formatAmountInput(e.target.value))} />
                  </div>
                </MiniField>
                <MiniField label="Link to account">
                  <select className={selectClass} value={values.account_id ?? ""} onChange={(e) => set("account_id", e.target.value)}>
                    <option value="">None</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </MiniField>
              </div>
              <MiniField label="Description (optional)">
                <input className={inputClass} placeholder="Two weeks in spring..." value={values.blurb ?? ""} onChange={(e) => set("blurb", e.target.value)} />
              </MiniField>
            </OptionalSection>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="h-10 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                {saving ? "Saving..." : "Add goal"}
              </button>
            </div>
          </form>
        )}

        {/* BUDGET FORM */}
        {kind === "budget" && (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="p-6 space-y-5">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <PiggyBank className="h-5 w-5 text-primary" />
                New Budget
              </DialogTitle>
              <DialogDescription>Set a spending limit for a category</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Category</span>
              <div className="grid grid-cols-4 gap-2">
                {budgetCategories.slice(0, 8).map((c) => {
                  const Icon = categoryIcons[c.icon] ?? Circle;
                  const active = values.category_id === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => set("category_id", c.id)} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all duration-200", active ? "border-primary bg-primary/5" : "border-transparent bg-muted/30 hover:border-primary/30")}>
                      <Icon className="h-5 w-5" style={{ color: active ? `var(--color-${c.color_token})` : undefined }} />
                      <span className="text-[10px] font-medium truncate w-full text-center">{c.name}</span>
                    </button>
                  );
                })}
              </div>
              {budgetCategories.length > 8 && (
                <select className={selectClass} value={budgetCategories.slice(8).some((c) => c.id === values.category_id) ? values.category_id : ""} onChange={(e) => e.target.value && set("category_id", e.target.value)}>
                  <option value="">More categories...</option>
                  {budgetCategories.slice(8).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {errors.category_id && <p className="text-xs text-destructive">{errors.category_id}</p>}
            </div>

            <div className="rounded-xl bg-gradient-to-br from-primary/5 to-transparent p-4">
              <MiniField label="Monthly limit" error={errors.planned}>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl text-muted-foreground/60">&#8377;</span>
                  <input inputMode="decimal" className="w-full bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/30" placeholder="0" value={values.planned ?? ""} onChange={(e) => set("planned", formatAmountInput(e.target.value))} autoFocus />
                </div>
              </MiniField>
            </div>

            <MiniField label="Period" error={errors.period}>
              <input className={inputClass} placeholder="2026-08" value={values.period ?? ""} onChange={(e) => set("period", e.target.value)} />
            </MiniField>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="h-10 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                {saving ? "Saving..." : "Add budget"}
              </button>
            </div>
          </form>
        )}

        {/* INVESTMENT FORM */}
        {kind === "investment" && (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="p-6 space-y-5">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-5 w-5 text-primary" />
                New Investment
              </DialogTitle>
              <DialogDescription>Track a stock, fund, or other asset</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2">
              {assetClasses.map((a) => (
                <VisualOption key={a.value} icon={a.icon} label={a.label} active={values.asset_class === a.value} onClick={() => set("asset_class", a.value)} />
              ))}
            </div>

            <MiniField label="Holding name" error={errors.name}>
              <input className={inputClass} placeholder="Nifty 50 Index Fund" value={values.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus />
            </MiniField>

            {(values.asset_class === "equity" || values.asset_class === "mutual_fund" || values.asset_class === "gold") && (
              <MiniField label={values.asset_class === "mutual_fund" ? "AMFI scheme code" : "Ticker symbol"} error={errors.symbol}>
                <input className={inputClass} placeholder={values.asset_class === "mutual_fund" ? "122639 (optional for auto-pricing)" : "RELIANCE.NS (optional for auto-pricing)"} value={values.symbol ?? ""} onChange={(e) => set("symbol", e.target.value)} />
              </MiniField>
            )}

            <div className="grid grid-cols-3 gap-3">
              <MiniField label="Units" error={errors.units}>
                <input inputMode="decimal" className={inputClass} placeholder="100" value={values.units ?? ""} onChange={(e) => set("units", e.target.value)} />
              </MiniField>
              <MiniField label="Invested" error={errors.invested}>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#8377;</span>
                  <input inputMode="decimal" className={cn(inputClass, "pl-5")} placeholder="50,000" value={values.invested ?? ""} onChange={(e) => set("invested", formatAmountInput(e.target.value))} />
                </div>
              </MiniField>
              <MiniField label="Current value" error={errors.current_value}>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#8377;</span>
                  <input inputMode="decimal" className={cn(inputClass, "pl-5")} placeholder="55,000" value={values.current_value ?? ""} onChange={(e) => set("current_value", formatAmountInput(e.target.value))} />
                </div>
              </MiniField>
            </div>

            <MiniField label="Investment account" error={errors.account_id}>
              <select className={selectClass} value={values.account_id ?? ""} onChange={(e) => set("account_id", e.target.value)}>
                <option value="">Select account</option>
                {(investmentAccounts.length ? investmentAccounts : accounts).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </MiniField>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="h-10 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                {saving ? "Saving..." : "Add investment"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
