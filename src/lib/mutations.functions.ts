/**
 * Server-side mutation functions.
 *
 * These run on the server with the user's authenticated Supabase client,
 * respecting RLS policies. Ledger writes go through atomic Postgres RPCs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import type {
  AccountKind,
  BankPreset,
  HoldingClass,
  ImportMapping,
  SliceKind,
  TransactionType,
} from "@/data/schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { shiftPeriod } from "@/lib/period";

type AppSupabase = SupabaseClient<Database>;

async function getOrCreateBudget(
  supabase: AppSupabase,
  userId: string,
  periodMonth: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("user_id", userId)
    .eq("period_month", periodMonth)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("base_currency")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("budgets")
    .insert({
      user_id: userId,
      period_month: periodMonth,
      currency_code: profile?.base_currency ?? "INR",
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

// =============================================================================
// CREATE TRANSACTION
// =============================================================================

export interface CreateTransactionInput {
  occurred_at: string; // ISO date "2026-08-07"
  merchant: string;
  descriptor: string;
  amount: number; // absolute value in paise
  type: TransactionType;
  account_id: string; // from / sole account
  to_account_id?: string | null;
  category_id: string;
  label_id: string | null; // from / sole slice
  to_label_id?: string | null;
  note: string | null;
}

export const createTransactionFn = createServerFn({ method: "POST" })
  .validator((input: CreateTransactionInput) => {
    if (!input.occurred_at) throw new Error("occurred_at is required");
    if (!input.merchant?.trim()) throw new Error("merchant is required");
    if (!input.account_id) throw new Error("account_id is required");
    if (!input.category_id) throw new Error("category_id is required");
    if (input.amount <= 0) throw new Error("amount must be positive");
    if (input.type === "transfer") {
      if (!input.to_account_id) throw new Error("to_account_id is required for transfers");
      if (input.to_account_id === input.account_id) {
        throw new Error("transfer accounts must differ");
      }
    }
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: txnId, error } = await supabase.rpc("fn_record_transaction", {
      p_occurred_at: `${data.occurred_at}T12:00:00+05:30`,
      p_type: data.type,
      p_from_account: data.account_id,
      p_amount: data.amount,
      ...(data.type === "transfer" && data.to_account_id
        ? { p_to_account: data.to_account_id }
        : {}),
      p_category: data.category_id,
      p_merchant: data.merchant,
      p_descriptor: data.descriptor || data.merchant,
      ...(data.label_id ? { p_from_label: data.label_id } : {}),
      ...(data.type === "transfer" && data.to_label_id ? { p_to_label: data.to_label_id } : {}),
      p_payment_method: "Manual",
      ...(data.note ? { p_note: data.note } : {}),
    });
    if (error) throw error;

    return { transaction_id: txnId as string };
  });

// =============================================================================
// UPDATE TRANSACTION
// =============================================================================

export interface UpdateTransactionInput {
  /** Domain list id = entry id; resolved to transaction_id server-side when needed. */
  id: string;
  transaction_id?: string | undefined;
  occurred_at?: string | undefined;
  merchant?: string | undefined;
  descriptor?: string | undefined;
  amount?: number | undefined;
  type?: TransactionType | undefined;
  account_id?: string | undefined;
  to_account_id?: string | null | undefined;
  category_id?: string | undefined;
  label_id?: string | null | undefined;
  to_label_id?: string | null | undefined;
  note?: string | null | undefined;
  payment_method?: string | undefined;
}

export const updateTransactionFn = createServerFn({ method: "POST" })
  .validator((input: UpdateTransactionInput) => {
    if (!input.id && !input.transaction_id) throw new Error("id is required");
    if (input.amount !== undefined && input.amount <= 0) throw new Error("amount must be positive");
    if (input.merchant !== undefined && !input.merchant.trim())
      throw new Error("merchant cannot be empty");
    if (input.type === "transfer" && input.to_account_id === null) {
      throw new Error("to_account_id is required for transfers");
    }
    if (
      input.type === "transfer" &&
      input.account_id &&
      input.to_account_id &&
      input.account_id === input.to_account_id
    ) {
      throw new Error("transfer accounts must differ");
    }
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    let transactionId = data.transaction_id;
    if (!transactionId) {
      const { data: entry, error: entryLookupError } = await supabase
        .from("transaction_entries")
        .select("id, transaction_id")
        .eq("id", data.id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();
      if (entryLookupError) throw new Error("Transaction not found");
      transactionId = entry.transaction_id;
    }

    const { error } = await supabase.rpc("fn_update_transaction", {
      p_transaction_id: transactionId,
      ...(data.occurred_at ? { p_occurred_at: `${data.occurred_at}T12:00:00+05:30` } : {}),
      ...(data.type ? { p_type: data.type } : {}),
      ...(data.account_id ? { p_from_account: data.account_id } : {}),
      ...(data.to_account_id ? { p_to_account: data.to_account_id } : {}),
      ...(data.amount !== undefined ? { p_amount: data.amount } : {}),
      ...(data.category_id ? { p_category: data.category_id } : {}),
      ...(data.merchant !== undefined ? { p_merchant: data.merchant } : {}),
      ...(data.descriptor !== undefined ? { p_descriptor: data.descriptor } : {}),
      ...(data.label_id ? { p_from_label: data.label_id } : {}),
      ...(data.to_label_id ? { p_to_label: data.to_label_id } : {}),
      p_clear_from_label: data.label_id === null,
      p_clear_to_label: data.to_label_id === null,
      ...(data.payment_method !== undefined ? { p_payment_method: data.payment_method } : {}),
      ...(data.note ? { p_note: data.note } : {}),
      p_clear_note: data.note === null,
    });
    if (error) throw error;

    return { id: data.id, transaction_id: transactionId };
  });

// =============================================================================
// DELETE TRANSACTION (soft-delete via RPC)
// =============================================================================

export interface DeleteTransactionInput {
  /** Entry id or transaction id — prefer transaction_id when known. */
  id: string;
  transaction_id?: string | undefined;
}

export const deleteTransactionFn = createServerFn({ method: "POST" })
  .validator((input: DeleteTransactionInput) => {
    if (!input.id && !input.transaction_id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    let transactionId = data.transaction_id;
    if (!transactionId) {
      const { data: entry, error: entryError } = await supabase
        .from("transaction_entries")
        .select("id, transaction_id")
        .eq("id", data.id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (entryError) throw entryError;
      if (entry) {
        transactionId = entry.transaction_id;
      } else {
        // Allow deleting by header id directly
        transactionId = data.id;
      }
    }

    const { error } = await supabase.rpc("fn_delete_transaction", {
      p_transaction_id: transactionId,
    });
    if (error) throw error;

    return { success: true, transaction_id: transactionId };
  });

// =============================================================================
// CREATE ACCOUNT
// =============================================================================

export interface CreateAccountInput {
  name: string;
  institution: string;
  kind: AccountKind;
  balance: number; // opening balance in paise
  credit_limit: number | null;
  bill_generation_day: number | null;
  due_day: number | null;
  interest_rate_bps: number | null;
  emi_amount: number | null;
  tenure_months: number | null;
  lender: string | null;
}

export const createAccountFn = createServerFn({ method: "POST" })
  .validator((input: CreateAccountInput) => {
    if (!input.name?.trim()) throw new Error("name is required");
    if (!input.kind) throw new Error("kind is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // For credit cards and loans, balance is stored as negative (liability)
    const signedBalance =
      data.kind === "credit_card" || data.kind === "loan"
        ? -Math.abs(data.balance)
        : Math.abs(data.balance);

    const isCard = data.kind === "credit_card";
    const isLoan = data.kind === "loan";

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name: data.name,
        institution: data.institution,
        kind: data.kind,
        currency_code: "INR",
        opening_balance: signedBalance,
        credit_limit: isCard ? data.credit_limit : null,
        bill_generation_day: isCard ? data.bill_generation_day : null,
        due_day: isCard ? data.due_day : null,
        interest_rate_bps: isLoan ? data.interest_rate_bps : null,
        emi_amount: isLoan ? data.emi_amount : null,
        tenure_months: isLoan ? data.tenure_months : null,
        lender: isLoan ? data.lender : null,
        is_primary: false,
      })
      .select("id")
      .single();
    if (accountError) throw accountError;

    // Default slice is created automatically by trg_account_default_slice for bank/cash.

    return { id: account.id };
  });

// =============================================================================
// UPDATE ACCOUNT
// =============================================================================

export interface UpdateAccountInput {
  id: string;
  name: string;
  institution: string;
  kind: AccountKind;
  credit_limit: number | null;
  bill_generation_day: number | null;
  due_day: number | null;
  interest_rate_bps: number | null;
  emi_amount: number | null;
  tenure_months: number | null;
  lender: string | null;
}

export const updateAccountFn = createServerFn({ method: "POST" })
  .validator((input: UpdateAccountInput) => {
    if (!input.id) throw new Error("id is required");
    if (!input.name?.trim()) throw new Error("name is required");
    if (!input.kind) throw new Error("kind is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const isCard = data.kind === "credit_card";
    const isLoan = data.kind === "loan";

    const { error } = await supabase
      .from("accounts")
      .update({
        name: data.name,
        institution: data.institution,
        kind: data.kind,
        credit_limit: isCard ? data.credit_limit : null,
        bill_generation_day: isCard ? data.bill_generation_day : null,
        due_day: isCard ? data.due_day : null,
        interest_rate_bps: isLoan ? data.interest_rate_bps : null,
        emi_amount: isLoan ? data.emi_amount : null,
        tenure_months: isLoan ? data.tenure_months : null,
        lender: isLoan ? data.lender : null,
        modified_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;

    return { id: data.id };
  });

// =============================================================================
// ARCHIVE ACCOUNT (soft delete)
// =============================================================================

export interface ArchiveAccountInput {
  id: string;
}

export const archiveAccountFn = createServerFn({ method: "POST" })
  .validator((input: ArchiveAccountInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const now = new Date().toISOString();

    // Soft-delete the account
    const { error } = await supabase
      .from("accounts")
      .update({ deleted_at: now, is_active: false, modified_at: now })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;

    // Soft-delete all slices (labels) belonging to this account
    await supabase
      .from("labels")
      .update({ deleted_at: now })
      .eq("account_id", data.id)
      .is("deleted_at", null);

    return { success: true };
  });

// =============================================================================
// CREATE SLICE (stored in labels table with account_id)
// =============================================================================

export interface CreateSliceInput {
  account_id: string;
  name: string;
  kind: SliceKind;
  amount: number; // initial amount in paise
  color_token: string;
  target_amount: number | null;
  target_date: string | null;
}

export const createSliceFn = createServerFn({ method: "POST" })
  .validator((input: CreateSliceInput) => {
    if (!input.account_id) throw new Error("account_id is required");
    if (!input.name?.trim()) throw new Error("name is required");
    if (!input.kind) throw new Error("kind is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const amount = Math.abs(data.amount);

    // Find the default slice for this account (the one we carve money from)
    const { data: defaultSlice } = await supabase
      .from("labels")
      .select("id, opening_amount")
      .eq("account_id", data.account_id)
      .eq("is_default", true)
      .is("deleted_at", null)
      .single();

    // If no default slice exists, this is the first slice for the account
    const isFirst = !defaultSlice;

    const { data: slice, error: sliceError } = await supabase
      .from("labels")
      .insert({
        user_id: userId,
        account_id: data.account_id,
        name: data.name,
        kind: data.kind,
        color_token: data.color_token,
        is_default: isFirst,
        opening_amount: amount,
        target_amount: data.kind === "earmark" ? data.target_amount : null,
        target_date: data.kind === "earmark" ? data.target_date : null,
      })
      .select("id")
      .single();
    if (sliceError) throw sliceError;

    // Subtract the new slice's amount from the default slice so the total stays balanced
    if (defaultSlice && amount > 0) {
      const newDefaultAmount = Number(defaultSlice.opening_amount) - amount;
      const { error: updateError } = await supabase
        .from("labels")
        .update({ opening_amount: newDefaultAmount })
        .eq("id", defaultSlice.id);
      if (updateError) throw updateError;
    }

    return { id: slice.id };
  });

// =============================================================================
// ARCHIVE SLICE (soft delete)
// =============================================================================

export interface ArchiveSliceInput {
  id: string;
}

export const archiveSliceFn = createServerFn({ method: "POST" })
  .validator((input: ArchiveSliceInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    // Get the slice to find its account
    const { data: slice, error: sliceError } = await supabase
      .from("labels")
      .select("id, account_id, is_default")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (sliceError) throw sliceError;
    if (!slice.account_id) throw new Error("Slice has no account_id");

    // Count siblings (other active slices for the same account)
    const { data: siblings } = await supabase
      .from("labels")
      .select("id")
      .eq("account_id", slice.account_id)
      .neq("id", data.id)
      .is("deleted_at", null);

    // Can't delete the last slice
    if (!siblings || siblings.length === 0) {
      throw new Error("Cannot archive the last slice of an account");
    }

    // Soft delete
    const { error: deleteError } = await supabase
      .from("labels")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (deleteError) throw deleteError;

    // If this was the default slice, make another one default
    if (slice.is_default) {
      const { data: newDefault } = await supabase
        .from("labels")
        .select("id")
        .eq("account_id", slice.account_id)
        .is("deleted_at", null)
        .limit(1)
        .single();

      if (newDefault) {
        await supabase.from("labels").update({ is_default: true }).eq("id", newDefault.id);
      }
    }

    return { success: true };
  });

// =============================================================================
// UPDATE SLICE
// =============================================================================

export interface UpdateSliceInput {
  id: string;
  name?: string | undefined;
  kind?: SliceKind | undefined;
  color_token?: string | undefined;
  opening_amount?: number | undefined;
  target_amount?: number | null | undefined;
  target_date?: string | null | undefined;
}

export const updateSliceFn = createServerFn({ method: "POST" })
  .validator((input: UpdateSliceInput) => {
    if (!input.id) throw new Error("id is required");
    if (input.name !== undefined && !input.name.trim()) throw new Error("name cannot be empty");
    if (input.opening_amount !== undefined && input.opening_amount < 0) {
      throw new Error("opening_amount cannot be negative");
    }
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: existing, error: lookupError } = await supabase
      .from("labels")
      .select("id, kind, account_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (lookupError) throw new Error("Slice not found");
    if (!existing.account_id) throw new Error("Not a slice");

    const kind = data.kind ?? (existing.kind as SliceKind);
    const patch: {
      modified_at: string;
      name?: string;
      kind?: SliceKind;
      color_token?: string;
      opening_amount?: number;
      target_amount?: number | null;
      target_date?: string | null;
    } = { modified_at: new Date().toISOString() };
    if (data.name !== undefined) patch["name"] = data.name.trim();
    if (data.kind !== undefined) patch["kind"] = data.kind;
    if (data.color_token !== undefined) patch["color_token"] = data.color_token;
    if (data.opening_amount !== undefined) patch["opening_amount"] = data.opening_amount;

    if (kind === "earmark") {
      if (data.target_amount !== undefined) patch["target_amount"] = data.target_amount;
      if (data.target_date !== undefined) patch["target_date"] = data.target_date;
    } else {
      patch["target_amount"] = null;
      patch["target_date"] = null;
    }

    const { error } = await supabase
      .from("labels")
      .update(patch)
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;

    return { id: data.id };
  });

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function localDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function savedForGoal(supabase: AppSupabase, goalId: string): Promise<number> {
  const { data, error } = await supabase
    .from("v_goal_progress")
    .select("saved")
    .eq("goal_id", goalId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.saved ?? 0);
}

// =============================================================================
// CREATE GOAL
// =============================================================================

export interface CreateGoalInput {
  name: string;
  blurb: string;
  target: number; // target amount in paise
  saved: number; // initial saved amount in paise
  target_date: string;
  account_id: string;
  monthly_contribution: number;
}

export const createGoalFn = createServerFn({ method: "POST" })
  .validator((input: CreateGoalInput) => {
    if (!input.name?.trim()) throw new Error("name is required");
    if (input.target <= 0) throw new Error("target must be positive");
    if (input.saved < 0) throw new Error("saved cannot be negative");
    if (input.monthly_contribution < 0) throw new Error("monthly contribution cannot be negative");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .insert({
        user_id: userId,
        name: data.name.trim(),
        blurb: data.blurb,
        icon: "flag",
        target_amount: data.target,
        currency_code: profile?.base_currency ?? "INR",
        target_date: data.target_date || null,
        account_id: data.account_id || null,
        monthly_contribution: data.monthly_contribution,
      })
      .select("id")
      .single();
    if (goalError) throw goalError;

    if (data.saved > 0) {
      const { error: contribError } = await supabase.from("goal_contributions").insert({
        goal_id: goal.id,
        user_id: userId,
        amount: data.saved,
        contributed_on: localDate(),
      });
      if (contribError) throw contribError;
    }

    return { id: goal.id };
  });

export interface UpdateGoalInput {
  id: string;
  name: string;
  blurb: string;
  target: number;
  target_date: string;
  account_id: string;
  monthly_contribution: number;
}

export const updateGoalFn = createServerFn({ method: "POST" })
  .validator((input: UpdateGoalInput) => {
    if (!input.id) throw new Error("id is required");
    if (!input.name?.trim()) throw new Error("name is required");
    if (input.target <= 0) throw new Error("target must be positive");
    if (input.monthly_contribution < 0) throw new Error("monthly contribution cannot be negative");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("goals")
      .update({
        name: data.name.trim(),
        blurb: data.blurb,
        target_amount: data.target,
        target_date: data.target_date || null,
        account_id: data.account_id || null,
        monthly_contribution: data.monthly_contribution,
        modified_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { id: data.id };
  });

export interface ArchiveGoalInput {
  id: string;
}

export const archiveGoalFn = createServerFn({ method: "POST" })
  .validator((input: ArchiveGoalInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("goals")
      .update({ deleted_at: now, is_active: false, modified_at: now })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { success: true };
  });

export interface AddGoalContributionInput {
  goal_id: string;
  amount: number;
  contributed_on: string;
  transaction_id?: string | null;
}

export const addGoalContributionFn = createServerFn({ method: "POST" })
  .validator((input: AddGoalContributionInput) => {
    if (!input.goal_id) throw new Error("goal is required");
    if (!input.amount || input.amount === 0) throw new Error("amount cannot be zero");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.contributed_on)) throw new Error("date is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.amount < 0) {
      const saved = await savedForGoal(supabase, data.goal_id);
      if (saved + data.amount < 0) throw new Error("Withdraw cannot exceed saved so far");
    }

    const { data: row, error } = await supabase
      .from("goal_contributions")
      .insert({
        goal_id: data.goal_id,
        user_id: userId,
        amount: data.amount,
        contributed_on: data.contributed_on,
        transaction_id: data.transaction_id || null,
      })
      .select("id")
      .single();
    if (isUniqueViolation(error)) throw new Error("That transaction is already linked to a goal");
    if (error) throw error;
    if (!row) throw new Error("Could not add contribution");
    return { id: row.id };
  });

export interface LinkGoalContributionInput {
  id: string;
  transaction_id: string;
}

export const linkGoalContributionFn = createServerFn({ method: "POST" })
  .validator((input: LinkGoalContributionInput) => {
    if (!input.id) throw new Error("id is required");
    if (!input.transaction_id) throw new Error("transaction is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("goal_contributions")
      .update({ transaction_id: data.transaction_id, modified_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (isUniqueViolation(error)) throw new Error("That transaction is already linked to a goal");
    if (error) throw error;
    return { id: data.id };
  });

export interface UnlinkGoalContributionInput {
  id: string;
}

export const unlinkGoalContributionFn = createServerFn({ method: "POST" })
  .validator((input: UnlinkGoalContributionInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("goal_contributions")
      .update({ transaction_id: null, modified_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { id: data.id };
  });

export interface VoidGoalContributionInput {
  id: string;
}

export const voidGoalContributionFn = createServerFn({ method: "POST" })
  .validator((input: VoidGoalContributionInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("goal_contributions")
      .update({ deleted_at: now, is_active: false, modified_at: now })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { success: true };
  });

// =============================================================================
// CREATE BUDGET
// =============================================================================

export interface CreateBudgetInput {
  period: string; // "2026-08"
  category_id: string;
  planned: number; // planned amount in paise
}

export const createBudgetFn = createServerFn({ method: "POST" })
  .validator((input: CreateBudgetInput) => {
    if (!input.period) throw new Error("period is required");
    if (!input.category_id) throw new Error("category_id is required");
    if (input.planned < 0) throw new Error("planned cannot be negative");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const budgetId = await getOrCreateBudget(supabase, userId, `${data.period}-01`);

    const { data: existingLine } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("budget_id", budgetId)
      .eq("category_id", data.category_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingLine) {
      const { error } = await supabase
        .from("budget_lines")
        .update({ planned: data.planned, modified_at: new Date().toISOString() })
        .eq("id", existingLine.id);
      if (error) throw error;
      return { id: existingLine.id, budget_id: budgetId, wasUpdate: true };
    }

    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .insert({
        budget_id: budgetId,
        user_id: userId,
        category_id: data.category_id,
        planned: data.planned,
      })
      .select("id")
      .single();
    if (lineError) throw lineError;

    return { id: line.id, budget_id: budgetId, wasUpdate: false };
  });

export interface UpdateBudgetLineInput {
  id: string;
  planned: number;
}

export const updateBudgetLineFn = createServerFn({ method: "POST" })
  .validator((input: UpdateBudgetLineInput) => {
    if (!input.id) throw new Error("id is required");
    if (input.planned < 0) throw new Error("planned cannot be negative");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("budget_lines")
      .update({ planned: data.planned, modified_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { id: data.id };
  });

export interface ArchiveBudgetLineInput {
  id: string;
}

export const archiveBudgetLineFn = createServerFn({ method: "POST" })
  .validator((input: ArchiveBudgetLineInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("budget_lines")
      .update({ deleted_at: now, is_active: false, modified_at: now })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { success: true };
  });

export interface ApplyBudgetTemplateInput {
  period: string;
  monthly_income: number;
}

export const applyBudgetTemplateFn = createServerFn({ method: "POST" })
  .validator((input: ApplyBudgetTemplateInput) => {
    if (!input.period) throw new Error("period is required");
    if (input.monthly_income <= 0) throw new Error("monthly income must be positive");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const periodMonth = `${data.period}-01`;

    // Count budget lines before applying template
    const { count: beforeCount } = await supabase
      .from("budget_lines")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null);

    const { data: budgetId, error } = await supabase.rpc("fn_apply_budget_template", {
      p_template_name: "Balanced 50/30/20",
      p_period_month: periodMonth,
      p_monthly_income: data.monthly_income,
    });
    if (error) throw error;

    // Count budget lines after applying template
    const { count: afterCount } = await supabase
      .from("budget_lines")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null);

    return {
      id: budgetId as string,
      linesAdded: (afterCount ?? 0) - (beforeCount ?? 0),
    };
  });

export interface CopyBudgetFromPreviousInput {
  period: string;
}

export const copyBudgetFromPreviousFn = createServerFn({ method: "POST" })
  .validator((input: CopyBudgetFromPreviousInput) => {
    if (!input.period) throw new Error("period is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prevPeriod = shiftPeriod(data.period, -1);
    const prevMonth = `${prevPeriod}-01`;

    const { data: prevBudget } = await supabase
      .from("budgets")
      .select("id")
      .eq("user_id", userId)
      .eq("period_month", prevMonth)
      .is("deleted_at", null)
      .maybeSingle();

    if (!prevBudget) {
      return { copied: 0, skipped: 0, reason: "none" as const };
    }

    const { data: prevLines, error: prevError } = await supabase
      .from("budget_lines")
      .select("category_id, planned")
      .eq("budget_id", prevBudget.id)
      .is("deleted_at", null);
    if (prevError) throw prevError;

    const source = prevLines ?? [];
    if (source.length === 0) {
      return { copied: 0, skipped: 0, reason: "empty" as const };
    }

    const budgetId = await getOrCreateBudget(supabase, userId, `${data.period}-01`);

    const { data: currentLines, error: currentError } = await supabase
      .from("budget_lines")
      .select("category_id")
      .eq("budget_id", budgetId)
      .is("deleted_at", null);
    if (currentError) throw currentError;

    const existing = new Set((currentLines ?? []).map((row) => row.category_id));
    const toInsert = source.filter((row) => !existing.has(row.category_id));

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("budget_lines").insert(
        toInsert.map((row) => ({
          budget_id: budgetId,
          user_id: userId,
          category_id: row.category_id,
          planned: row.planned,
        })),
      );
      if (insertError) throw insertError;
    }

    return {
      copied: toInsert.length,
      skipped: source.length - toInsert.length,
      reason: "ok" as const,
    };
  });

// =============================================================================
// CREATE HOLDING
// =============================================================================

export interface CreateHoldingInput {
  name: string;
  asset_class: HoldingClass;
  units: number;
  invested: number; // invested amount in paise
  current_value: number; // current value in paise
  account_id: string;
}

export const createHoldingFn = createServerFn({ method: "POST" })
  .validator((input: CreateHoldingInput) => {
    if (!input.name?.trim()) throw new Error("name is required");
    if (!input.asset_class) throw new Error("asset_class is required");
    if (!input.account_id) throw new Error("account_id is required");
    if (input.units < 0) throw new Error("units cannot be negative");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Calculate last_price from current_value and units
    const lastPrice = data.units > 0 ? Math.round(data.current_value / data.units) : 0;

    const { data: holding, error: holdingError } = await supabase
      .from("holdings")
      .insert({
        user_id: userId,
        account_id: data.account_id,
        name: data.name,
        asset_class: data.asset_class,
        units: data.units,
        invested: data.invested,
        last_price: lastPrice,
        priced_at: new Date().toISOString(),
        currency_code: "INR",
      })
      .select("id")
      .single();
    if (holdingError) throw holdingError;

    return { id: holding.id };
  });

// =============================================================================
// CREDIT CARD CYCLES
// =============================================================================

export interface UpsertCreditCardCycleInput {
  id?: string | undefined;
  account_id: string;
  statement_date: string;
  due_date: string;
  credit_limit: number;
  statement_balance: number;
  payment_due_amount: number;
  minimum_due: number;
  amount_paid: number;
  is_current: boolean;
  notes?: string | null | undefined;
}

export const upsertCreditCardCycleFn = createServerFn({ method: "POST" })
  .validator((input: UpsertCreditCardCycleInput) => {
    if (!input.account_id) throw new Error("account_id is required");
    if (!input.statement_date) throw new Error("statement_date is required");
    if (!input.due_date) throw new Error("due_date is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (data.is_current) {
      const { error: clearError } = await supabase
        .from("credit_card_cycles")
        .update({ is_current: false, modified_at: new Date().toISOString() })
        .eq("account_id", data.account_id)
        .eq("is_current", true)
        .is("deleted_at", null);
      if (clearError) throw clearError;
    }

    const payload = {
      user_id: userId,
      account_id: data.account_id,
      statement_date: data.statement_date,
      due_date: data.due_date,
      credit_limit: data.credit_limit,
      statement_balance: data.statement_balance,
      payment_due_amount: data.payment_due_amount,
      minimum_due: data.minimum_due,
      amount_paid: data.amount_paid,
      is_current: data.is_current,
      notes: data.notes ?? null,
      modified_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabase
        .from("credit_card_cycles")
        .update(payload)
        .eq("id", data.id)
        .is("deleted_at", null);
      if (error) throw error;
      return { id: data.id };
    }

    const { data: row, error } = await supabase
      .from("credit_card_cycles")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export interface ArchiveCreditCardCycleInput {
  id: string;
}

export const archiveCreditCardCycleFn = createServerFn({ method: "POST" })
  .validator((input: ArchiveCreditCardCycleInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("credit_card_cycles")
      .update({ deleted_at: now, is_active: false, is_current: false, modified_at: now })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { id: data.id };
  });

// =============================================================================
// CSV IMPORT CENTER
// =============================================================================

const BANK_PRESETS: BankPreset[] = ["hdfc_savings", "hdfc_cc", "dbs", "custom"];
const IMPORT_ROW_CHUNK = 200;

function fail(error: { message: string } | null | undefined): never {
  throw new Error(error?.message?.trim() || "Import request failed");
}

function asJson(value: ImportMapping): Json {
  return value as Json;
}

function normalizeRuleMatch(value: string): string {
  return value.trim().toLowerCase();
}

type ImportRowDraft = {
  occurred_at: string;
  merchant?: string | null;
  descriptor?: string | null;
  amount_paise: number;
  type: "income" | "expense";
  raw_line?: ImportMapping;
  import_hash: string;
  suggested_category_id?: string | null;
  confidence?: number | null;
};

async function findExistingExternalRefs(
  supabase: AppSupabase,
  hashes: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < hashes.length; i += IMPORT_ROW_CHUNK) {
    const chunk = hashes.slice(i, i + IMPORT_ROW_CHUNK);
    const { data, error } = await supabase
      .from("transactions")
      .select("external_ref")
      .in("external_ref", chunk)
      .is("deleted_at", null);
    if (error) fail(error);
    for (const row of data ?? []) {
      if (row.external_ref) found.add(row.external_ref);
    }
  }
  return found;
}

async function upsertImportRuleRow(
  supabase: AppSupabase,
  userId: string,
  input: { match: string; category_id: string; account_id?: string | null },
): Promise<{ id: string }> {
  const match = normalizeRuleMatch(input.match);
  if (!match) throw new Error("match is required");
  if (!input.category_id) throw new Error("category_id is required");

  let existingQuery = supabase
    .from("import_rules")
    .select("id")
    .eq("user_id", userId)
    .eq("match", match)
    .is("deleted_at", null);
  existingQuery = input.account_id
    ? existingQuery.eq("account_id", input.account_id)
    : existingQuery.is("account_id", null);

  const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase
      .from("import_rules")
      .update({
        category_id: input.category_id,
        modified_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return { id: existing.id };
  }

  const { data: created, error } = await supabase
    .from("import_rules")
    .insert({
      user_id: userId,
      match,
      category_id: input.category_id,
      account_id: input.account_id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: created.id };
}

async function ensureImportSourceAndProfile(
  supabase: AppSupabase,
  userId: string,
  input: {
    account_id: string;
    bank_preset: BankPreset;
    source_name: string;
    source_id?: string | null | undefined;
    mapping: ImportMapping;
  },
): Promise<{ sourceId: string; profileId: string }> {
  const mapping = asJson(input.mapping ?? {});
  let sourceId = input.source_id ?? null;

  if (sourceId) {
    const { data: source, error } = await supabase
      .from("import_sources")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) fail(error);
    if (!source) throw new Error("import source not found");
  }

  const { data: profile, error: profileError } = await supabase
    .from("import_profiles")
    .select("id, source_id")
    .eq("user_id", userId)
    .eq("account_id", input.account_id)
    .eq("bank_preset", input.bank_preset)
    .is("deleted_at", null)
    .maybeSingle();
  if (profileError) fail(profileError);

  if (!sourceId) sourceId = profile?.source_id ?? null;

  if (sourceId) {
    const { data: liveSource, error } = await supabase
      .from("import_sources")
      .select("id")
      .eq("id", sourceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) fail(error);
    if (!liveSource) sourceId = null;
  }

  if (!sourceId) {
    const { data: createdSource, error } = await supabase
      .from("import_sources")
      .insert({
        user_id: userId,
        kind: "csv",
        name: input.source_name.trim(),
        status: "idle",
      })
      .select("id")
      .single();
    if (error) fail(error);
    sourceId = createdSource.id;
  }

  if (profile) {
    const { error } = await supabase
      .from("import_profiles")
      .update({
        source_id: sourceId,
        mapping,
        modified_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    if (error) fail(error);
    return { sourceId, profileId: profile.id };
  }

  const { data: createdProfile, error } = await supabase
    .from("import_profiles")
    .insert({
      user_id: userId,
      account_id: input.account_id,
      source_id: sourceId,
      bank_preset: input.bank_preset,
      mapping,
    })
    .select("id")
    .single();
  if (error) fail(error);
  return { sourceId, profileId: createdProfile.id };
}

/**
 * Move a staged row between pending / skipped / held. The RPC owns the
 * import_jobs.rows_done bookkeeping so it stays atomic against a concurrent
 * accept, which updates the same counter.
 */
async function setImportRowStatus(
  supabase: AppSupabase,
  rowId: string,
  status: "pending" | "skipped" | "held",
): Promise<void> {
  const { error } = await supabase.rpc("fn_set_import_row_status", {
    p_row_id: rowId,
    p_status: status,
  });
  if (error) fail(error);
}

export interface UpsertImportProfileInput {
  account_id: string;
  bank_preset: BankPreset;
  source_name: string;
  source_id?: string | null;
  mapping: ImportMapping;
}

export const upsertImportProfileFn = createServerFn({ method: "POST" })
  .validator((input: UpsertImportProfileInput) => {
    if (!input.account_id) throw new Error("account_id is required");
    if (!BANK_PRESETS.includes(input.bank_preset)) throw new Error("bank_preset is invalid");
    if (!input.source_name?.trim()) throw new Error("source_name is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    return ensureImportSourceAndProfile(supabase, userId, data);
  });

export interface StageImportInput {
  account_id: string;
  bank_preset: BankPreset;
  source_name: string;
  source_id?: string | null;
  mapping: ImportMapping;
  title: string;
  rows: ImportRowDraft[];
}

export const stageImportFn = createServerFn({ method: "POST" })
  .validator((input: StageImportInput) => {
    if (!input.account_id) throw new Error("account_id is required");
    if (!BANK_PRESETS.includes(input.bank_preset)) throw new Error("bank_preset is invalid");
    if (!input.source_name?.trim()) throw new Error("source_name is required");
    if (!input.title?.trim()) throw new Error("title is required");
    if (!input.rows?.length) throw new Error("rows are required");
    const hashes = new Set<string>();
    for (const row of input.rows) {
      if (!row.occurred_at) throw new Error("each row needs occurred_at");
      if (!row.import_hash?.trim()) throw new Error("each row needs import_hash");
      if (row.amount_paise <= 0) throw new Error("amount_paise must be positive");
      if (row.type !== "income" && row.type !== "expense") {
        throw new Error("row type must be income or expense");
      }
      if (hashes.has(row.import_hash)) {
        throw new Error("duplicate import_hash in payload");
      }
      hashes.add(row.import_hash);
    }
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { sourceId, profileId } = await ensureImportSourceAndProfile(supabase, userId, {
      account_id: data.account_id,
      bank_preset: data.bank_preset,
      source_name: data.source_name,
      source_id: data.source_id,
      mapping: data.mapping,
    });

    const existingRefs = await findExistingExternalRefs(
      supabase,
      data.rows.map((row) => row.import_hash),
    );
    const duplicateCount = data.rows.filter((row) => existingRefs.has(row.import_hash)).length;
    const now = new Date().toISOString();
    const allDuplicates = duplicateCount === data.rows.length;

    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        user_id: userId,
        source_id: sourceId,
        title: data.title.trim(),
        rows_total: data.rows.length,
        rows_done: duplicateCount,
        imported: 0,
        duplicates: duplicateCount,
        finished_at: allDuplicates ? now : null,
      })
      .select("id")
      .single();
    if (jobError) fail(jobError);

    const payloads = data.rows.map((row) => ({
      user_id: userId,
      job_id: job.id,
      account_id: data.account_id,
      occurred_at: row.occurred_at,
      merchant: row.merchant?.trim() || null,
      descriptor: row.descriptor?.trim() || null,
      amount_paise: row.amount_paise,
      type: row.type,
      raw_line: asJson(row.raw_line ?? {}),
      import_hash: row.import_hash,
      status: existingRefs.has(row.import_hash)
        ? ("skipped_duplicate" as const)
        : ("pending" as const),
      suggested_category_id: row.suggested_category_id ?? null,
      confidence: row.confidence ?? null,
    }));

    for (let i = 0; i < payloads.length; i += IMPORT_ROW_CHUNK) {
      const chunk = payloads.slice(i, i + IMPORT_ROW_CHUNK);
      const { error } = await supabase.from("import_job_rows").insert(chunk);
      if (error) fail(error);
    }

    return {
      source_id: sourceId,
      profile_id: profileId,
      job_id: job.id,
      rows_total: data.rows.length,
      rows_done: duplicateCount,
      duplicates: duplicateCount,
    };
  });

export interface CommitImportRowInput {
  row_id: string;
  patch?: {
    occurred_at?: string;
    merchant?: string | null;
    descriptor?: string | null;
    amount_paise?: number;
    type?: "income" | "expense";
    suggested_category_id?: string | null;
    confidence?: number | null;
  };
  /** When the user corrects category, persist a merchant → category rule. */
  rule?: {
    match: string;
    category_id: string;
    account_id?: string | null;
  };
}

export const commitImportRowFn = createServerFn({ method: "POST" })
  .validator((input: CommitImportRowInput) => {
    if (!input.row_id) throw new Error("row_id is required");
    if (input.patch?.amount_paise !== undefined && input.patch.amount_paise <= 0) {
      throw new Error("amount_paise must be positive");
    }
    if (input.patch?.type && input.patch.type !== "income" && input.patch.type !== "expense") {
      throw new Error("type must be income or expense");
    }
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (data.patch) {
      const patch = data.patch;
      const update: Database["public"]["Tables"]["import_job_rows"]["Update"] = {
        modified_at: new Date().toISOString(),
      };
      if (patch.occurred_at !== undefined) update.occurred_at = patch.occurred_at;
      if (patch.merchant !== undefined) update.merchant = patch.merchant?.trim() || null;
      if (patch.descriptor !== undefined) update.descriptor = patch.descriptor?.trim() || null;
      if (patch.amount_paise !== undefined) update.amount_paise = patch.amount_paise;
      if (patch.type !== undefined) update.type = patch.type;
      if (patch.suggested_category_id !== undefined) {
        update.suggested_category_id = patch.suggested_category_id;
      }
      if (patch.confidence !== undefined) update.confidence = patch.confidence;

      const { error } = await supabase
        .from("import_job_rows")
        .update(update)
        .eq("id", data.row_id)
        .in("status", ["pending", "held"]);
      if (error) throw error;
    }

    const { data: txnId, error } = await supabase.rpc("fn_commit_import_row", {
      p_row_id: data.row_id,
    });
    if (error) throw error;

    let rule_id: string | null = null;
    if (data.rule) {
      const saved = await upsertImportRuleRow(supabase, userId, data.rule);
      rule_id = saved.id;
    }

    return { row_id: data.row_id, transaction_id: txnId as string | null, rule_id };
  });

export interface SkipImportRowInput {
  row_id: string;
}

export const skipImportRowFn = createServerFn({ method: "POST" })
  .validator((input: SkipImportRowInput) => {
    if (!input.row_id) throw new Error("row_id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await setImportRowStatus(context.supabase, data.row_id, "skipped");
    return { row_id: data.row_id, status: "skipped" as const };
  });

export interface ReopenImportRowInput {
  row_id: string;
}

export const reopenImportRowFn = createServerFn({ method: "POST" })
  .validator((input: ReopenImportRowInput) => {
    if (!input.row_id) throw new Error("row_id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await setImportRowStatus(context.supabase, data.row_id, "pending");
    return { row_id: data.row_id, status: "pending" as const };
  });

export interface HoldImportRowInput {
  row_id: string;
}

export const holdImportRowFn = createServerFn({ method: "POST" })
  .validator((input: HoldImportRowInput) => {
    if (!input.row_id) throw new Error("row_id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await setImportRowStatus(context.supabase, data.row_id, "held");
    return { row_id: data.row_id, status: "held" as const };
  });

export interface UpsertImportRuleInput {
  match: string;
  category_id: string;
  account_id?: string | null;
}

export const upsertImportRuleFn = createServerFn({ method: "POST" })
  .validator((input: UpsertImportRuleInput) => {
    if (!input.match?.trim()) throw new Error("match is required");
    if (!input.category_id) throw new Error("category_id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    return upsertImportRuleRow(supabase, userId, data);
  });

export interface RenameImportSourceInput {
  id: string;
  name: string;
}

export const renameImportSourceFn = createServerFn({ method: "POST" })
  .validator((input: RenameImportSourceInput) => {
    if (!input.id) throw new Error("id is required");
    if (!input.name?.trim()) throw new Error("name is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("import_sources")
      .update({ name: data.name.trim(), modified_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { id: data.id };
  });

export interface SetImportSourcePausedInput {
  id: string;
  paused: boolean;
}

export const setImportSourcePausedFn = createServerFn({ method: "POST" })
  .validator((input: SetImportSourcePausedInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const status = data.paused ? "paused" : "idle";
    const { error } = await supabase
      .from("import_sources")
      .update({ status, modified_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;
    return { id: data.id, status };
  });

export interface DismissImportJobInput {
  id: string;
}

/**
 * Abandon a staged job. Rows go first — a dismissed job whose rows survived
 * would keep filling the review queue with no panel left to reach them from.
 * Committed rows are untouched: the ledger keeps whatever was already accepted.
 */
export const dismissImportJobFn = createServerFn({ method: "POST" })
  .validator((input: DismissImportJobInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date().toISOString();

    const rows = await supabase
      .from("import_job_rows")
      .update({ deleted_at: now, is_active: false })
      .eq("job_id", data.id)
      .in("status", ["pending", "held"])
      .is("deleted_at", null);
    if (rows.error) throw rows.error;

    const job = await supabase
      .from("import_jobs")
      .update({ deleted_at: now, is_active: false })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (job.error) throw job.error;

    return { id: data.id };
  });

export interface DisconnectImportSourceInput {
  id: string;
}

export const disconnectImportSourceFn = createServerFn({ method: "POST" })
  .validator((input: DisconnectImportSourceInput) => {
    if (!input.id) throw new Error("id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("import_sources")
      .update({ deleted_at: now, is_active: false, modified_at: now })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw error;

    await supabase
      .from("import_profiles")
      .update({ deleted_at: now, is_active: false, modified_at: now })
      .eq("source_id", data.id)
      .is("deleted_at", null);

    return { id: data.id };
  });
