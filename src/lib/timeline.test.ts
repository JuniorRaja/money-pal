import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveTimelineEvents, upcomingBills, type TimelineInputs } from "./timeline.ts";
import type { Account, CreditCardCycle, Transaction } from "../data/schema.ts";

const TODAY = "2026-08-16";
const PERIOD = "2026-08";

/** Midnight IST, the way `fn_record_transaction` stores it. */
const ist = (day: string) => `${day}T18:30:00+00:00`;

function inputs(over: Partial<TimelineInputs> = {}): TimelineInputs {
  return {
    accounts: [],
    budgets: [],
    categories: [],
    contributions: [],
    cycles: [],
    goals: [],
    jobs: [],
    slices: [],
    transactions: [],
    period: PERIOD,
    today: TODAY,
    ...over,
  };
}

function expense(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    transaction_id: "hdr-1",
    occurred_at: `2026-08-05T10:00:00+00:00`,
    merchant: "Blue Tokai",
    descriptor: "",
    amount: -50_000,
    type: "expense",
    account_id: "acct-1",
    counterparty_account_id: null,
    category_id: "cat-dining",
    label_id: null,
    payment_method: "upi",
    source: "manual",
    confidence: 1,
    note: null,
    attachments: 0,
    ...over,
  };
}

const account = (): Account =>
  ({ id: "acct-cc", name: "HDFC Regalia", kind: "credit_card", balance: -100_000 }) as Account;

const cycle = (over: Partial<CreditCardCycle> = {}): CreditCardCycle => ({
  id: "cyc-1",
  account_id: "acct-cc",
  statement_date: "2026-08-02",
  due_date: "2026-08-19",
  credit_limit: 50_000_00,
  statement_balance: 12_000_00,
  payment_due_amount: 12_000_00,
  minimum_due: 600_00,
  amount_paid: 0,
  is_current: true,
  notes: null,
  ...over,
});

describe("budget threshold events", () => {
  const budgets = [
    {
      id: "line-1",
      budget_id: "b1",
      period: PERIOD,
      category_id: "cat-dining",
      planned: 100_00,
      spent: 0,
    },
  ];
  const categories = [
    {
      id: "cat-dining",
      name: "Dining",
      group: "lifestyle" as const,
      icon: "utensils",
      color_token: "chart-1",
    },
  ];

  it("fires 80 and 100 at the transactions that crossed them, in order", () => {
    const events = deriveTimelineEvents(
      inputs({
        budgets,
        categories,
        transactions: [
          expense({ id: "t3", amount: -30_00, occurred_at: "2026-08-09T10:00:00+00:00" }),
          expense({ id: "t1", amount: -50_00, occurred_at: "2026-08-01T10:00:00+00:00" }),
          expense({ id: "t2", amount: -35_00, occurred_at: "2026-08-05T10:00:00+00:00" }),
        ],
      }),
    ).filter((e) => e.id.startsWith("budget:"));

    assert.deepEqual(
      events.map((e) => [e.id, e.occurred_at]),
      [
        ["budget:line-1:80", "2026-08-05T10:00:00+00:00"],
        ["budget:line-1:100", "2026-08-09T10:00:00+00:00"],
      ],
    );
  });

  it("fires both marks off one transaction that clears them together", () => {
    const events = deriveTimelineEvents(
      inputs({ budgets, categories, transactions: [expense({ amount: -200_00 })] }),
    ).filter((e) => e.id.startsWith("budget:"));
    assert.deepEqual(
      events.map((e) => e.id),
      ["budget:line-1:80", "budget:line-1:100"],
    );
  });

  it("ignores income, other categories, other periods and unplanned lines", () => {
    const events = deriveTimelineEvents(
      inputs({
        budgets: [...budgets, { ...budgets[0]!, id: "line-2", planned: 0 }],
        categories,
        transactions: [
          expense({ id: "a", amount: -500_00, type: "income" }),
          expense({ id: "b", amount: -500_00, category_id: "cat-fuel" }),
          expense({ id: "c", amount: -500_00, occurred_at: "2026-07-30T10:00:00+00:00" }),
        ],
      }),
    ).filter((e) => e.id.startsWith("budget:"));
    assert.deepEqual(events, []);
  });
});

describe("goal milestone events", () => {
  it("fires each mark once, dated to the contribution that reached it", () => {
    const events = deriveTimelineEvents(
      inputs({
        goals: [
          {
            id: "g1",
            name: "Kerala trip",
            blurb: "",
            target: 100_00,
            saved: 60_00,
            saved_this_month: 0,
            target_date: "2026-12-01",
            account_id: "acct-1",
            monthly_contribution: 0,
            icon: "target",
          },
        ],
        contributions: [
          {
            id: "c2",
            goal_id: "g1",
            amount: 30_00,
            contributed_on: "2026-08-10",
            transaction_id: null,
            merchant: null,
            descriptor: null,
          },
          {
            id: "c1",
            goal_id: "g1",
            amount: 30_00,
            contributed_on: "2026-08-01",
            transaction_id: null,
            merchant: null,
            descriptor: null,
          },
        ],
      }),
    ).filter((e) => e.id.startsWith("goal:"));

    assert.deepEqual(
      events.map((e) => [e.id, e.occurred_at]),
      [
        ["goal:g1:25", "2026-08-01T12:00:00+05:30"],
        ["goal:g1:50", "2026-08-10T12:00:00+05:30"],
      ],
    );
  });
});

describe("upcoming bills", () => {
  it("keeps unpaid statements inside the window, soonest first", () => {
    const bills = upcomingBills(
      [
        cycle({ id: "later", due_date: "2026-09-10" }),
        cycle({ id: "soon", due_date: "2026-08-18" }),
        cycle({ id: "beyond-window", due_date: "2026-09-20" }),
        cycle({ id: "paid", due_date: "2026-08-17", amount_paid: 12_000_00 }),
        cycle({ id: "past", due_date: "2026-08-10" }),
      ],
      [account()],
      TODAY,
      30,
    );
    assert.deepEqual(
      bills.map((b) => [b.cycle.id, b.due_in_days]),
      [
        ["soon", 2],
        ["later", 25],
      ],
    );
  });

  it("alerts on the timeline only inside five days, dated to the statement", () => {
    const events = deriveTimelineEvents(
      inputs({ accounts: [account()], cycles: [cycle({ due_date: "2026-08-18" })] }),
    ).filter((e) => e.kind === "bill");
    assert.equal(events.length, 1);
    assert.equal(events[0]!.occurred_at, "2026-08-02T12:00:00+05:30");
    assert.match(events[0]!.title, /HDFC Regalia payment due in 2 days/);

    const quiet = deriveTimelineEvents(
      inputs({ accounts: [account()], cycles: [cycle({ due_date: "2026-08-30" })] }),
    ).filter((e) => e.kind === "bill");
    assert.deepEqual(quiet, []);
  });
});

describe("unusually large spend", () => {
  const categories = [
    {
      id: "cat-dining",
      name: "Dining",
      group: "lifestyle" as const,
      icon: "utensils",
      color_token: "chart-1",
    },
  ];
  const usual = Array.from({ length: 6 }, (_, i) =>
    expense({ id: `n${i}`, amount: -500_00, occurred_at: `2026-08-0${i + 1}T10:00:00+00:00` }),
  );

  it("flags a 3x outlier above the floor and nothing else", () => {
    const events = deriveTimelineEvents(
      inputs({
        categories,
        transactions: [...usual, expense({ id: "big", amount: -2_500_00 })],
      }),
    ).filter((e) => e.id.startsWith("large:"));
    assert.deepEqual(
      events.map((e) => e.id),
      ["large:big"],
    );
  });

  it("stays quiet under the ₹1,000 floor even at 10x the median", () => {
    const cheap = Array.from({ length: 6 }, (_, i) =>
      expense({ id: `c${i}`, amount: -20_00, occurred_at: `2026-08-0${i + 1}T10:00:00+00:00` }),
    );
    const events = deriveTimelineEvents(
      inputs({ categories, transactions: [...cheap, expense({ id: "big", amount: -200_00 })] }),
    ).filter((e) => e.id.startsWith("large:"));
    assert.deepEqual(events, []);
  });

  it("stays quiet without enough history for a median to mean anything", () => {
    const events = deriveTimelineEvents(
      inputs({
        categories,
        transactions: [
          expense({ id: "a", amount: -100_00 }),
          expense({ id: "big", amount: -9_000_00 }),
        ],
      }),
    ).filter((e) => e.id.startsWith("large:"));
    assert.deepEqual(events, []);
  });
});

describe("imports and overdrawn slices", () => {
  it("reports finished jobs that actually imported something", () => {
    const events = deriveTimelineEvents(
      inputs({
        jobs: [
          {
            id: "j1",
            source_id: "s",
            title: "HDFC Aug",
            rows_done: 10,
            rows_total: 10,
            finished_at: ist("2026-08-14"),
            imported: 9,
            duplicates: 1,
            dismissed_at: null,
          },
          {
            id: "j2",
            source_id: "s",
            title: "Running",
            rows_done: 1,
            rows_total: 10,
            finished_at: null,
            imported: 0,
            duplicates: 0,
            dismissed_at: null,
          },
        ],
      }),
    ).filter((e) => e.id.startsWith("import:"));
    assert.deepEqual(
      events.map((e) => e.id),
      ["import:j1"],
    );
    assert.match(events[0]!.title, /Imported 9 transactions/);
    assert.match(events[0]!.detail, /1 duplicate skipped/);
  });

  it("flags a negative slice at a timestamp that does not move between reads", () => {
    const slice = {
      id: "sl1",
      account_id: "acct-1",
      name: "Mum's",
      kind: "custodial" as const,
      color_token: "chart-2",
      is_default: false,
      amount: -1_500_00,
      opening_amount: 0,
      target_amount: null,
      target_date: null,
    };
    const events = deriveTimelineEvents(inputs({ slices: [slice] }));
    assert.deepEqual(
      events.map((e) => [e.id, e.occurred_at]),
      [["slice:sl1", "2026-08-16T12:00:00+05:30"]],
    );
    assert.deepEqual(deriveTimelineEvents(inputs({ slices: [{ ...slice, amount: 1 }] })), []);
  });
});
