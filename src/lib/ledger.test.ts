/**
 * Ledger invariant tests — items 1-6 from P2-1.
 *
 * Requires a running Supabase instance with all migrations applied.
 * Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TESTING_USERID, TESTING_PASSWORD.
 * If any of these are absent the entire describe block is skipped gracefully.
 *
 * Uses the existing test-user credentials (no service role key needed).
 * Each test creates named resources and tracks their IDs for cleanup in `after`.
 * Budget tests use far-future months (2099-xx) to avoid collisions with any
 * pre-existing data on the shared test account.
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.TESTING_USERID;
const testPassword = process.env.TESTING_PASSWORD;

const SKIP_REASON =
  !url || !anonKey || !testEmail || !testPassword
    ? "set SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / TESTING_USERID / TESTING_PASSWORD to run ledger tests"
    : false;

describe("ledger invariants", { skip: SKIP_REASON }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId = "";
  let diningCatId = "";

  // IDs to delete in after() — accounts cascade-delete labels + entries.
  const cleanupAccounts: string[] = [];
  const cleanupBudgets: string[] = [];
  const cleanupGoals: string[] = [];

  before(async () => {
    db = createClient(url!, anonKey!, { auth: { persistSession: false } });

    const { error: signErr } = await db.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signErr) throw signErr;

    const {
      data: { user },
      error: userErr,
    } = await db.auth.getUser();
    if (userErr || !user) throw userErr ?? new Error("could not get test user");
    userId = user.id as string;

    const { data: cat, error: catErr } = await db
      .from("categories")
      .select("id")
      .eq("name", "Dining")
      .is("user_id", null)
      .single();
    if (catErr || !cat) throw new Error("Dining category not found — run migrations first");
    diningCatId = cat.id as string;
  });

  after(async () => {
    // Delete in dependency order: goals/budgets first, then accounts (which cascade entries/labels).
    if (cleanupGoals.length) await db.from("goals").delete().in("id", cleanupGoals);
    if (cleanupBudgets.length) await db.from("budgets").delete().in("id", cleanupBudgets);
    if (cleanupAccounts.length) await db.from("accounts").delete().in("id", cleanupAccounts);
    await db.auth.signOut();
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  async function makeAccount(name: string, kind: "bank" | "cash" = "bank") {
    const { data, error } = await db
      .from("accounts")
      .insert({ user_id: userId, name, kind, currency_code: "INR" })
      .select("id")
      .single();
    if (error) throw error;
    cleanupAccounts.push(data.id as string);
    return data.id as string;
  }

  async function makeBudget(period: string) {
    const { data, error } = await db
      .from("budgets")
      .insert({ user_id: userId, period_month: period, currency_code: "INR" })
      .select("id")
      .single();
    if (error) throw error;
    cleanupBudgets.push(data.id as string);
    return data.id as string;
  }

  async function makeGoal(name: string) {
    const { data, error } = await db
      .from("goals")
      .insert({
        user_id: userId,
        name,
        target_amount: 500_000,
        currency_code: "INR",
        monthly_contribution: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    cleanupGoals.push(data.id as string);
    return data.id as string;
  }

  async function defaultSlice(accountId: string) {
    const { data, error } = await db
      .from("labels")
      .select("id")
      .eq("account_id", accountId)
      .eq("is_default", true)
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function acctBalance(accountId: string): Promise<number> {
    const { data } = await db
      .from("v_account_balances")
      .select("balance")
      .eq("account_id", accountId)
      .single();
    return data.balance as number;
  }

  async function sliceSum(accountId: string): Promise<number> {
    const { data } = await db
      .from("v_account_slices")
      .select("amount")
      .eq("account_id", accountId);
    return ((data ?? []) as { amount: number }[]).reduce((s, r) => s + r.amount, 0);
  }

  /** Record an income or expense via fn_record_transaction (RPC-only path). */
  async function record(
    type: "income" | "expense",
    accountId: string,
    amount: number,
    opts: {
      label?: string | null;
      category?: string;
      occurred_at?: string;
    } = {},
  ): Promise<string> {
    const { data, error } = await db.rpc("fn_record_transaction", {
      p_occurred_at: opts.occurred_at ?? "2026-08-15T06:30:00+00:00",
      p_type: type,
      p_from_account: accountId,
      p_amount: amount,
      p_category: opts.category ?? diningCatId,
      p_from_label: opts.label ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  // ── I2: labels cannot drift ───────────────────────────────────────────────

  it("I2: slice sum equals account balance after record, edit, delete", async () => {
    const acctId = await makeAccount("i2-bank");
    const sliceId = await defaultSlice(acctId);

    assert.equal(await acctBalance(acctId), 0);
    assert.equal(await sliceSum(acctId), 0);

    const txnId = await record("expense", acctId, 50_000, { label: sliceId });
    assert.equal(await acctBalance(acctId), -50_000);
    assert.equal(await sliceSum(acctId), await acctBalance(acctId)); // I2

    const { error: updErr } = await db.rpc("fn_update_transaction", {
      p_transaction_id: txnId,
      p_amount: 80_000,
    });
    if (updErr) throw updErr;
    assert.equal(await acctBalance(acctId), -80_000);
    assert.equal(await sliceSum(acctId), await acctBalance(acctId)); // I2

    const { error: delErr } = await db.rpc("fn_delete_transaction", {
      p_transaction_id: txnId,
    });
    if (delErr) throw delErr;
    assert.equal(await acctBalance(acctId), 0);
    assert.equal(await sliceSum(acctId), await acctBalance(acctId)); // I2
  });

  // ── I1: entries balance ───────────────────────────────────────────────────

  it("I1: transfer entries sum to zero", async () => {
    // ponytail: no DB-level CHECK constraint enforces this — the invariant is
    // maintained by fn_record_transaction alone. A direct service_role insert
    // of an unbalanced entry would succeed. Add a check trigger if that path
    // ever opens up.
    const fromId = await makeAccount("i1-from");
    const toId = await makeAccount("i1-to");

    const { data: txnId, error } = await db.rpc("fn_record_transaction", {
      p_occurred_at: "2026-08-15T06:30:00+00:00",
      p_type: "transfer",
      p_from_account: fromId,
      p_amount: 100_000,
      p_to_account: toId,
    });
    if (error) throw error;

    const { data: entries, error: entryErr } = await db
      .from("transaction_entries")
      .select("amount")
      .eq("transaction_id", txnId)
      .is("deleted_at", null);
    if (entryErr) throw entryErr;

    const sum = ((entries ?? []) as { amount: number }[]).reduce((s, e) => s + e.amount, 0);
    assert.equal(sum, 0, "transfer entry amounts must sum to zero");
    assert.equal((entries as unknown[]).length, 2, "transfer must produce exactly two entries");
  });

  // ── Net worth excludes custodial ──────────────────────────────────────────

  it("net worth view excludes custodial slices from owned_net_worth", async () => {
    const acctId = await makeAccount("nw-bank");

    const { data: nw0 } = await db
      .from("v_net_worth_owned")
      .select("net_worth, owned_net_worth, custodial_total")
      .eq("user_id", userId)
      .single();

    const { data: custSlice, error: slErr } = await db
      .from("labels")
      .insert({
        user_id: userId,
        name: "Mum's money",
        color_token: "chart-3",
        account_id: acctId,
        kind: "custodial",
        opening_amount: 0,
        is_default: false,
      })
      .select("id")
      .single();
    if (slErr) throw slErr;

    await record("income", acctId, 30_000, { label: custSlice.id });

    const { data: nw1 } = await db
      .from("v_net_worth_owned")
      .select("net_worth, owned_net_worth, custodial_total")
      .eq("user_id", userId)
      .single();

    // Total balance grew by 30k.
    assert.equal(nw1.net_worth - nw0.net_worth, 30_000);
    // Custodial total grew by 30k.
    assert.equal(nw1.custodial_total - nw0.custodial_total, 30_000);
    // Owned net worth is unchanged — custodial is subtracted.
    assert.equal(nw1.owned_net_worth - nw0.owned_net_worth, 0);
    // The formula always holds: owned = total - custodial.
    assert.equal(nw1.owned_net_worth, nw1.net_worth - nw1.custodial_total);
  });

  // ── Budget: spent is derived (DECISIONS #2) ───────────────────────────────

  it("budget: spent is derived — create, edit, delete update progress with no reconciliation", async () => {
    const acctId = await makeAccount("budget-bank");
    // Far-future month avoids collisions with pre-existing test-user data.
    const period = "2099-05-01";
    const budId = await makeBudget(period);

    const { error: lineErr } = await db.from("budget_lines").insert({
      budget_id: budId,
      user_id: userId,
      category_id: diningCatId,
      planned: 200_00,
    });
    if (lineErr) throw lineErr;

    async function getSpent(): Promise<number> {
      const { data } = await db
        .from("v_budget_progress")
        .select("spent")
        .eq("period_month", period)
        .eq("category_id", diningCatId)
        .single();
      return (data?.spent ?? 0) as number;
    }

    assert.equal(await getSpent(), 0, "no transactions yet — spent must be zero");

    const txnId = await record("expense", acctId, 50_00, {
      category: diningCatId,
      occurred_at: "2099-05-15T06:30:00+00:00", // noon IST = 06:30 UTC, same calendar month
    });
    assert.equal(await getSpent(), 50_00, "spent must reflect the transaction");

    const { error: updErr } = await db.rpc("fn_update_transaction", {
      p_transaction_id: txnId,
      p_amount: 80_00,
    });
    if (updErr) throw updErr;
    assert.equal(await getSpent(), 80_00, "spent must update after edit");

    const { error: delErr } = await db.rpc("fn_delete_transaction", {
      p_transaction_id: txnId,
    });
    if (delErr) throw delErr;
    assert.equal(await getSpent(), 0, "spent must return to zero after delete");
  });

  // ── Goal: saved is stored contributions (DECISIONS #6, #7) ───────────────

  it("goal: saved is stored contributions — unlink and txn delete leave saved unchanged", async () => {
    const acctId = await makeAccount("goal-bank");
    const goalId = await makeGoal("Kerala Trip");

    const txnId = await record("income", acctId, 30_000);

    const { error: contribErr } = await db.from("goal_contributions").insert({
      goal_id: goalId,
      user_id: userId,
      amount: 30_000,
      contributed_on: "2026-08-15",
      transaction_id: txnId,
    });
    if (contribErr) throw contribErr;

    async function getSaved(): Promise<number> {
      const { data } = await db
        .from("v_goal_progress")
        .select("saved")
        .eq("goal_id", goalId)
        .single();
      return (data?.saved ?? 0) as number;
    }

    assert.equal(await getSaved(), 30_000);

    // Unlink: clear transaction_id (DECISIONS #7 — saved must not change).
    const { error: unlinkErr } = await db
      .from("goal_contributions")
      .update({ transaction_id: null })
      .eq("goal_id", goalId);
    if (unlinkErr) throw unlinkErr;
    assert.equal(await getSaved(), 30_000, "unlink must not change saved");

    const { error: delErr } = await db.rpc("fn_delete_transaction", {
      p_transaction_id: txnId,
    });
    if (delErr) throw delErr;
    assert.equal(await getSaved(), 30_000, "deleting linked txn must not change saved");
  });

  // ── No budget rollover (DECISIONS #1) ────────────────────────────────────

  it("no rollover: overspent month does not alter next month's planned or spent", async () => {
    const acctId = await makeAccount("rollover-bank");

    // Month A (2099-06): planned ₹200, overspend with ₹500.
    const monthA = "2099-06-01";
    const budAId = await makeBudget(monthA);
    const { error: lineAErr } = await db.from("budget_lines").insert({
      budget_id: budAId,
      user_id: userId,
      category_id: diningCatId,
      planned: 200_00,
    });
    if (lineAErr) throw lineAErr;

    await record("expense", acctId, 500_00, {
      category: diningCatId,
      occurred_at: "2099-06-15T06:30:00+00:00",
    });

    const { data: progressA } = await db
      .from("v_budget_progress")
      .select("spent, planned")
      .eq("period_month", monthA)
      .eq("category_id", diningCatId)
      .single();
    assert.ok(
      progressA.spent > progressA.planned,
      "June 2099 must show as overspent for this test to be meaningful",
    );

    // Month B (2099-07): independent budget.
    const monthB = "2099-07-01";
    const budBId = await makeBudget(monthB);
    const { error: lineBErr } = await db.from("budget_lines").insert({
      budget_id: budBId,
      user_id: userId,
      category_id: diningCatId,
      planned: 100_00,
    });
    if (lineBErr) throw lineBErr;

    const { data: progressB } = await db
      .from("v_budget_progress")
      .select("spent, planned")
      .eq("period_month", monthB)
      .eq("category_id", diningCatId)
      .single();

    assert.equal(progressB.planned, 100_00, "July 2099 planned must be its own value, not rolled over");
    assert.equal(progressB.spent, 0, "July 2099 spent must start at zero regardless of June overspend");
  });
});
