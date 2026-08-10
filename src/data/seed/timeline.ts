import type { TimelineEvent } from "@/data/schema";

export const timelineEvents: TimelineEvent[] = [
  { id: "evt_001", occurred_at: "2026-08-07T09:20:00+05:30", kind: "money", title: "Salary received", detail: "HDFC Salary \u00b7 Income", amount: 7500000, account_id: "acc_hdfc_salary", action_label: null },
  { id: "evt_002", occurred_at: "2026-08-07T11:40:00+05:30", kind: "ai_insight", title: "Dining spending is lower", detail: "You spent 18% less on dining this month.", amount: null, account_id: null, action_label: "View Insight" },
  { id: "evt_003", occurred_at: "2026-08-07T14:15:00+05:30", kind: "money", title: "Amazon purchase", detail: "Shopping \u00b7 ICICI Amazon Pay", amount: -245000, account_id: "acc_icici_amazon", action_label: null },
  { id: "evt_004", occurred_at: "2026-08-07T16:30:00+05:30", kind: "goal", title: "Emergency Fund milestone", detail: "You've crossed \u20B94,20,000 towards your goal.", amount: null, account_id: null, action_label: "View Goal" },
  { id: "evt_005", occurred_at: "2026-08-06T20:50:00+05:30", kind: "bill", title: "Electricity bill paid", detail: "Utilities \u00b7 HDFC Salary", amount: -125000, account_id: "acc_hdfc_salary", action_label: null },
  { id: "evt_006", occurred_at: "2026-08-06T18:20:00+05:30", kind: "money", title: "UPI Transfer to Mom", detail: "Transfer \u00b7 HDFC Salary", amount: -500000, account_id: "acc_hdfc_salary", action_label: null },
  { id: "evt_007", occurred_at: "2026-08-06T13:00:00+05:30", kind: "system", title: "Gmail sync completed", detail: "9 statements parsed, 1 duplicate held back.", amount: null, account_id: null, action_label: "Open Imports" },
  { id: "evt_008", occurred_at: "2026-08-05T09:15:00+05:30", kind: "bill", title: "Rent auto-paid", detail: "Housing \u00b7 Standing order", amount: -3000000, account_id: "acc_hdfc_salary", action_label: null },
  { id: "evt_009", occurred_at: "2026-08-05T11:00:00+05:30", kind: "ai_insight", title: "Subscription overlap found", detail: "Prime Video and Netflix both renewed within 3 days.", amount: null, account_id: null, action_label: "Review" },
  { id: "evt_010", occurred_at: "2026-08-04T10:30:00+05:30", kind: "money", title: "Freelance retainer credited", detail: "Studio Kavi \u00b7 ICICI Savings", amount: 3500000, account_id: "acc_icici_savings", action_label: null },
  { id: "evt_011", occurred_at: "2026-08-03T08:00:00+05:30", kind: "system", title: "Ledger backup created", detail: "Encrypted snapshot stored locally.", amount: null, account_id: null, action_label: null },
  { id: "evt_012", occurred_at: "2026-08-02T09:00:00+05:30", kind: "bill", title: "Home loan EMI cleared", detail: "Housing \u00b7 Auto debit", amount: -2850000, account_id: "acc_hdfc_salary", action_label: null },
  { id: "evt_013", occurred_at: "2026-08-01T10:00:00+05:30", kind: "goal", title: "Gold SIP contributed", detail: "\u20B95,000 added to the gold ladder.", amount: -500000, account_id: "acc_icici_savings", action_label: "View Goal" },
  { id: "evt_014", occurred_at: "2026-08-01T07:30:00+05:30", kind: "ai_insight", title: "August forecast ready", detail: "On this pace you'll close the month \u20B941,550 positive.", amount: null, account_id: null, action_label: "View Insight" },
];
