/**
 * The single data access boundary for the whole app.
 *
 * Reads are live-first: when a Supabase session exists, every figure comes
 * from the PostgreSQL views (balances, budget pacing, goal progress and
 * holdings valuation are all computed in SQL). With no session — the current
 * mock passphrase login — the in-memory demo ledger answers instead, so the
 * UI is identical either way.
 */
import { accounts } from "@/data/seed/accounts";
import { budgetPeriods, goals, holdings, monthlyRollups } from "@/data/seed/plan";
import { SLICEABLE_KINDS, slices } from "@/data/seed/slices";
import { categories, labels } from "@/data/seed/taxonomy";
import { timelineEvents } from "@/data/seed/timeline";
import { transactions } from "@/data/seed/transactions";
import { importJobs, importReviewItems, importSources, userSettings } from "@/data/seed/workshop";
import {
  liveAccounts,
  liveAllocations,
  liveBudgets,
  liveCategories,
  liveGoals,
  liveHoldings,
  liveLabels,
  liveMonthlyRollups,
  liveSlices,
  liveTimeline,
  liveTransactions,
} from "@/data/live";
import type {
  Account,
  AccountAllocation,
  BudgetPeriod,
  Category,
  Goal,
  Holding,
  ImportJob,
  ImportReviewItem,
  ImportSource,
  Label,
  MonthlyRollup,
  Paise,
  Slice,
  TimelineEvent,
  TimelineKind,
  Transaction,
  TransactionType,
  UserSettings,
} from "@/data/schema";

/** The demo ledger is pinned to this date so every screen reads consistently. */
export const TODAY = "2026-08-07";
export const CURRENT_PERIOD = "2026-08";

const ok = <T>(value: T): Promise<T> => Promise.resolve(value);

/** Live rows when signed in, demo rows otherwise. */
async function resolve<T>(loadLive: () => Promise<T | null>, fallback: T): Promise<T> {
  return (await loadLive()) ?? fallback;
}

export const getAccounts = () => resolve<Account[]>(liveAccounts, accounts);
export const getCategories = () => resolve<Category[]>(liveCategories, categories);
export const getLabels = () => resolve<Label[]>(liveLabels, labels);
export const getSettings = () => ok<UserSettings>(userSettings);
export const getTimelineEvents = () => resolve<TimelineEvent[]>(liveTimeline, timelineEvents);
export const getGoals = () => resolve<Goal[]>(liveGoals, goals);
export const getHoldings = () => resolve<Holding[]>(liveHoldings, holdings);
export const getMonthlyRollups = () => resolve<MonthlyRollup[]>(liveMonthlyRollups, monthlyRollups);
export const getSlices = () => resolve<Slice[]>(liveSlices, slices);
export const getImportSources = () => ok<ImportSource[]>(importSources);
export const getImportJobs = () => ok<ImportJob[]>(importJobs);
export const getImportReviewItems = () => ok<ImportReviewItem[]>(importReviewItems);


export interface TransactionFilter {
  search?: string | undefined;
  account_id?: string | undefined;
  category_id?: string | undefined;
  label_id?: string | undefined;
  type?: TransactionType | undefined;
  period?: string | undefined; // "2026-08"
}

export function filterTransactions(rows: Transaction[], filter: TransactionFilter): Transaction[] {
  const q = filter.search?.trim().toLowerCase();
  return rows.filter((t) => {
    if (filter.account_id && t.account_id !== filter.account_id) return false;
    if (filter.category_id && t.category_id !== filter.category_id) return false;
    if (filter.label_id && t.label_id !== filter.label_id) return false;
    if (filter.type && t.type !== filter.type) return false;
    if (filter.period && !t.occurred_at.startsWith(filter.period)) return false;
    if (q) {
      const hay = `${t.merchant} ${t.descriptor} ${t.payment_method}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export const listTransactions = async (filter: TransactionFilter = {}) => {
  const rows = await resolve<Transaction[]>(liveTransactions, transactions);
  return filterTransactions(rows, filter).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
};

export const getBudgets = (period: string = CURRENT_PERIOD) =>
  resolve<BudgetPeriod[]>(
    () => liveBudgets(period),
    budgetPeriods.filter((b) => b.period === period),
  );


/** Accounts whose balance can be split into slices. */
export const isSliceable = (kind: Account["kind"]) =>
  (SLICEABLE_KINDS as readonly string[]).includes(kind);

/** Allocated vs unallocated money per account, live rows when signed in. */
export async function getAllocations(): Promise<AccountAllocation[]> {
  const live = await liveAllocations();
  if (live) return live;
  const [accs, rows] = await Promise.all([getAccounts(), getSlices()]);
  return accs.filter((a) => isSliceable(a.kind)).map((a) => allocationFor(a, rows));
}

/** Rolls a single account's slices up against its balance. */
export function allocationFor(account: Account, rows: Slice[]): AccountAllocation {
  const mine = rows.filter((s) => s.account_id === account.id);
  const sum = (kind: Slice["kind"]) =>
    mine.filter((s) => s.kind === kind).reduce((t, s) => t + s.amount, 0);
  const allocated = mine.reduce((t, s) => t + s.amount, 0);
  return {
    account_id: account.id,
    balance: account.balance,
    allocated,
    unallocated: account.balance - allocated,
    slice_count: mine.length,
    owned: sum("owned"),
    custodial: sum("custodial"),
    earmarked: sum("earmark"),
  };
}

export interface OwnedNetWorth {
  net_worth: Paise;
  custodial: Paise;
  earmarked: Paise;
  owned: Paise;
}

/** Net worth with money held for other people taken out. */
export function summariseOwnership(
  rows: Account[],
  allocations: AccountAllocation[],
): OwnedNetWorth {
  const net_worth = summariseNetWorth(rows).net_worth;
  const custodial = allocations.reduce((t, a) => t + a.custodial, 0);
  const earmarked = allocations.reduce((t, a) => t + a.earmarked, 0);
  return { net_worth, custodial, earmarked, owned: net_worth - custodial };
}

export interface NetWorthSummary {
  cash: Paise;
  investments: Paise;
  liabilities: Paise;
  net_worth: Paise;
}

export function summariseNetWorth(rows: Account[]): NetWorthSummary {
  const cash = rows
    .filter((a) => a.kind === "bank" || a.kind === "cash")
    .reduce((s, a) => s + a.balance, 0);
  const investments = rows
    .filter((a) => a.kind === "investment")
    .reduce((s, a) => s + a.balance, 0);
  const liabilities = rows
    .filter((a) => a.kind === "credit_card" || a.kind === "loan")
    .reduce((s, a) => s + a.balance, 0);
  return { cash, investments, liabilities, net_worth: cash + investments + liabilities };
}

export interface CashflowSummary {
  count: number;
  income: Paise;
  expense: Paise;
  net: Paise;
}

export function summariseCashflow(rows: Transaction[]): CashflowSummary {
  const income = rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = rows.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  return { count: rows.length, income, expense, net: income - expense };
}

export const timelineKinds: { id: TimelineKind | "all"; label: string }[] = [
  { id: "all", label: "All Events" },
  { id: "money", label: "Money" },
  { id: "ai_insight", label: "AI Insights" },
  { id: "goal", label: "Goals" },
  { id: "bill", label: "Bills" },
  { id: "system", label: "System" },
];

/** Compact ledger digest handed to the assistant instead of raw rows. */
export async function getAssistantContext(): Promise<string> {
  const [accs, txns, budgets, gls, hlds, cats0] = await Promise.all([
    getAccounts(),
    listTransactions({ period: CURRENT_PERIOD }),
    getBudgets(),
    getGoals(),
    getHoldings(),
    getCategories(),
  ]);
  const nw = summariseNetWorth(accs);
  const cf = summariseCashflow(txns);
  const r = (p: Paise) => Math.round(p / 100);
  const nameOf = (id: string) => cats0.find((c) => c.id === id)?.name ?? id;
  const cats = new Map<string, number>();
  for (const t of txns) if (t.amount < 0) cats.set(t.category_id, (cats.get(t.category_id) ?? 0) - t.amount);
  const catLine = [...cats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, v]) => `${nameOf(id)}=${r(v)}`)
    .join(", ");
  return [
    `Currency INR. Today ${TODAY}. Period ${CURRENT_PERIOD}.`,
    `NetWorth=${r(nw.net_worth)} cash=${r(nw.cash)} investments=${r(nw.investments)} liabilities=${r(nw.liabilities)}.`,
    `Month: income=${r(cf.income)} expense=${r(cf.expense)} net=${r(cf.net)} txns=${cf.count}.`,
    `Top spend: ${catLine}.`,
    `Budgets: ${budgets.map((b) => `${nameOf(b.category_id)}=${r(b.spent)}/${r(b.planned)}`).join(", ")}.`,
    `Goals: ${gls.map((g) => `${g.name}=${r(g.saved)}/${r(g.target)} by ${g.target_date}`).join(", ")}.`,

    `Holdings value=${r(hlds.reduce((s, h) => s + h.current_value, 0))}, invested=${r(hlds.reduce((s, h) => s + h.invested, 0))}.`,
  ].join("\n");
}
