/**
 * Live PostgreSQL reads.
 *
 * Every function here queries Supabase and returns the domain types from
 * `@/data/schema`. When there is no data yet (new user), empty arrays are
 * returned so the UI can render an appropriate empty state.
 *
 * All reads go through the database views, so no arithmetic is duplicated in
 * TypeScript: balances, budget pacing, goal progress and holdings valuation
 * all arrive pre-computed.
 */
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import { createServerSupabase } from "@/integrations/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  Account,
  AccountAllocation,
  BankPreset,
  BudgetPeriod,
  Category,
  CategorySpend,
  CreditCardCycle,
  Goal,
  GoalContribution,
  Holding,
  ImportJob,
  ImportJobRow,
  ImportMapping,
  ImportProfile,
  ImportReviewItem,
  ImportRowStatus,
  ImportRule,
  ImportSource,
  ImportSourceKind,
  Label,
  MonthlyRollup,
  NotificationChannel,
  ReviewKind,
  Slice,
  TimelineEvent,
  Transaction,
  UserSettings,
} from "@/data/schema";
import { IMPORT_LOW_CONFIDENCE_MAX, THEME_PATTERNS } from "@/data/schema";
// Imported straight from the module, not the `@/lib/import` barrel — that barrel
// pulls in the SheetJS/papaparse parser, which has no business in a read path.
import {
  matchNearDuplicates,
  signedAmountPaise,
  type MatchableTransaction,
} from "@/lib/import/near-duplicate";
import { dayKey } from "@/lib/money";
import { periodBounds } from "@/lib/period";

/** Browser singleton in the browser; a fresh request-scoped client on the server. */
async function getSupabase(): Promise<SupabaseClient<Database>> {
  if (typeof window !== "undefined") return browserSupabase;
  return createServerSupabase();
}

/** getSession() revalidates nothing browser-side (fine, it's local); getClaims() verifies the JWT server-side. */
async function checkSession(supabase: SupabaseClient<Database>): Promise<boolean> {
  try {
    if (typeof window === "undefined") {
      const { data, error } = await supabase.auth.getClaims();
      return !error && Boolean(data?.claims);
    }
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

/** True when a Supabase session exists in this environment. */
export async function hasSession(): Promise<boolean> {
  return checkSession(await getSupabase());
}

/** True when an error means "your token is dead," as opposed to an RLS/query bug. */
export function isAuthError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  // PGRST303 ("JWT issued at future") is a transient Supabase clock-skew blip
  // right after sign-in, not a dead session — React Query's default retry
  // resolves it within seconds. Signing the user out on it is the actual bug.
  if (code === "PGRST303") return false;
  const status = (error as { status?: number } | null)?.status;
  const message = (error as { message?: string } | null)?.message ?? "";
  return code === "PGRST301" || status === 401 || /jwt/i.test(message);
}

/** Runs a live read. Returns empty fallback when not signed in; rethrows real query failures. */
async function live<T>(
  run: (supabase: SupabaseClient<Database>) => Promise<T>,
  fallback: T,
): Promise<T> {
  const supabase = await getSupabase();
  if (!(await checkSession(supabase))) return fallback;
  try {
    return await run(supabase);
  } catch (error) {
    console.error("[live] query failed", error);
    throw error;
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

export const liveAccounts = (): Promise<Account[]> =>
  live<Account[]>(async (supabase) => {
    const [balances, flow] = await Promise.all([
      supabase.from("v_account_balances").select("*"),
      supabase.from("v_account_monthly_flow").select("*"),
    ]);
    if (balances.error) throw balances.error;
    if (!balances.data?.length) return [];

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
        bill_generation_day:
          row.bill_generation_day === null ? null : Number(row.bill_generation_day),
        due_day: row.due_day === null ? null : Number(row.due_day),
        interest_rate_bps: row.interest_rate_bps === null ? null : Number(row.interest_rate_bps),
        emi_amount: row.emi_amount === null ? null : Number(row.emi_amount),
        tenure_months: row.tenure_months === null ? null : Number(row.tenure_months),
        lender: (row.lender as string | null) ?? null,
        used_amount:
          row.used_amount === null || row.used_amount === undefined
            ? null
            : Number(row.used_amount),
        currency: row.currency_code as Account["currency"],
        is_primary: Boolean(row.is_primary),
        last_activity_at: bucket?.last || new Date().toISOString(),
        trend,
        change_pct: first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 100),
      };
    });
  }, []);

export const liveCreditCardCycles = (accountId?: string): Promise<CreditCardCycle[]> =>
  live<CreditCardCycle[]>(async (supabase) => {
    let query = supabase
      .from("v_credit_card_cycles")
      .select(
        "id, account_id, statement_date, due_date, credit_limit, statement_balance, payment_due_amount, minimum_due, amount_paid, is_current, notes",
      )
      .order("statement_date", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row): CreditCardCycle => ({
      id: row.id ?? "",
      account_id: row.account_id ?? "",
      statement_date: row.statement_date ?? "",
      due_date: row.due_date ?? "",
      credit_limit: Number(row.credit_limit),
      statement_balance: Number(row.statement_balance),
      payment_due_amount: Number(row.payment_due_amount),
      minimum_due: Number(row.minimum_due),
      amount_paid: Number(row.amount_paid),
      is_current: Boolean(row.is_current),
      notes: row.notes ?? null,
    }));
  }, []);

export const liveCategories = (): Promise<Category[]> =>
  live<Category[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, kind, icon, color_token, parent_id, deleted_at")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []).map((row): Category => ({
      id: row.id,
      name: row.name,
      group: row.kind as Category["group"],
      icon: row.icon ?? "circle",
      color_token: row.color_token ?? "chart-1",
      parent_id: row.parent_id ?? null,
      deleted_at: row.deleted_at ?? null,
    }));
  }, []);

const NO_NOTIFICATION_CHANNEL: NotificationChannel = {
  telegram_bot_token: null,
  telegram_chat_id: null,
  telegram_enabled: false,
  last_digest_sent_at: null,
  email_enabled: false,
  smtp_host: null,
  smtp_port: null,
  smtp_user: null,
  smtp_pass: null,
  smtp_from: null,
  last_email_sent_at: null,
};

export const liveNotificationChannel = (): Promise<NotificationChannel> =>
  live<NotificationChannel>(async (supabase) => {
    const { data, error } = await supabase
      .from("notification_channels")
      .select(
        "telegram_bot_token, telegram_chat_id, telegram_enabled, last_digest_sent_at, email_enabled, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, last_email_sent_at",
      )
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    // Merge with defaults for any missing fields (handles migration transition)
    return data ? { ...NO_NOTIFICATION_CHANNEL, ...data } : NO_NOTIFICATION_CHANNEL;
  }, NO_NOTIFICATION_CHANNEL);

/**
 * Profile row → `UserSettings`. Every field here has been a column since the
 * baseline migration; nothing read them until Phase 2, so the defaults below
 * are also what a profile-less session (or a signed-out SSR pass) renders.
 */
export const DEFAULT_SETTINGS: UserSettings = {
  user_id: "",
  display_name: "",
  email: "",
  currency: "INR",
  week_starts_on: "Monday",
  number_format: "indian",
  round_to_nearest: true,
  theme: "light",
  accent: "Antique gold",
  theme_pattern: "mountain",
  sidebar: "expanded",
  reduce_motion: false,
  assistant_tone: "concise",
  assistant_context: true,
  timeline_seen_at: null,
};

/** Postgres stores an ISO weekday (0=Sun..6=Sat); the UI only offers two of them. */
const weekStartLabel = (n: number): UserSettings["week_starts_on"] =>
  n === 0 ? "Sunday" : "Monday";

const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

export const liveSettings = (): Promise<UserSettings> =>
  live<UserSettings>(async (supabase) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, email, week_starts_on, number_format, round_to_nearest, theme, accent, theme_pattern, sidebar, reduce_motion, assistant_tone, assistant_context, timeline_seen_at",
      )
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return DEFAULT_SETTINGS;
    return {
      user_id: data.user_id,
      display_name: data.display_name ?? "",
      email: data.email ?? "",
      // Only INR exists in `currencies` today; the column is there for later.
      currency: "INR",
      week_starts_on: weekStartLabel(data.week_starts_on),
      number_format: oneOf(data.number_format, ["indian", "international"] as const, "indian"),
      round_to_nearest: data.round_to_nearest,
      theme: oneOf(data.theme, ["light", "dark"] as const, "light"),
      accent: data.accent ?? DEFAULT_SETTINGS.accent,
      theme_pattern: oneOf(data.theme_pattern, THEME_PATTERNS, "mountain"),
      sidebar: oneOf(data.sidebar, ["expanded", "collapsed"] as const, "expanded"),
      reduce_motion: data.reduce_motion,
      assistant_tone: oneOf(data.assistant_tone, ["concise", "detailed"] as const, "concise"),
      assistant_context: data.assistant_context,
      timeline_seen_at: data.timeline_seen_at,
    };
  }, DEFAULT_SETTINGS);

export const liveLabels = (): Promise<Label[]> =>
  live<Label[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("labels")
      .select("id, name, color_token, account_id, kind, is_default");
    if (error) throw error;
    return (data ?? []).map((row): Label => ({
      id: row.id,
      name: row.name,
      color_token: row.color_token ?? "chart-2",
      account_id: row.account_id ?? null,
      kind: (row.kind as Label["kind"]) ?? "owned",
      is_default: Boolean(row.is_default),
    }));
  }, []);

/** Slices of every account, with amounts derived in SQL. */
export const liveSlices = (): Promise<Slice[]> =>
  live<Slice[]>(async (supabase) => {
    const { data, error } = await supabase.from("v_account_slices").select("*");
    if (error) throw error;
    return (data ?? []).map((row): Slice => ({
      id: row.slice_id as string,
      account_id: row.account_id as string,
      name: row.name as string,
      kind: row.kind as Slice["kind"],
      color_token: (row.color_token as string | null) ?? "chart-2",
      is_default: Boolean(row.is_default),
      amount: Number(row.amount ?? 0),
      opening_amount: Number(row.opening_amount ?? 0),
      target_amount: row.target_amount === null ? null : Number(row.target_amount),
      target_date: (row.target_date as string | null) ?? null,
    }));
  }, []);

/** Allocated vs unallocated money per account. */
export const liveAllocations = (): Promise<AccountAllocation[]> =>
  live<AccountAllocation[]>(async (supabase) => {
    const { data, error } = await supabase.from("v_account_allocation").select("*");
    if (error) throw error;
    return (data ?? []).map((row): AccountAllocation => ({
      account_id: row.account_id as string,
      balance: Number(row.balance ?? 0),
      allocated: Number(row.allocated ?? 0),
      unallocated: Number(row.unallocated ?? 0),
      slice_count: Number(row.slice_count ?? 0),
      owned: Number(row.owned_amount ?? 0),
      custodial: Number(row.custodial_amount ?? 0),
      earmarked: Number(row.earmarked_amount ?? 0),
    }));
  }, []);

export const liveTransactions = (period?: string): Promise<Transaction[]> =>
  live<Transaction[]>(async (supabase) => {
    let query = supabase
      .from("v_transactions_flat")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(500);
    // Server-side month filter: a scoped read returns one month (well under the
    // 500 cap), so old months stay visible instead of being truncated away.
    if (period) {
      const { start, end } = periodBounds(period);
      query = query.gte("occurred_at", start).lt("occurred_at", end);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];

    // Pair transfer legs so each entry knows its counterparty account.
    const byTxn = new Map<string, typeof rows>();
    for (const row of rows) {
      const tid = (row.transaction_id as string | null) ?? (row.id as string);
      const list = byTxn.get(tid) ?? [];
      list.push(row);
      byTxn.set(tid, list);
    }

    return rows.map((row): Transaction => {
      const tid = (row.transaction_id as string | null) ?? (row.id as string);
      const siblings = byTxn.get(tid) ?? [];
      const counterparty =
        row.type === "transfer"
          ? ((siblings.find((s) => s.entry_id !== row.entry_id)?.account_id as
            string | undefined) ?? null)
          : null;
      return {
        id: row.entry_id as string,
        transaction_id: tid,
        occurred_at: row.occurred_at as string,
        merchant: (row.merchant as string | null) ?? "—",
        descriptor: (row.descriptor as string | null) ?? "",
        amount: Number(row.amount ?? 0),
        type: row.type as Transaction["type"],
        account_id: row.account_id as string,
        counterparty_account_id: counterparty,
        category_id: (row.category_id as string | null) ?? "",
        label_id: (row.label_id as string | null) ?? null,
        payment_method: (row.payment_method as string | null) ?? "",
        source: (row.source as string | null) ?? "manual",
        confidence: Number(row.confidence ?? 1),
        note: (row.note as string | null) ?? null,
        attachments: Number(row.attachments ?? 0),
      };
    });
  }, []);

export const liveTimeline = (): Promise<TimelineEvent[]> =>
  live<TimelineEvent[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("timeline_events")
      .select("id, occurred_at, kind, title, detail, amount, account_id, action_label")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((row): TimelineEvent => ({
      id: row.id,
      occurred_at: row.occurred_at,
      kind: row.kind as TimelineEvent["kind"],
      title: row.title,
      detail: row.detail ?? "",
      amount: row.amount === null ? null : Number(row.amount),
      account_id: row.account_id,
      action_label: row.action_label,
    }));
  }, []);

export const liveBudgets = (period: string): Promise<BudgetPeriod[]> =>
  live<BudgetPeriod[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("v_budget_progress")
      .select("*")
      .eq("period_month", `${period}-01`);
    if (error) throw error;
    return (data ?? []).map((row): BudgetPeriod => ({
      id: row.budget_line_id as string,
      budget_id: (row.budget_id as string) ?? "",
      period,
      category_id: row.category_id as string,
      planned: Number(row.planned ?? 0),
      spent: Number(row.spent ?? 0),
    }));
  }, []);

export const liveCategorySpend = (period: string): Promise<CategorySpend[]> =>
  live<CategorySpend[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("v_category_spend")
      .select("category_id, spent")
      .eq("period_month", `${period}-01`);
    if (error) throw error;
    return (data ?? [])
      .filter((row) => row.category_id)
      .map((row): CategorySpend => ({
        category_id: row.category_id as string,
        spent: Number(row.spent ?? 0),
      }));
  }, []);

export const liveGoals = (): Promise<Goal[]> =>
  live<Goal[]>(async (supabase) => {
    const { data, error } = await supabase.from("v_goal_progress").select("*");
    if (error) throw error;
    return (data ?? []).map((row): Goal => ({
      id: row.goal_id as string,
      name: row.name as string,
      blurb: (row.blurb as string | null) ?? "",
      target: Number(row.target_amount ?? 0),
      saved: Number(row.saved ?? 0),
      saved_this_month: Number(row.saved_this_month ?? 0),
      target_date: (row.target_date as string | null) ?? "",
      account_id: (row.account_id as string | null) ?? "",
      monthly_contribution: Number(row.monthly_contribution ?? 0),
      icon: (row.icon as string | null) ?? "target",
      archived: false,
    }));
  }, []);

/** Fetches archived (soft-deleted) goals directly from the goals table. */
export const liveArchivedGoals = (): Promise<Goal[]> =>
  live<Goal[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("goals")
      .select("id, name, blurb, target_amount, target_date, account_id, monthly_contribution, icon")
      .not("deleted_at", "is", null);
    if (error) throw error;

    // For archived goals, we need to fetch their saved amounts from contributions
    const goalIds = (data ?? []).map((g) => g.id);
    if (goalIds.length === 0) return [];

    const { data: contribs } = await supabase
      .from("goal_contributions")
      .select("goal_id, amount")
      .in("goal_id", goalIds)
      .is("deleted_at", null);

    const savedByGoal = new Map<string, number>();
    for (const c of contribs ?? []) {
      savedByGoal.set(c.goal_id, (savedByGoal.get(c.goal_id) ?? 0) + Number(c.amount ?? 0));
    }

    return (data ?? []).map((row): Goal => ({
      id: row.id as string,
      name: row.name as string,
      blurb: (row.blurb as string | null) ?? "",
      target: Number(row.target_amount ?? 0),
      saved: savedByGoal.get(row.id) ?? 0,
      saved_this_month: 0, // Archived goals don't track this month
      target_date: (row.target_date as string | null) ?? "",
      account_id: (row.account_id as string | null) ?? "",
      monthly_contribution: Number(row.monthly_contribution ?? 0),
      icon: (row.icon as string | null) ?? "target",
      archived: true,
    }));
  }, []);

function pickContributionTxn(
  headerId: string,
  goalAccountId: string,
  txns: Transaction[],
): Transaction | undefined {
  const legs = txns.filter((t) => t.transaction_id === headerId);
  if (goalAccountId) {
    const match = legs.find((t) => t.account_id === goalAccountId);
    if (match) return match;
  }
  return legs.find((t) => t.amount < 0) ?? legs[0];
}

export const liveGoalContributions = (): Promise<GoalContribution[]> =>
  live<GoalContribution[]>(async (supabase) => {
    const [contrib, goalsRes, txns] = await Promise.all([
      supabase
        .from("goal_contributions")
        .select("id, goal_id, amount, contributed_on, transaction_id")
        .is("deleted_at", null)
        .order("contributed_on", { ascending: false }),
      supabase.from("goals").select("id, account_id").is("deleted_at", null),
      liveTransactions(),
    ]);
    if (contrib.error) throw contrib.error;
    if (goalsRes.error) throw goalsRes.error;
    const accountByGoal = new Map((goalsRes.data ?? []).map((g) => [g.id, g.account_id ?? ""]));
    return (contrib.data ?? []).map((row): GoalContribution => {
      const headerId = row.transaction_id;
      const txn = headerId
        ? pickContributionTxn(headerId, accountByGoal.get(row.goal_id) ?? "", txns)
        : undefined;
      return {
        id: row.id,
        goal_id: row.goal_id,
        amount: Number(row.amount ?? 0),
        contributed_on: row.contributed_on,
        transaction_id: headerId,
        merchant: txn?.merchant ?? null,
        descriptor: txn?.descriptor ?? null,
      };
    });
  }, []);

export const liveHoldings = (): Promise<Holding[]> =>
  live<Holding[]>(async (supabase) => {
    const { data, error } = await supabase.from("v_holdings_valuation").select("*");
    if (error) throw error;
    return (data ?? []).map((row): Holding => {
      return {
        id: row.id as string,
        name: row.name as string,
        asset_class: row.asset_class as Holding["asset_class"],
        units: Number(row.units ?? 0),
        invested: Number(row.invested ?? 0),
        current_value: Number(row.current_value ?? 0),
        // Real change against the previous close, computed by the view. This used
        // to be since-inception return derived from `invested` and rendered under
        // a "Day" header — a different number wearing the same label.
        day_change_pct: Number(row.day_change_pct ?? 0),
        prev_price: Number(row.prev_price ?? 0),
        symbol: (row.symbol as string | null) ?? null,
        priced_at: (row.priced_at as string | null) ?? null,
        account_id: row.account_id as string,
      };
    });
  }, []);

export const liveMonthlyRollups = (): Promise<MonthlyRollup[]> =>
  live<MonthlyRollup[]>(async (supabase) => {
    const [cashflow, budgets] = await Promise.all([
      supabase.from("v_monthly_cashflow").select("*").order("period_month"),
      supabase.from("v_budget_progress").select("period_month, planned"),
    ]);
    if (cashflow.error) throw cashflow.error;

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
  }, []);

function asMapping(value: unknown): ImportMapping {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ImportMapping;
  }
  return {};
}

function mapJobRow(row: {
  id: string;
  job_id: string;
  account_id: string;
  occurred_at: string;
  merchant: string | null;
  descriptor: string | null;
  note: string | null;
  amount_paise: number;
  type: string;
  raw_line: unknown;
  import_hash: string;
  status: ImportRowStatus;
  suggested_category_id: string | null;
  transaction_id: string | null;
  confidence: number | null;
}): ImportJobRow {
  const type = row.type === "income" ? "income" : "expense";
  return {
    id: row.id,
    job_id: row.job_id,
    account_id: row.account_id,
    occurred_at: row.occurred_at,
    merchant: row.merchant ?? "",
    descriptor: row.descriptor ?? "",
    note: row.note,
    amount_paise: Number(row.amount_paise ?? 0),
    type,
    raw_line: asMapping(row.raw_line),
    import_hash: row.import_hash,
    status: row.status,
    suggested_category_id: row.suggested_category_id,
    transaction_id: row.transaction_id,
    confidence: row.confidence === null ? null : Number(row.confidence),
    possible_duplicate: null,
  };
}

const NEAR_DUPLICATE_CHUNK = 200;
/** Two days of slack on the SQL bound; the exact ±1 IST day test runs in memory. */
const NEAR_DUPLICATE_SLACK_MS = 2 * 86_400_000;

/**
 * Attaches `possible_duplicate` to the rows still awaiting a decision. Computed
 * on every read rather than stored: a stage-time flag goes stale the moment the
 * matched transaction is edited or deleted, and this needs no migration.
 *
 * Only `pending`/`held` rows are matched — a committed row would match the very
 * transaction it created.
 */
async function attachNearDuplicates(
  supabase: SupabaseClient<Database>,
  rows: ImportJobRow[],
): Promise<ImportJobRow[]> {
  const open = rows.filter((row) => row.status === "pending" || row.status === "held");
  if (open.length === 0) return rows;

  const accountIds = [...new Set(open.map((row) => row.account_id))];
  const amounts = [...new Set(open.map(signedAmountPaise))];
  const times = open.map((row) => Date.parse(row.occurred_at));
  const from = new Date(Math.min(...times) - NEAR_DUPLICATE_SLACK_MS).toISOString();
  const to = new Date(Math.max(...times) + NEAR_DUPLICATE_SLACK_MS).toISOString();

  const committed: MatchableTransaction[] = [];
  for (let i = 0; i < amounts.length; i += NEAR_DUPLICATE_CHUNK) {
    const { data, error } = await supabase
      .from("v_transactions_flat")
      .select("transaction_id, account_id, occurred_at, amount, merchant")
      .in("account_id", accountIds)
      .in("amount", amounts.slice(i, i + NEAR_DUPLICATE_CHUNK))
      .gte("occurred_at", from)
      .lte("occurred_at", to);
    if (error) throw error;
    for (const txn of data ?? []) {
      committed.push({
        id: (txn.transaction_id as string | null) ?? "",
        account_id: txn.account_id as string,
        occurred_at: txn.occurred_at as string,
        amount: Number(txn.amount ?? 0),
        merchant: (txn.merchant as string | null) ?? null,
      });
    }
  }

  const matches = matchNearDuplicates(open, committed);
  if (matches.size === 0) return rows;
  return rows.map((row) => ({ ...row, possible_duplicate: matches.get(row.id) ?? null }));
}

function reviewKindFor(row: ImportJobRow): ReviewKind {
  if (row.status === "held") return "held";
  if (row.confidence !== null && row.confidence < IMPORT_LOW_CONFIDENCE_MAX) {
    return "low_confidence";
  }
  return "pending";
}

function mapReviewItem(row: ImportJobRow): ImportReviewItem {
  const kind = reviewKindFor(row);
  const when = dayKey(row.occurred_at);
  return {
    id: row.id,
    kind,
    title: row.merchant || row.descriptor || "Imported row",
    detail: `${when} · ${row.type}`,
    action_label: row.status === "held" ? "Resume" : "Review",
    job_id: row.job_id,
    account_id: row.account_id,
    status: row.status,
    amount_paise: row.amount_paise,
    occurred_at: row.occurred_at,
    suggested_category_id: row.suggested_category_id,
    confidence: row.confidence,
    possible_duplicate: row.possible_duplicate,
  };
}

export const liveImportSources = (): Promise<ImportSource[]> =>
  live<ImportSource[]>(async (supabase) => {
    const [sources, profiles] = await Promise.all([
      supabase
        .from("import_sources")
        .select("id, kind, name, status")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("import_profiles")
        .select("id, account_id, source_id, bank_preset")
        .is("deleted_at", null),
    ]);
    if (sources.error) throw sources.error;
    if (profiles.error) throw profiles.error;

    const profileBySource = new Map<string, (typeof profiles.data)[number]>();
    for (const profile of profiles.data ?? []) {
      if (!profile.source_id) continue;
      if (!profileBySource.has(profile.source_id)) {
        profileBySource.set(profile.source_id, profile);
      }
    }

    return (sources.data ?? []).map((row): ImportSource => {
      const profile = profileBySource.get(row.id);
      return {
        id: row.id,
        kind: row.kind as ImportSourceKind,
        name: row.name,
        status: row.status,
        account_id: profile?.account_id ?? null,
        profile_id: profile?.id ?? null,
        bank_preset: (profile?.bank_preset as BankPreset | undefined) ?? null,
      };
    });
  }, []);

export const liveImportProfiles = (): Promise<ImportProfile[]> =>
  live<ImportProfile[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("import_profiles")
      .select("id, account_id, source_id, bank_preset, mapping")
      .is("deleted_at", null)
      .order("modified_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row): ImportProfile => ({
      id: row.id,
      account_id: row.account_id,
      source_id: row.source_id,
      bank_preset: row.bank_preset,
      mapping: asMapping(row.mapping),
    }));
  }, []);

/** `includeDismissed` is for the archive only — the hub must not resurrect dismissed jobs. */
export const liveImportJobs = (includeDismissed = false): Promise<ImportJob[]> =>
  live<ImportJob[]>(async (supabase) => {
    let query = supabase
      .from("import_jobs")
      .select(
        "id, source_id, title, rows_done, rows_total, finished_at, imported, duplicates, deleted_at",
      );
    if (!includeDismissed) query = query.is("deleted_at", null);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row): ImportJob => ({
      id: row.id,
      source_id: row.source_id,
      title: row.title ?? "",
      rows_done: Number(row.rows_done ?? 0),
      rows_total: Number(row.rows_total ?? 0),
      finished_at: row.finished_at,
      imported: Number(row.imported ?? 0),
      duplicates: Number(row.duplicates ?? 0),
      dismissed_at: row.deleted_at,
    }));
  }, []);

const JOB_ROW_COLUMNS =
  "id, job_id, account_id, occurred_at, merchant, descriptor, note, amount_paise, type, raw_line, import_hash, status, suggested_category_id, transaction_id, confidence";

export const liveImportJobRows = (
  jobId: string,
  statuses?: ImportRowStatus[],
): Promise<ImportJobRow[]> =>
  live<ImportJobRow[]>(async (supabase) => {
    let query = supabase
      .from("import_job_rows")
      .select(JOB_ROW_COLUMNS)
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: true });
    if (statuses?.length) query = query.in("status", statuses);
    const { data, error } = await query;
    if (error) throw error;
    return attachNearDuplicates(
      supabase,
      (data ?? []).map((row) => mapJobRow(row)),
    );
  }, []);

export const liveImportJobQueue = (jobId: string): Promise<ImportJobRow[]> =>
  liveImportJobRows(jobId, ["pending", "held"]);

export const liveImportReviewItems = (): Promise<ImportReviewItem[]> =>
  live<ImportReviewItem[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("import_job_rows")
      .select(JOB_ROW_COLUMNS)
      .in("status", ["pending", "held"])
      .is("deleted_at", null)
      .order("occurred_at", { ascending: true })
      // One 2000-row statement would otherwise ship 2000 rows to the hub, which
      // renders every one of them. The queue is a to-do list, not an archive.
      .limit(200);
    if (error) throw error;
    const rows = await attachNearDuplicates(
      supabase,
      (data ?? []).map((row) => mapJobRow(row)),
    );
    const items = rows.map((row) => mapReviewItem(row));
    const rank = (kind: ReviewKind) => (kind === "held" ? 0 : kind === "low_confidence" ? 1 : 2);
    // Suspected duplicates first inside each kind — they are the rows where a
    // wrong click costs the most.
    return items.sort(
      (a, b) =>
        rank(a.kind) - rank(b.kind) ||
        Number(Boolean(b.possible_duplicate)) - Number(Boolean(a.possible_duplicate)),
    );
  }, []);

export const liveImportRules = (): Promise<ImportRule[]> =>
  live<ImportRule[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("import_rules")
      .select("id, match, category_id, account_id, is_active")
      .is("deleted_at", null)
      .order("match");
    if (error) throw error;
    // Paused rules come back too — Settings lists them; `applyImportRules` skips them.
    return (data ?? []).map((row): ImportRule => ({
      id: row.id,
      match: row.match,
      category_id: row.category_id,
      account_id: row.account_id,
      is_active: row.is_active,
    }));
  }, []);
