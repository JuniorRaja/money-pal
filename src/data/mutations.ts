/**
 * Unified mutation layer.
 *
 * All mutations write to Supabase via server functions. The user must be
 * authenticated for any mutation to succeed.
 */
import {
  createTransactionFn,
  updateTransactionFn,
  deleteTransactionFn,
  createAccountFn,
  updateAccountFn,
  archiveAccountFn,
  createSliceFn,
  archiveSliceFn,
  updateSliceFn,
  createGoalFn,
  createBudgetFn,
  createHoldingFn,
  upsertCreditCardCycleFn,
  archiveCreditCardCycleFn,
  type CreateTransactionInput,
  type UpdateTransactionInput,
  type DeleteTransactionInput,
  type CreateAccountInput,
  type UpdateAccountInput,
  type ArchiveAccountInput,
  type CreateSliceInput,
  type ArchiveSliceInput,
  type UpdateSliceInput,
  type CreateGoalInput,
  type CreateBudgetInput,
  type CreateHoldingInput,
  type UpsertCreditCardCycleInput,
  type ArchiveCreditCardCycleInput,
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
  to_account_id?: string | null;
  category_id: string;
  label_id: string | null;
  to_label_id?: string | null;
  note: string | null;
}

export async function createTransaction(input: NewTransactionInput): Promise<{
  transaction_id: string;
}> {
  const serverInput: CreateTransactionInput = {
    occurred_at: input.occurred_at,
    merchant: input.merchant,
    descriptor: input.descriptor,
    amount: input.amount,
    type: input.type,
    account_id: input.account_id,
    to_account_id: input.to_account_id ?? null,
    category_id: input.category_id,
    label_id: input.label_id,
    to_label_id: input.to_label_id ?? null,
    note: input.note,
  };
  return createTransactionFn({ data: serverInput });
}

// =============================================================================
// UPDATE TRANSACTION
// =============================================================================

export interface EditTransactionInput {
  id: string; // entry ID (the domain-level transaction ID from v_transactions_flat)
  transaction_id?: string | undefined;
  occurred_at?: string | undefined;
  merchant?: string | undefined;
  descriptor?: string | undefined;
  amount?: Paise | undefined; // absolute value — will be re-signed based on type
  type?: TransactionType | undefined;
  account_id?: string | undefined;
  to_account_id?: string | null | undefined;
  category_id?: string | undefined;
  label_id?: string | null | undefined;
  to_label_id?: string | null | undefined;
  note?: string | null | undefined;
  payment_method?: string | undefined;
}

export async function updateTransaction(
  input: EditTransactionInput,
  current: Transaction,
): Promise<void> {
  const serverInput: UpdateTransactionInput = {
    id: input.id,
    transaction_id: input.transaction_id ?? current.transaction_id,
    occurred_at: input.occurred_at,
    merchant: input.merchant,
    descriptor: input.descriptor,
    amount: input.amount,
    type: input.type,
    account_id: input.account_id,
    to_account_id: input.to_account_id,
    category_id: input.category_id,
    label_id: input.label_id,
    to_label_id: input.to_label_id,
    note: input.note,
    payment_method: input.payment_method,
  };
  await updateTransactionFn({ data: serverInput });
}

// =============================================================================
// DELETE TRANSACTION (soft-delete)
// =============================================================================

export async function deleteTransaction(
  id: string,
  transactionId?: string,
): Promise<boolean> {
  const serverInput: DeleteTransactionInput = {
    id,
    transaction_id: transactionId,
  };
  try {
    await deleteTransactionFn({ data: serverInput });
    return true;
  } catch {
    return false;
  }
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
    opening_amount: Math.abs(input.amount),
    target_amount: input.kind === "earmark" ? input.target_amount : null,
    target_date: input.kind === "earmark" ? input.target_date : null,
  };
}

/**
 * Soft-archives a slice. Remaining balance becomes Unallocated (derived).
 * The last remaining slice of an account can never be archived.
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

export interface EditSliceInput {
  id: string;
  name?: string | undefined;
  kind?: SliceKind | undefined;
  color_token?: string | undefined;
  opening_amount?: Paise | undefined;
  target_amount?: Paise | null | undefined;
  target_date?: string | null | undefined;
}

export async function updateSlice(input: EditSliceInput): Promise<void> {
  const serverInput: UpdateSliceInput = {
    id: input.id,
    name: input.name,
    kind: input.kind,
    color_token: input.color_token,
    opening_amount: input.opening_amount,
    target_amount: input.target_amount,
    target_date: input.target_date,
  };
  await updateSliceFn({ data: serverInput });
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
  bill_generation_day?: number | null;
  due_day?: number | null;
  interest_rate_bps?: number | null;
  emi_amount?: Paise | null;
  tenure_months?: number | null;
  lender?: string | null;
}

export async function createAccount(input: NewAccountInput): Promise<Account> {
  const serverInput: CreateAccountInput = {
    name: input.name,
    institution: input.institution,
    kind: input.kind,
    balance: input.balance,
    credit_limit: input.credit_limit,
    bill_generation_day: input.bill_generation_day ?? null,
    due_day: input.due_day ?? null,
    interest_rate_bps: input.interest_rate_bps ?? null,
    emi_amount: input.emi_amount ?? null,
    tenure_months: input.tenure_months ?? null,
    lender: input.lender ?? null,
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
    bill_generation_day: input.bill_generation_day ?? null,
    due_day: input.due_day ?? null,
    interest_rate_bps: input.interest_rate_bps ?? null,
    emi_amount: input.emi_amount ?? null,
    tenure_months: input.tenure_months ?? null,
    lender: input.lender ?? null,
    used_amount: input.kind === "credit_card" ? Math.abs(signed) : null,
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
  bill_generation_day?: number | null;
  due_day?: number | null;
  interest_rate_bps?: number | null;
  emi_amount?: Paise | null;
  tenure_months?: number | null;
  lender?: string | null;
}

export async function updateAccount(input: EditAccountInput): Promise<void> {
  const serverInput: UpdateAccountInput = {
    id: input.id,
    name: input.name,
    institution: input.institution,
    kind: input.kind,
    credit_limit: input.credit_limit,
    bill_generation_day: input.bill_generation_day ?? null,
    due_day: input.due_day ?? null,
    interest_rate_bps: input.interest_rate_bps ?? null,
    emi_amount: input.emi_amount ?? null,
    tenure_months: input.tenure_months ?? null,
    lender: input.lender ?? null,
  };
  await updateAccountFn({ data: serverInput });
}

export async function upsertCreditCardCycle(
  input: UpsertCreditCardCycleInput,
): Promise<{ id: string }> {
  return upsertCreditCardCycleFn({ data: input });
}

export async function archiveCreditCardCycle(id: string): Promise<void> {
  const serverInput: ArchiveCreditCardCycleInput = { id };
  await archiveCreditCardCycleFn({ data: serverInput });
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
