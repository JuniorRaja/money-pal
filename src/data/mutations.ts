/**
 * Unified mutation layer.
 *
 * When authenticated, mutations write to Supabase via server functions.
 * When not authenticated (demo mode), they push into in-memory arrays
 * so the UI still works without a backend.
 */
import { accounts } from "@/data/seed/accounts";
import { budgetPeriods, goals, holdings } from "@/data/seed/plan";
import { slices } from "@/data/seed/slices";
import { transactions } from "@/data/seed/transactions";
import { hasSession } from "@/data/live";
import {
  createTransactionFn,
  createAccountFn,
  createSliceFn,
  archiveSliceFn,
  createGoalFn,
  createBudgetFn,
  createHoldingFn,
  type CreateTransactionInput,
  type CreateAccountInput,
  type CreateSliceInput,
  type ArchiveSliceInput,
  type CreateGoalInput,
  type CreateBudgetInput,
  type CreateHoldingInput,
} from "@/lib/mutations.functions";
import type {
  Account,
  AccountKind,
  BudgetPeriod,
  Goal,
  Holding,
  HoldingClass,
  Paise,
  Slice,
  SliceKind,
  Transaction,
  TransactionType,
} from "@/data/schema";

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

const flatTrend = (base: number) => Array.from({ length: 12 }, () => base);

// =============================================================================
// TRANSACTION
// =============================================================================

export interface NewTransactionInput {
  occurred_at: string; // "2026-08-07"
  merchant: string;
  descriptor: string;
  amount: Paise; // absolute value
  type: TransactionType;
  account_id: string;
  category_id: string;
  label_id: string | null;
  note: string | null;
}

function createTransactionLocal(input: NewTransactionInput): Transaction {
  const signed = input.type === "income" ? Math.abs(input.amount) : -Math.abs(input.amount);
  const row: Transaction = {
    id: uid("txn"),
    occurred_at: `${input.occurred_at}T12:00:00+05:30`,
    merchant: input.merchant,
    descriptor: input.descriptor || input.merchant,
    amount: signed,
    type: input.type,
    account_id: input.account_id,
    category_id: input.category_id,
    label_id: input.label_id,
    payment_method: "Manual",
    source: "Manual entry",
    confidence: 1,
    note: input.note,
    attachments: 0,
  };
  transactions.unshift(row);
  const account = accounts.find((a) => a.id === input.account_id);
  if (account) {
    account.balance += signed;
    account.last_activity_at = row.occurred_at;
  }
  // A labelled transaction moves that slice, not just the account total.
  if (input.label_id) {
    const slice = slices.find((s) => s.id === input.label_id && s.account_id === input.account_id);
    if (slice) slice.amount += signed;
  }
  return row;
}

export async function createTransaction(input: NewTransactionInput): Promise<Transaction> {
  if (await hasSession()) {
    const serverInput: CreateTransactionInput = {
      occurred_at: input.occurred_at,
      merchant: input.merchant,
      descriptor: input.descriptor,
      amount: input.amount,
      type: input.type,
      account_id: input.account_id,
      category_id: input.category_id,
      label_id: input.label_id,
      note: input.note,
    };
    const result = await createTransactionFn({ data: serverInput });
    // Return a minimal Transaction object with the server-assigned ID
    const signed = input.type === "income" ? Math.abs(input.amount) : -Math.abs(input.amount);
    return {
      id: result.id,
      occurred_at: `${input.occurred_at}T12:00:00+05:30`,
      merchant: input.merchant,
      descriptor: input.descriptor || input.merchant,
      amount: signed,
      type: input.type,
      account_id: input.account_id,
      category_id: input.category_id,
      label_id: input.label_id,
      payment_method: "Manual",
      source: "Manual entry",
      confidence: 1,
      note: input.note,
      attachments: 0,
    };
  }
  return createTransactionLocal(input);
}

// =============================================================================
// SLICE
// =============================================================================

export interface NewSliceInput {
  account_id: string;
  name: string;
  kind: SliceKind;
  amount: Paise;
  color_token: string;
  target_amount: Paise | null;
  target_date: string | null;
}

function createSliceLocal(input: NewSliceInput): Slice {
  const row: Slice = {
    id: uid("slc"),
    account_id: input.account_id,
    name: input.name,
    kind: input.kind,
    color_token: input.color_token,
    is_default: !slices.some((s) => s.account_id === input.account_id),
    amount: Math.abs(input.amount),
    target_amount: input.kind === "earmark" ? input.target_amount : null,
    target_date: input.kind === "earmark" ? input.target_date : null,
  };
  slices.push(row);
  return row;
}

export async function createSlice(input: NewSliceInput): Promise<Slice> {
  if (await hasSession()) {
    const serverInput: CreateSliceInput = {
      account_id: input.account_id,
      name: input.name,
      kind: input.kind,
      amount: input.amount,
      color_token: input.color_token,
      target_amount: input.target_amount,
      target_date: input.target_date,
    };
    const result = await createSliceFn({ data: serverInput });
    return {
      id: result.id,
      account_id: input.account_id,
      name: input.name,
      kind: input.kind,
      color_token: input.color_token,
      is_default: false,
      amount: Math.abs(input.amount),
      target_amount: input.kind === "earmark" ? input.target_amount : null,
      target_date: input.kind === "earmark" ? input.target_date : null,
    };
  }
  return createSliceLocal(input);
}

/**
 * Removes a slice and hands its remaining money back to the account's default
 * slice. The last remaining slice of an account can never be archived.
 */
function archiveSliceLocal(id: string): boolean {
  const index = slices.findIndex((s) => s.id === id);
  if (index === -1) return false;
  const slice = slices[index]!;
  const siblings = slices.filter((s) => s.account_id === slice.account_id && s.id !== id);
  if (!siblings.length) return false;
  const fallback = siblings.find((s) => s.is_default) ?? siblings[0]!;
  fallback.amount += slice.amount;
  slices.splice(index, 1);
  return true;
}

export async function archiveSlice(id: string): Promise<boolean> {
  if (await hasSession()) {
    const serverInput: ArchiveSliceInput = { id };
    try {
      await archiveSliceFn({ data: serverInput });
      return true;
    } catch {
      return false;
    }
  }
  return archiveSliceLocal(id);
}

// =============================================================================
// ACCOUNT
// =============================================================================

export interface NewAccountInput {
  name: string;
  institution: string;
  kind: AccountKind;
  balance: Paise;
  credit_limit: Paise | null;
}

function createAccountLocal(input: NewAccountInput): Account {
  const signed =
    input.kind === "credit_card" || input.kind === "loan"
      ? -Math.abs(input.balance)
      : Math.abs(input.balance);
  const row: Account = {
    id: uid("acc"),
    name: input.name,
    institution: input.institution,
    kind: input.kind,
    balance: signed,
    credit_limit: input.credit_limit,
    currency: "INR",
    is_primary: false,
    last_activity_at: new Date().toISOString(),
    trend: flatTrend(Math.round(Math.abs(signed) / 100000) || 1),
    change_pct: 0,
  };
  accounts.push(row);
  // Every sliceable account starts life with one default slice.
  if (input.kind === "bank" || input.kind === "cash" || input.kind === "investment") {
    slices.push({
      id: uid("slc"),
      account_id: row.id,
      name: "Mine",
      kind: "owned",
      color_token: "chart-2",
      is_default: true,
      amount: signed,
      target_amount: null,
      target_date: null,
    });
  }
  return row;
}

export async function createAccount(input: NewAccountInput): Promise<Account> {
  if (await hasSession()) {
    const serverInput: CreateAccountInput = {
      name: input.name,
      institution: input.institution,
      kind: input.kind,
      balance: input.balance,
      credit_limit: input.credit_limit,
    };
    const result = await createAccountFn({ data: serverInput });
    const signed =
      input.kind === "credit_card" || input.kind === "loan"
        ? -Math.abs(input.balance)
        : Math.abs(input.balance);
    return {
      id: result.id,
      name: input.name,
      institution: input.institution,
      kind: input.kind,
      balance: signed,
      credit_limit: input.credit_limit,
      currency: "INR",
      is_primary: false,
      last_activity_at: new Date().toISOString(),
      trend: flatTrend(Math.round(Math.abs(signed) / 100000) || 1),
      change_pct: 0,
    };
  }
  return createAccountLocal(input);
}

// =============================================================================
// GOAL
// =============================================================================

export interface NewGoalInput {
  name: string;
  blurb: string;
  target: Paise;
  saved: Paise;
  target_date: string;
  account_id: string;
  monthly_contribution: Paise;
}

function createGoalLocal(input: NewGoalInput): Goal {
  const row: Goal = { id: uid("goal"), icon: "flag", ...input };
  goals.push(row);
  return row;
}

export async function createGoal(input: NewGoalInput): Promise<Goal> {
  if (await hasSession()) {
    const serverInput: CreateGoalInput = {
      name: input.name,
      blurb: input.blurb,
      target: input.target,
      saved: input.saved,
      target_date: input.target_date,
      account_id: input.account_id,
      monthly_contribution: input.monthly_contribution,
    };
    const result = await createGoalFn({ data: serverInput });
    return {
      id: result.id,
      name: input.name,
      blurb: input.blurb,
      target: input.target,
      saved: input.saved,
      target_date: input.target_date,
      account_id: input.account_id,
      monthly_contribution: input.monthly_contribution,
      icon: "flag",
    };
  }
  return createGoalLocal(input);
}

// =============================================================================
// BUDGET
// =============================================================================

export interface NewBudgetInput {
  period: string;
  category_id: string;
  planned: Paise;
}

function createBudgetLocal(input: NewBudgetInput): BudgetPeriod {
  const row: BudgetPeriod = { id: uid("bgt"), spent: 0, ...input };
  budgetPeriods.push(row);
  return row;
}

export async function createBudget(input: NewBudgetInput): Promise<BudgetPeriod> {
  if (await hasSession()) {
    const serverInput: CreateBudgetInput = {
      period: input.period,
      category_id: input.category_id,
      planned: input.planned,
    };
    const result = await createBudgetFn({ data: serverInput });
    return {
      id: result.id,
      period: input.period,
      category_id: input.category_id,
      planned: input.planned,
      spent: 0,
    };
  }
  return createBudgetLocal(input);
}

// =============================================================================
// HOLDING
// =============================================================================

export interface NewHoldingInput {
  name: string;
  asset_class: HoldingClass;
  units: number;
  invested: Paise;
  current_value: Paise;
  account_id: string;
}

function createHoldingLocal(input: NewHoldingInput): Holding {
  const row: Holding = { id: uid("hld"), day_change_pct: 0, ...input };
  holdings.push(row);
  return row;
}

export async function createHolding(input: NewHoldingInput): Promise<Holding> {
  if (await hasSession()) {
    const serverInput: CreateHoldingInput = {
      name: input.name,
      asset_class: input.asset_class,
      units: input.units,
      invested: input.invested,
      current_value: input.current_value,
      account_id: input.account_id,
    };
    const result = await createHoldingFn({ data: serverInput });
    return {
      id: result.id,
      name: input.name,
      asset_class: input.asset_class,
      units: input.units,
      invested: input.invested,
      current_value: input.current_value,
      account_id: input.account_id,
      day_change_pct: 0,
    };
  }
  return createHoldingLocal(input);
}
