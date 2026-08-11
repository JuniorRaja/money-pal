/**
 * Server-side mutation functions.
 *
 * These run on the server with the user's authenticated Supabase client,
 * respecting RLS policies. Each function inserts into PostgreSQL and returns
 * the created row's ID so the client can refetch or update local state.
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
  account_id: string;
  category_id: string;
  label_id: string | null;
  note: string | null;
}

export const createTransactionFn = createServerFn({ method: "POST" })
  .validator((input: CreateTransactionInput) => {
    if (!input.occurred_at) throw new Error("occurred_at is required");
    if (!input.merchant) throw new Error("merchant is required");
    if (!input.account_id) throw new Error("account_id is required");
    if (!input.category_id) throw new Error("category_id is required");
    if (input.amount <= 0) throw new Error("amount must be positive");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Determine signed amount based on transaction type
    const signedAmount = data.type === "income" ? Math.abs(data.amount) : -Math.abs(data.amount);

    // Get account currency
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("currency_code")
      .eq("id", data.account_id)
      .single();
    if (accountError) throw accountError;

    // Insert transaction header
    const { data: txn, error: txnError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        occurred_at: `${data.occurred_at}T12:00:00+05:30`,
        type: data.type,
        merchant: data.merchant,
        descriptor: data.descriptor || data.merchant,
        note: data.note,
        category_id: data.category_id,
        label_id: data.label_id,
        payment_method: "Manual",
        source: "manual",
        confidence: 1,
        attachments: 0,
      })
      .select("id")
      .single();
    if (txnError) throw txnError;

    // Insert transaction entry (the actual money movement)
    const { error: entryError } = await supabase.from("transaction_entries").insert({
      transaction_id: txn.id,
      user_id: userId,
      account_id: data.account_id,
      amount: signedAmount,
      currency_code: account.currency_code,
    });
    if (entryError) throw entryError;

    return { id: txn.id };
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

    // Insert account
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name: data.name,
        institution: data.institution,
        kind: data.kind,
        currency_code: "INR",
        opening_balance: signedBalance,
        credit_limit: data.credit_limit,
        is_primary: false,
      })
      .select("id")
      .single();
    if (accountError) throw accountError;

    // Sliceable accounts (bank, cash, investment) get a default slice
    if (data.kind === "bank" || data.kind === "cash" || data.kind === "investment") {
      const { error: sliceError } = await supabase.from("labels").insert({
        user_id: userId,
        account_id: account.id,
        name: "Mine",
        kind: "owned",
        color_token: "chart-2",
        is_default: true,
        opening_amount: signedBalance,
      });
      if (sliceError) throw sliceError;
    }

    return { id: account.id };
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

    // Check if this is the first slice for this account
    const { count } = await supabase
      .from("labels")
      .select("id", { count: "exact", head: true })
      .eq("account_id", data.account_id)
      .is("deleted_at", null);

    const { data: slice, error: sliceError } = await supabase
      .from("labels")
      .insert({
        user_id: userId,
        account_id: data.account_id,
        name: data.name,
        kind: data.kind,
        color_token: data.color_token,
        is_default: (count ?? 0) === 0,
        opening_amount: Math.abs(data.amount),
        target_amount: data.kind === "earmark" ? data.target_amount : null,
        target_date: data.kind === "earmark" ? data.target_date : null,
      })
      .select("id")
      .single();
    if (sliceError) throw sliceError;

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

    // Count siblings
    const { count } = await supabase
      .from("labels")
      .select("id", { count: "exact", head: true })
      .eq("account_id", slice.account_id)
      .neq("id", data.id)
      .is("deleted_at", null);

    // Can't delete the last slice
    if ((count ?? 0) === 0) {
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
