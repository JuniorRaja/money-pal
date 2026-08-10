/**
 * The single data access boundary for the whole app.
 *
 * Today every function resolves from the in-memory seed arrays. When the
 * PostgreSQL backend lands, each function becomes a `createServerFn` (or a
 * query against the matching table) and no UI code has to change: the
 * signatures and return shapes are already row-shaped and async.
 */
import { accounts } from "@/data/seed/accounts";
import { budgetPeriods, goals, holdings, monthlyRollups } from "@/data/seed/plan";
import { categories, labels } from "@/data/seed/taxonomy";
import { timelineEvents } from "@/data/seed/timeline";
import { transactions } from "@/data/seed/transactions";
import { importJobs, importReviewItems, importSources, userSettings } from "@/data/seed/workshop";
import type {
  Account,
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

export const getAccounts = () => ok<Account[]>(accounts);
export const getCategories = () => ok<Category[]>(categories);
export const getLabels = () => ok<Label[]>(labels);
export const getSettings = () => ok<UserSettings>(userSettings);
export const getTimelineEvents = () => ok<TimelineEvent[]>(timelineEvents);
export const getGoals = () => ok<Goal[]>(goals);
export const getHoldings = () => ok<Holding[]>(holdings);
export const getMonthlyRollups = () => ok<MonthlyRollup[]>(monthlyRollups);
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

export const listTransactions = (filter: TransactionFilter = {}) =>
  ok<Transaction[]>(
    filterTransactions(transactions, filter).sort((a, b) =>
      a.occurred_at < b.occurred_at ? 1 : -1,
    ),
  );

export const getBudgets = (period: string = CURRENT_PERIOD) =>
  ok<BudgetPeriod[]>(budgetPeriods.filter((b) => b.period === period));

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
  const [accs, txns, budgets, gls, hlds] = await Promise.all([
    getAccounts(),
    listTransactions({ period: CURRENT_PERIOD }),
    getBudgets(),
    getGoals(),
    getHoldings(),
  ]);
  const nw = summariseNetWorth(accs);
  const cf = summariseCashflow(txns);
  const r = (p: Paise) => Math.round(p / 100);
  const cats = new Map<string, number>();
  for (const t of txns) if (t.amount < 0) cats.set(t.category_id, (cats.get(t.category_id) ?? 0) - t.amount);
  const catLine = [...cats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, v]) => `${categories.find((c) => c.id === id)?.name ?? id}=${r(v)}`)
    .join(", ");
  return [
    `Currency INR. Today ${TODAY}. Period ${CURRENT_PERIOD}.`,
    `NetWorth=${r(nw.net_worth)} cash=${r(nw.cash)} investments=${r(nw.investments)} liabilities=${r(nw.liabilities)}.`,
    `Month: income=${r(cf.income)} expense=${r(cf.expense)} net=${r(cf.net)} txns=${cf.count}.`,
    `Top spend: ${catLine}.`,
    `Budgets: ${budgets
      .map((b) => `${categories.find((c) => c.id === b.category_id)?.name}=${r(b.spent)}/${r(b.planned)}`)
      .join(", ")}.`,
    `Goals: ${gls.map((g) => `${g.name}=${r(g.saved)}/${r(g.target)} by ${g.target_date}`).join(", ")}.`,
    `Holdings value=${r(hlds.reduce((s, h) => s + h.current_value, 0))}, invested=${r(hlds.reduce((s, h) => s + h.invested, 0))}.`,
  ].join("\n");
}
