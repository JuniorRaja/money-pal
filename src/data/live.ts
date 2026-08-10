/**
 * Live PostgreSQL reads.
 *
 * Every function here returns `null` when there is no signed-in session (or
 * when the backend has nothing for this user yet), which lets
 * `@/data/repository` transparently fall back to the mock ledger. Nothing in
 * the UI knows the difference — the return shapes are the domain types from
 * `@/data/schema`.
 *
 * All reads go through the database views, so no arithmetic is duplicated in
 * TypeScript: balances, budget pacing, goal progress and holdings valuation
 * all arrive pre-computed.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Account,
  BudgetPeriod,
  Category,
  Goal,
  Holding,
  Label,
  MonthlyRollup,
  TimelineEvent,
  Transaction,
} from "@/data/schema";

/** True when a Supabase session exists in this environment (browser only). */
export async function hasSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

/** Runs a live read, swallowing "not signed in" / transport errors. */
async function live<T>(run: () => Promise<T | null>): Promise<T | null> {
  if (!(await hasSession())) return null;
  try {
    return await run();
  } catch (error) {
    console.warn("[live] falling back to local ledger", error);
    return null;
  }
}

const monthKey = (iso: string) => iso.slice(0, 7);

/** Builds a 12 point balance trend that ends at the current balance. */
function trendFor(balance: number, monthlyDeltas: Map<string, number>, months: string[]): number[] {
  const points: number[] = [];
  let running = balance;
  for (let i = months.length - 1; i >= 0; i -= 1) {
    points.unshift(running / 100000);
    running -= monthlyDeltas.get(months[i]!) ?? 0;
  }
  return points.length ? points : [balance / 100000];
}

function lastTwelveMonths(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export const liveAccounts = () =>
  live<Account[]>(async () => {
    const [balances, flow] = await Promise.all([
      supabase.from("v_account_balances").select("*"),
      supabase.from("v_account_monthly_flow").select("*"),
    ]);
    if (balances.error) throw balances.error;
    if (!balances.data?.length) return null;

    const months = lastTwelveMonths();
    const byAccount = new Map<string, { deltas: Map<string, number>; last: string }>();
    for (const row of flow.data ?? []) {
      const key = row.account_id as string;
      const bucket = byAccount.get(key) ?? { deltas: new Map(), last: "" };
      bucket.deltas.set(monthKey(row.period_month as string), Number(row.delta ?? 0));
      const last = (row.last_activity_at as string | null) ?? "";
      if (last > bucket.last) bucket.last = last;
      byAccount.set(key, bucket);
    }

    return balances.data.map((row): Account => {
      const bucket = byAccount.get(row.account_id as string);
      const balance = Number(row.balance ?? 0);
      const trend = trendFor(balance, bucket?.deltas ?? new Map(), months);
      const first = trend[0] ?? 0;
      const last = trend[trend.length - 1] ?? 0;
      return {
        id: row.account_id as string,
        name: row.name as string,
        institution: (row.institution as string | null) ?? "",
        kind: row.kind as Account["kind"],
        balance,
        credit_limit: row.credit_limit === null ? null : Number(row.credit_limit),
        currency: row.currency_code as Account["currency"],
        is_primary: Boolean(row.is_primary),
        last_activity_at: bucket?.last || new Date().toISOString(),
        trend,
        change_pct: first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 100),
      };
    });
  });

export const liveCategories = () =>
  live<Category[]>(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, kind, icon, color_token")
      .order("sort_order");
    if (error) throw error;
    if (!data?.length) return null;
    return data.map(
      (row): Category => ({
        id: row.id,
        name: row.name,
        group: row.kind as Category["group"],
        icon: row.icon ?? "circle",
        color_token: row.color_token ?? "chart-1",
      }),
    );
  });

export const liveLabels = () =>
  live<Label[]>(async () => {
    const { data, error } = await supabase.from("labels").select("id, name, color_token");
    if (error) throw error;
    if (!data?.length) return null;
    return data.map(
      (row): Label => ({ id: row.id, name: row.name, color_token: row.color_token ?? "chart-2" }),
    );
  });

export const liveTransactions = () =>
  live<Transaction[]>(async () => {
    const { data, error } = await supabase
      .from("v_transactions_flat")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    if (!data?.length) return null;
    return data.map(
      (row): Transaction => ({
        id: row.entry_id as string,
        occurred_at: row.occurred_at as string,
        merchant: (row.merchant as string | null) ?? "—",
        descriptor: (row.descriptor as string | null) ?? "",
        amount: Number(row.amount ?? 0),
        type: row.type as Transaction["type"],
        account_id: row.account_id as string,
        category_id: (row.category_id as string | null) ?? "",
        label_id: (row.label_id as string | null) ?? null,
        payment_method: (row.payment_method as string | null) ?? "",
        source: (row.source as string | null) ?? "manual",
        confidence: Number(row.confidence ?? 1),
        note: (row.note as string | null) ?? null,
        attachments: Number(row.attachments ?? 0),
      }),
    );
  });

export const liveTimeline = () =>
  live<TimelineEvent[]>(async () => {
    const { data, error } = await supabase
      .from("timeline_events")
      .select("id, occurred_at, kind, title, detail, amount, account_id, action_label")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!data?.length) return null;
    return data.map(
      (row): TimelineEvent => ({
        id: row.id,
        occurred_at: row.occurred_at,
        kind: row.kind as TimelineEvent["kind"],
        title: row.title,
        detail: row.detail ?? "",
        amount: row.amount === null ? null : Number(row.amount),
        account_id: row.account_id,
        action_label: row.action_label,
      }),
    );
  });

export const liveBudgets = (period: string) =>
  live<BudgetPeriod[]>(async () => {
    const { data, error } = await supabase
      .from("v_budget_progress")
      .select("*")
      .eq("period_month", `${period}-01`);
    if (error) throw error;
    if (!data?.length) return null;
    return data.map(
      (row): BudgetPeriod => ({
        id: `${period}-${row.category_id as string}`,
        period,
        category_id: row.category_id as string,
        planned: Number(row.planned ?? 0),
        spent: Number(row.spent ?? 0),
      }),
    );
  });

export const liveGoals = () =>
  live<Goal[]>(async () => {
    const { data, error } = await supabase.from("v_goal_progress").select("*");
    if (error) throw error;
    if (!data?.length) return null;
    return data.map(
      (row): Goal => ({
        id: row.goal_id as string,
        name: row.name as string,
        blurb: (row.blurb as string | null) ?? "",
        target: Number(row.target_amount ?? 0),
        saved: Number(row.saved ?? 0),
        target_date: (row.target_date as string | null) ?? "",
        account_id: "",
        monthly_contribution: Number(row.monthly_contribution ?? 0),
        icon: (row.icon as string | null) ?? "target",
      }),
    );
  });

export const liveHoldings = () =>
  live<Holding[]>(async () => {
    const { data, error } = await supabase.from("v_holdings_valuation").select("*");
    if (error) throw error;
    if (!data?.length) return null;
    return data.map((row): Holding => {
      const invested = Number(row.invested ?? 0);
      const current = Number(row.current_value ?? 0);
      return {
        id: row.id as string,
        name: row.name as string,
        asset_class: row.asset_class as Holding["asset_class"],
        units: Number(row.units ?? 0),
        invested,
        current_value: current,
        day_change_pct:
          invested === 0 ? 0 : Math.round(((current - invested) / invested) * 1000) / 10,
        account_id: row.account_id as string,
      };
    });
  });

export const liveMonthlyRollups = () =>
  live<MonthlyRollup[]>(async () => {
    const [cashflow, budgets] = await Promise.all([
      supabase.from("v_monthly_cashflow").select("*").order("period_month"),
      supabase.from("v_budget_progress").select("period_month, planned"),
    ]);
    if (cashflow.error) throw cashflow.error;
    if ((cashflow.data?.length ?? 0) < 3) return null;

    const planned = new Map<string, number>();
    for (const row of budgets.data ?? []) {
      const key = monthKey(row.period_month as string);
      planned.set(key, (planned.get(key) ?? 0) + Number(row.planned ?? 0));
    }
    const merged = new Map<string, MonthlyRollup>();
    for (const row of cashflow.data ?? []) {
      const period = monthKey(row.period_month as string);
      const prev = merged.get(period);
      merged.set(period, {
        period,
        income: (prev?.income ?? 0) + Number(row.income ?? 0),
        expense: (prev?.expense ?? 0) + Number(row.expense ?? 0),
        planned: planned.get(period) ?? 0,
      });
    }
    return [...merged.values()].sort((a, b) => (a.period < b.period ? -1 : 1)).slice(-12);
  });
