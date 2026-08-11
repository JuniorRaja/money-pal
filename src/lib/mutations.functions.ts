/**
 * Server-side mutation functions.
 *
 * These run on the server with the user's authenticated Supabase client,
 * respecting RLS policies. Ledger writes go through atomic Postgres RPCs.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AccountKind, HoldingClass, SliceKind, TransactionType } from "@/data/schema";

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
    if (input.merchant !== undefined && !input.merchant.trim()) throw new Error("merchant cannot be empty");
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

    const { error } = await supabase.from("labels").update(patch).eq("id", data.id).is("deleted_at", null);
    if (error) throw error;

    return { id: data.id };
  });

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
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Insert goal
    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .insert({
        user_id: userId,
        name: data.name,
        blurb: data.blurb,
        icon: "flag",
        target_amount: data.target,
        currency_code: "INR",
        target_date: data.target_date || null,
        account_id: data.account_id || null,
        monthly_contribution: data.monthly_contribution,
      })
      .select("id")
      .single();
    if (goalError) throw goalError;

    // If there's an initial saved amount, create a contribution
    if (data.saved > 0) {
      const { error: contribError } = await supabase.from("goal_contributions").insert({
        goal_id: goal.id,
        user_id: userId,
        amount: data.saved,
        contributed_on: new Date().toISOString().slice(0, 10),
      });
      if (contribError) throw contribError;
    }

    return { id: goal.id };
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

    // Get or create the budget for this period
    const periodMonth = `${data.period}-01`;

    let budgetId: string;

    const { data: existingBudget } = await supabase
      .from("budgets")
      .select("id")
      .eq("user_id", userId)
      .eq("period_month", periodMonth)
      .is("deleted_at", null)
      .single();

    if (existingBudget) {
      budgetId = existingBudget.id;
    } else {
      const { data: newBudget, error: budgetError } = await supabase
        .from("budgets")
        .insert({
          user_id: userId,
          period_month: periodMonth,
          currency_code: "INR",
        })
        .select("id")
        .single();
      if (budgetError) throw budgetError;
      budgetId = newBudget.id;
    }

    // Upsert the budget line for this category
    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .upsert(
        {
          budget_id: budgetId,
          user_id: userId,
          category_id: data.category_id,
          planned: data.planned,
        },
        { onConflict: "budget_id,category_id" },
      )
      .select("id")
      .single();
    if (lineError) throw lineError;

    return { id: line.id };
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
