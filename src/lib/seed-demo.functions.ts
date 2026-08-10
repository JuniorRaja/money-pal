/**
 * One-time demo seeding.
 *
 * When a real session exists but the ledger is empty, the local demo data is
 * written into PostgreSQL for that user so every screen shows the same figures
 * it shows offline. It is a no-op once any account exists.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accounts as seedAccounts } from "@/data/seed/accounts";
import { budgetPeriods, goals as seedGoals, holdings as seedHoldings } from "@/data/seed/plan";
import { labels as seedLabels } from "@/data/seed/taxonomy";
import { timelineEvents as seedTimeline } from "@/data/seed/timeline";
import { transactions as seedTransactions } from "@/data/seed/transactions";

/** Mock category ids mapped onto the seeded master category names. */
const CATEGORY_NAMES: Record<string, string> = {
  cat_income: "Salary",
  cat_housing: "Rent & Housing",
  cat_food: "Groceries",
  cat_transport: "Transport",
  cat_utilities: "Utilities",
  cat_shopping: "Shopping",
  cat_entertainment: "Entertainment",
  cat_subscriptions: "Subscriptions",
  cat_health: "Health",
  cat_transfer: "Savings Transfer",
  cat_investment: "Mutual Funds",
};

export const seedDemoLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const existing = await supabase.from("accounts").select("id").limit(1);
    if (existing.error) throw existing.error;
    if (existing.data.length) return { seeded: false as const };

    await supabase
      .from("profiles")
      .upsert({ user_id: userId, base_currency: "INR" }, { onConflict: "user_id" });

    const master = await supabase.from("categories").select("id, name").is("user_id", null);
    if (master.error) throw master.error;
    const categoryByName = new Map(master.data.map((c) => [c.name, c.id]));
    const categoryId = (mockId: string) =>
      categoryByName.get(CATEGORY_NAMES[mockId] ?? "") ?? null;

    // Opening balance keeps the derived balance identical to the demo figure.
    const movement = new Map<string, number>();
    for (const t of seedTransactions) {
      movement.set(t.account_id, (movement.get(t.account_id) ?? 0) + t.amount);
    }

    const insertedAccounts = await supabase
      .from("accounts")
      .insert(
        seedAccounts.map((a) => ({
          user_id: userId,
          name: a.name,
          institution: a.institution,
          kind: a.kind,
          currency_code: "INR",
          opening_balance: a.balance - (movement.get(a.id) ?? 0),
          credit_limit: a.credit_limit,
          is_primary: a.is_primary,
        })),
      )
      .select("id, name");
    if (insertedAccounts.error) throw insertedAccounts.error;
    const accountByMockId = new Map<string, string>();
    for (const a of seedAccounts) {
      const match = insertedAccounts.data.find((row) => row.name === a.name);
      if (match) accountByMockId.set(a.id, match.id);
    }

    const insertedLabels = await supabase
      .from("labels")
      .insert(seedLabels.map((l) => ({ user_id: userId, name: l.name, color_token: l.color_token })))
      .select("id, name");
    if (insertedLabels.error) throw insertedLabels.error;
    const labelByMockId = new Map<string, string>();
    for (const l of seedLabels) {
      const match = insertedLabels.data.find((row) => row.name === l.name);
      if (match) labelByMockId.set(l.id, match.id);
    }

    const insertedTxns = await supabase
      .from("transactions")
      .insert(
        seedTransactions.map((t) => ({
          user_id: userId,
          occurred_at: t.occurred_at,
          type: t.type,
          merchant: t.merchant,
          descriptor: t.descriptor,
          note: t.note,
          category_id: categoryId(t.category_id),
          label_id: t.label_id ? (labelByMockId.get(t.label_id) ?? null) : null,
          payment_method: t.payment_method,
          source: t.source,
          confidence: t.confidence,
          attachments: t.attachments,
          external_ref: `demo:${t.id}`,
        })),
      )
      .select("id, external_ref");
    if (insertedTxns.error) throw insertedTxns.error;
    const txnByMockId = new Map(
      insertedTxns.data.map((row) => [String(row.external_ref).replace("demo:", ""), row.id]),
    );

    const entries = seedTransactions
      .map((t) => ({
        transaction_id: txnByMockId.get(t.id),
        user_id: userId,
        account_id: accountByMockId.get(t.account_id),
        amount: t.amount,
        currency_code: "INR",
      }))
      .filter((e): e is typeof e & { transaction_id: string; account_id: string } =>
        Boolean(e.transaction_id && e.account_id),
      );
    const entryResult = await supabase.from("transaction_entries").insert(entries);
    if (entryResult.error) throw entryResult.error;

    const periods = [...new Set(budgetPeriods.map((b) => b.period))];
    const insertedBudgets = await supabase
      .from("budgets")
      .insert(
        periods.map((p) => ({ user_id: userId, period_month: `${p}-01`, currency_code: "INR" })),
      )
      .select("id, period_month");
    if (insertedBudgets.error) throw insertedBudgets.error;
    const budgetByPeriod = new Map(
      insertedBudgets.data.map((row) => [String(row.period_month).slice(0, 7), row.id]),
    );

    const budgetLines = budgetPeriods
      .map((b) => ({
        budget_id: budgetByPeriod.get(b.period),
        user_id: userId,
        category_id: categoryId(b.category_id),
        planned: b.planned,
      }))
      .filter((l): l is typeof l & { budget_id: string; category_id: string } =>
        Boolean(l.budget_id && l.category_id),
      );
    const lineResult = await supabase.from("budget_lines").insert(budgetLines);
    if (lineResult.error) throw lineResult.error;

    const insertedGoals = await supabase
      .from("goals")
      .insert(
        seedGoals.map((g) => ({
          user_id: userId,
          name: g.name,
          blurb: g.blurb,
          icon: g.icon,
          target_amount: g.target,
          currency_code: "INR",
          target_date: g.target_date,
          account_id: accountByMockId.get(g.account_id) ?? null,
          monthly_contribution: g.monthly_contribution,
        })),
      )
      .select("id, name");
    if (insertedGoals.error) throw insertedGoals.error;
    const contributions = seedGoals
      .map((g) => {
        const match = insertedGoals.data.find((row) => row.name === g.name);
        return match && g.saved > 0
          ? { goal_id: match.id, user_id: userId, amount: g.saved }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    const contribResult = await supabase.from("goal_contributions").insert(contributions);
    if (contribResult.error) throw contribResult.error;

    const investmentAccount =
      seedAccounts.find((a) => a.kind === "investment") ?? seedAccounts[0]!;
    const holdingResult = await supabase.from("holdings").insert(
      seedHoldings.map((h) => ({
        user_id: userId,
        account_id:
          accountByMockId.get(h.account_id) ?? accountByMockId.get(investmentAccount.id)!,
        name: h.name,
        asset_class: h.asset_class,
        units: h.units,
        invested: h.invested,
        last_price: h.units > 0 ? Math.round(h.current_value / h.units) : 0,
        priced_at: new Date().toISOString(),
        currency_code: "INR",
      })),
    );
    if (holdingResult.error) throw holdingResult.error;

    const timelineResult = await supabase.from("timeline_events").insert(
      seedTimeline.map((e) => ({
        user_id: userId,
        occurred_at: e.occurred_at,
        kind: e.kind,
        title: e.title,
        detail: e.detail,
        amount: e.amount,
        currency_code: e.amount === null ? null : "INR",
        account_id: e.account_id ? (accountByMockId.get(e.account_id) ?? null) : null,
        action_label: e.action_label,
      })),
    );
    if (timelineResult.error) throw timelineResult.error;

    return { seeded: true as const };
  });
