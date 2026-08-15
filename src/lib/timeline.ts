/**
 * Timeline events computed from the ledger at read time.
 *
 * Nothing here is written to `timeline_events`. An event about a transaction has
 * to change when that transaction changes — the same reason balances, budget
 * spend and goal progress are derived rather than stored. Ids are deterministic,
 * so a dismissal table can key off them later without a backfill.
 */
import type {
  Account,
  BudgetPeriod,
  Category,
  CreditCardCycle,
  Goal,
  GoalContribution,
  ImportJob,
  Paise,
  Slice,
  TimelineEvent,
  Transaction,
} from "@/data/schema";
// Relative, not "@/lib/money": `tsx --test` runs this file without the alias.
import { formatMoney } from "./money";

/** Budget usage marks worth an event. */
const BUDGET_MARKS = [80, 100] as const;
/** Goal progress marks worth an event. */
const GOAL_MARKS = [25, 50, 75, 100] as const;
/** A card statement joins the feed this many days before its due date. */
export const BILL_DUE_WITHIN_DAYS = 5;
/** Multiple of the category median that makes one transaction "unusual". */
const LARGE_FACTOR = 3;
/** Under ₹1,000 a 3x outlier is just noise. */
const LARGE_FLOOR: Paise = 100_000;
/** A median over fewer rows than this says nothing. */
const LARGE_MIN_HISTORY = 5;

const DAY_MS = 86_400_000;

/** Midday IST, so a date-only value lands on the right day whatever renders it. */
export const noonIst = (day: string) => `${day}T12:00:00+05:30`;

const daysUntil = (day: string, today: string) =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

export const dueLabel = (days: number) =>
  days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;

const whole = (value: Paise) => formatMoney(value, { whole: true });

const oldestFirst = (a: string, b: string) => (a < b ? -1 : 1);

export interface UpcomingBill {
  cycle: CreditCardCycle;
  account: Account | undefined;
  due_in_days: number;
  outstanding: Paise;
}

/** Unpaid card statements due within `withinDays`, soonest first. */
export function upcomingBills(
  cycles: CreditCardCycle[],
  accounts: Account[],
  today: string,
  withinDays: number,
): UpcomingBill[] {
  return cycles
    .map((cycle) => ({
      cycle,
      account: accounts.find((a) => a.id === cycle.account_id),
      due_in_days: daysUntil(cycle.due_date, today),
      outstanding: cycle.payment_due_amount - cycle.amount_paid,
    }))
    .filter(
      (bill) => bill.outstanding > 0 && bill.due_in_days >= 0 && bill.due_in_days <= withinDays,
    )
    .sort((a, b) => a.due_in_days - b.due_in_days);
}

export interface TimelineInputs {
  accounts: Account[];
  budgets: BudgetPeriod[];
  categories: Category[];
  contributions: GoalContribution[];
  cycles: CreditCardCycle[];
  goals: Goal[];
  jobs: ImportJob[];
  slices: Slice[];
  transactions: Transaction[];
  /** Budget period the budget rows belong to, "YYYY-MM". */
  period: string;
  /** Today as an IST calendar day, "YYYY-MM-DD". */
  today: string;
}

export function deriveTimelineEvents(input: TimelineInputs): TimelineEvent[] {
  return [
    ...budgetEvents(input),
    ...goalEvents(input),
    ...billEvents(input),
    ...largeTransactionEvents(input),
    ...importEvents(input),
    ...overdrawnSliceEvents(input),
  ];
}

/** Dated to the transaction that tipped the budget over, not to "now". */
function budgetEvents({
  budgets,
  transactions,
  categories,
  period,
}: TimelineInputs): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const budget of budgets) {
    if (budget.planned <= 0) continue;
    const name = categories.find((c) => c.id === budget.category_id)?.name ?? "Budget";
    // Same rule as v_category_spend: expense rows only, this category, this period.
    const spend = transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.category_id === budget.category_id &&
          t.occurred_at.startsWith(period),
      )
      .sort((a, b) => oldestFirst(a.occurred_at, b.occurred_at));

    let running = 0;
    let mark = 0;
    for (const txn of spend) {
      running -= txn.amount;
      while (mark < BUDGET_MARKS.length && running * 100 >= BUDGET_MARKS[mark]! * budget.planned) {
        const pct = BUDGET_MARKS[mark]!;
        out.push({
          id: `budget:${budget.id}:${pct}`,
          occurred_at: txn.occurred_at,
          kind: "money",
          title: pct >= 100 ? `${name} budget spent` : `${name} budget at ${pct}%`,
          detail: `${whole(running)} of ${whole(budget.planned)} planned — ${txn.merchant} tipped it over.`,
          amount: txn.amount,
          account_id: txn.account_id,
          action_label: "Open budgets",
        });
        mark += 1;
      }
    }
  }
  return out;
}

/** Dated to the contribution that reached the milestone. */
function goalEvents({ goals, contributions }: TimelineInputs): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const goal of goals) {
    if (goal.target <= 0) continue;
    const paid = contributions
      .filter((c) => c.goal_id === goal.id)
      .sort((a, b) => oldestFirst(a.contributed_on, b.contributed_on));

    let running = 0;
    let mark = 0;
    for (const contribution of paid) {
      running += contribution.amount;
      while (mark < GOAL_MARKS.length && running * 100 >= GOAL_MARKS[mark]! * goal.target) {
        const pct = GOAL_MARKS[mark]!;
        out.push({
          id: `goal:${goal.id}:${pct}`,
          occurred_at: noonIst(contribution.contributed_on),
          kind: "goal",
          title: pct >= 100 ? `${goal.name} fully funded` : `${goal.name} is ${pct}% funded`,
          detail: `${whole(running)} of ${whole(goal.target)} saved.`,
          amount: contribution.amount,
          account_id: goal.account_id || null,
          action_label: "Open goals",
        });
        mark += 1;
      }
    }
  }
  return out;
}

function billEvents({ cycles, accounts, today }: TimelineInputs): TimelineEvent[] {
  return upcomingBills(cycles, accounts, today, BILL_DUE_WITHIN_DAYS).map(
    (bill): TimelineEvent => ({
      id: `cycle:${bill.cycle.id}`,
      // Dated to the statement, not the due date: the feed reads backwards, so a
      // future-dated row would pin itself above everything until it was paid.
      occurred_at: noonIst(bill.cycle.statement_date),
      kind: "bill",
      title: `${bill.account?.name ?? "Card"} payment due ${dueLabel(bill.due_in_days)}`,
      detail: `${whole(bill.outstanding)} outstanding, minimum ${whole(bill.cycle.minimum_due)}.`,
      amount: -bill.outstanding,
      account_id: bill.cycle.account_id,
      action_label: "Open accounts",
    }),
  );
}

function largeTransactionEvents({ transactions, categories }: TimelineInputs): TimelineEvent[] {
  const byCategory = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    if (txn.type !== "expense") continue;
    const rows = byCategory.get(txn.category_id) ?? [];
    rows.push(txn);
    byCategory.set(txn.category_id, rows);
  }

  const out: TimelineEvent[] = [];
  for (const [categoryId, rows] of byCategory) {
    if (rows.length < LARGE_MIN_HISTORY) continue;
    // ponytail: median over the whole read window rather than a strictly trailing
    // one — a lone outlier barely moves a median, which is why it is the median.
    // Switch to per-row trailing windows if seasonal categories misfire.
    const usual = median(rows.map((t) => -t.amount));
    const bar = Math.max(usual * LARGE_FACTOR, LARGE_FLOOR);
    const name = categories.find((c) => c.id === categoryId)?.name ?? "this category";
    for (const txn of rows) {
      if (-txn.amount < bar) continue;
      out.push({
        id: `large:${txn.id}`,
        occurred_at: txn.occurred_at,
        kind: "money",
        title: `Unusually large ${name} spend`,
        detail:
          usual > 0
            ? `${txn.merchant} — about ${Math.round(-txn.amount / usual)}x your usual ${whole(usual)} here.`
            : `${txn.merchant} — well above anything else in ${name}.`,
        amount: txn.amount,
        account_id: txn.account_id,
        action_label: "Open transactions",
      });
    }
  }
  return out;
}

function importEvents({ jobs }: TimelineInputs): TimelineEvent[] {
  return jobs
    .filter((job) => job.finished_at && job.imported > 0)
    .map((job): TimelineEvent => {
      const skipped = job.duplicates
        ? `${job.duplicates} duplicate${job.duplicates === 1 ? "" : "s"} skipped`
        : null;
      return {
        id: `import:${job.id}`,
        occurred_at: job.finished_at!,
        kind: "system",
        title: `Imported ${job.imported} transaction${job.imported === 1 ? "" : "s"}`,
        detail: [job.title || "Statement", skipped].filter(Boolean).join(" · "),
        amount: null,
        account_id: null,
        action_label: "Open imports",
      };
    });
}

/** PRD allows a slice to go negative; it just should not go unnoticed. */
function overdrawnSliceEvents({ slices, accounts, today }: TimelineInputs): TimelineEvent[] {
  return slices
    .filter((slice) => slice.amount < 0)
    .map((slice): TimelineEvent => {
      const account = accounts.find((a) => a.id === slice.account_id)?.name ?? "this account";
      return {
        id: `slice:${slice.id}`,
        // A standing condition, not a past moment. Dated to today rather than the
        // clock so it stays near the top while it is true, without a timestamp
        // that creeps forward on every read and re-rings the bell each time.
        occurred_at: noonIst(today),
        kind: "money",
        title: `${slice.name} is overdrawn`,
        detail: `${whole(slice.amount)} on ${account}. Allowed, but worth a look.`,
        amount: slice.amount,
        account_id: slice.account_id,
        action_label: "Open accounts",
      };
    });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
