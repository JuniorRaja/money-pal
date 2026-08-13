/**
 * Backend-shaped domain types.
 *
 * These mirror the future PostgreSQL tables one-to-one: every entity has a
 * string `id`, foreign keys are `*_id`, dates are ISO strings and all money is
 * stored as an integer number of paise (minor units). Swapping the mock
 * repository for real SQL later should require no changes to this file.
 */

export type ISODate = string; // "2026-08-07"
export type ISODateTime = string; // "2026-08-07T11:40:00+05:30"
export type Paise = number; // 245680_00 = ₹2,45,680.00

export type AccountKind = "bank" | "cash" | "credit_card" | "investment" | "loan";

export interface Account {
  id: string;
  name: string;
  institution: string;
  kind: AccountKind;
  /** Positive for assets, negative outstanding for credit/loan accounts. */
  balance: Paise;
  /** Credit cards: current limit. Null for other kinds. */
  credit_limit: Paise | null;
  /** Credit cards: day of month statement is generated (1–31). */
  bill_generation_day: number | null;
  /** Credit cards: payment due day of month (1–31). */
  due_day: number | null;
  /** Loans: annual interest in basis points (850 = 8.50%). */
  interest_rate_bps: number | null;
  /** Loans: EMI amount in paise. */
  emi_amount: Paise | null;
  /** Loans: tenure in months. */
  tenure_months: number | null;
  /** Loans: lender / bank name. */
  lender: string | null;
  /** Ledger-derived outstanding for credit cards (null otherwise). */
  used_amount: Paise | null;
  currency: "INR";
  is_primary: boolean;
  last_activity_at: ISODateTime;
  /** 12 point balance history, oldest first — used for sparklines. */
  trend: number[];
  change_pct: number;
}

/** One billing cycle for a credit card account. */
export interface CreditCardCycle {
  id: string;
  account_id: string;
  statement_date: ISODate;
  due_date: ISODate;
  credit_limit: Paise;
  statement_balance: Paise;
  payment_due_amount: Paise;
  minimum_due: Paise;
  amount_paid: Paise;
  is_current: boolean;
  notes: string | null;
}

export interface Category {
  id: string;
  name: string;
  group: "income" | "essentials" | "lifestyle" | "transfer" | "investment";
  icon: string;
  color_token: string;
}

export interface Label {
  id: string;
  name: string;
  color_token: string;
  /** Set when this label is a slice of a specific account. */
  account_id?: string | null;
  kind?: SliceKind;
  is_default?: boolean;
}

/**
 * How a slice of money should be read:
 * - owned      → genuinely yours, counts in net worth
 * - custodial  → someone else's money you hold, excluded from net worth
 * - earmark    → yours but committed, counts in net worth
 */
export type SliceKind = "owned" | "custodial" | "earmark";

/** A named part of one account's balance. Amounts are always derived. */
export interface Slice {
  id: string;
  account_id: string;
  name: string;
  kind: SliceKind;
  color_token: string;
  is_default: boolean;
  /** Derived: opening_amount + tagged entry sum. */
  amount: Paise;
  /** Seed balance before tagged transactions. */
  opening_amount: Paise;
  target_amount: Paise | null;
  target_date: ISODate | null;
}

/** Per account roll-up of its slices against the derived balance. */
export interface AccountAllocation {
  account_id: string;
  balance: Paise;
  allocated: Paise;
  unallocated: Paise;
  slice_count: number;
  owned: Paise;
  custodial: Paise;
  earmarked: Paise;
}


export type TransactionType = "income" | "expense" | "transfer";

export interface Transaction {
  /** Ledger entry id (row in transaction_entries / domain list key). */
  id: string;
  /** Parent transactions header id — shared by both legs of a transfer. */
  transaction_id: string;
  occurred_at: ISODateTime;
  merchant: string;
  descriptor: string;
  amount: Paise; // signed: negative = money out
  type: TransactionType;
  account_id: string;
  /** For transfers: the other account on this header (to if this is from, from if this is to). */
  counterparty_account_id: string | null;
  category_id: string;
  label_id: string | null;
  payment_method: string;
  source: string;
  confidence: number; // 0..1, from the import pipeline
  note: string | null;
  attachments: number;
}

export interface BudgetPeriod {
  /** budget_lines.id */
  id: string;
  budget_id: string;
  period: string; // "2026-08"
  category_id: string;
  planned: Paise;
  spent: Paise;
}

export interface CategorySpend {
  category_id: string;
  spent: Paise;
}

/** Categories that can have a monthly spend plan. */
export const BUDGETABLE_GROUPS: readonly Category["group"][] = [
  "essentials",
  "lifestyle",
  "investment",
];

export interface Goal {
  id: string;
  name: string;
  blurb: string;
  target: Paise;
  saved: Paise;
  target_date: ISODate;
  account_id: string;
  monthly_contribution: Paise;
  icon: string;
}

export type HoldingClass = "equity" | "mutual_fund" | "gold" | "fixed_income" | "crypto";

export interface Holding {
  id: string;
  name: string;
  asset_class: HoldingClass;
  units: number;
  invested: Paise;
  current_value: Paise;
  day_change_pct: number;
  account_id: string;
}

export type TimelineKind = "money" | "ai_insight" | "goal" | "bill" | "system";

export interface TimelineEvent {
  id: string;
  occurred_at: ISODateTime;
  kind: TimelineKind;
  title: string;
  detail: string;
  amount: Paise | null;
  account_id: string | null;
  action_label: string | null;
}

export type ImportSourceKind = "gmail" | "pdf" | "csv" | "manual";

export interface ImportSource {
  id: string;
  kind: ImportSourceKind;
  name: string;
  status: string;
}

export interface ImportJob {
  id: string;
  source_id: string;
  title: string;
  rows_done: number;
  rows_total: number;
  finished_at: ISODateTime | null;
  imported: number;
  duplicates: number;
}

export type ReviewKind = "duplicate" | "unknown_merchant" | "large_transfer";

export interface ImportReviewItem {
  id: string;
  kind: ReviewKind;
  title: string;
  detail: string;
  action_label: string;
}

export interface MonthlyRollup {
  period: string; // "2026-03"
  income: Paise;
  expense: Paise;
  planned: Paise;
}

export interface UserSettings {
  user_id: string;
  display_name: string;
  email: string;
  currency: "INR";
  week_starts_on: "Monday" | "Sunday";
  number_format: "indian" | "international";
  round_to_nearest: boolean;
  theme: "light" | "dark";
  accent: string;
  sidebar: "expanded" | "collapsed";
  reduce_motion: boolean;
  assistant_tone: "concise" | "detailed";
  assistant_context: boolean;
}
