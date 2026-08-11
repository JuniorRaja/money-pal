/**
 * Unified mutation layer.
 *
 * All mutations write to Supabase via server functions. The user must be
 * authenticated for any mutation to succeed.
 */
import {
  createTransactionFn,
  createAccountFn,
  updateAccountFn,
  archiveAccountFn,
  createSliceFn,
  archiveSliceFn,
  createGoalFn,
  createBudgetFn,
  createHoldingFn,
  type CreateTransactionInput,
  type CreateAccountInput,
  type UpdateAccountInput,
  type ArchiveAccountInput,
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

export async function createTransaction(input: NewTransactionInput): Promise<Transaction> {
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

export async function createSlice(input: NewSliceInput): Promise<Slice> {
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

/**
 * Removes a slice and hands its remaining money back to the account's default
 * slice. The last remaining slice of an account can never be archived.
 */
export async function archiveSlice(id: string): Promise<boolean> {
  const serverInput: ArchiveSliceInput = { id };
  try {
    await archiveSliceFn({ data: serverInput });
    return true;
  } catch {
    return false;
  }
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

export async function createAccount(input: NewAccountInput): Promise<Account> {
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

// =============================================================================
// UPDATE ACCOUNT
// =============================================================================

export interface EditAccountInput {
  id: string;
  name: string;
  institution: string;
  kind: AccountKind;
  credit_limit: Paise | null;
}

export async function updateAccount(input: EditAccountInput): Promise<void> {
  const serverInput: UpdateAccountInput = {
    id: input.id,
    name: input.name,
    institution: input.institution,
    kind: input.kind,
    credit_limit: input.credit_limit,
  };
  await updateAccountFn({ data: serverInput });
}

// =============================================================================
// ARCHIVE ACCOUNT (soft delete)
// =============================================================================

export async function archiveAccount(id: string): Promise<boolean> {
  const serverInput: ArchiveAccountInput = { id };
  try {
    await archiveAccountFn({ data: serverInput });
    return true;
  } catch {
    return false;
  }
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

export async function createGoal(input: NewGoalInput): Promise<Goal> {
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

// =============================================================================
// BUDGET
// =============================================================================

export interface NewBudgetInput {
  period: string;
  category_id: string;
  planned: Paise;
}

export async function createBudget(input: NewBudgetInput): Promise<BudgetPeriod> {
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

export async function createHolding(input: NewHoldingInput): Promise<Holding> {
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
