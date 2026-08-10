/**
 * Demo slices — named parts of an account balance.
 *
 * Every eligible account (bank, cash, investment) keeps at least one slice,
 * flagged `is_default`. The default slice is the one that cannot be removed
 * and that reclaims money when another slice is archived. Amounts here stand
 * in for the derived figures the `v_account_slices` view returns when a real
 * session is present.
 */
import type { Slice } from "@/data/schema";

export const slices: Slice[] = [
  // HDFC Salary — 48,520
  {
    id: "lbl_personal",
    account_id: "acc_hdfc_salary",
    name: "Personal",
    kind: "owned",
    color_token: "chart-2",
    is_default: true,
    amount: 3200000,
    target_amount: null,
    target_date: null,
  },
  {
    id: "lbl_work",
    account_id: "acc_hdfc_salary",
    name: "Work Reimbursements",
    kind: "earmark",
    color_token: "chart-1",
    is_default: false,
    amount: 900000,
    target_amount: 1500000,
    target_date: "2026-12-31",
  },

  // ICICI Savings — 70,000
  {
    id: "lbl_home",
    account_id: "acc_icici_savings",
    name: "Home",
    kind: "owned",
    color_token: "chart-4",
    is_default: true,
    amount: 4200000,
    target_amount: null,
    target_date: null,
  },
  {
    id: "lbl_mom",
    account_id: "acc_icici_savings",
    name: "Mom",
    kind: "custodial",
    color_token: "chart-3",
    is_default: false,
    amount: 2000000,
    target_amount: null,
    target_date: null,
  },

  // SBI — 25,430
  {
    id: "slc_sbi_mine",
    account_id: "acc_sbi",
    name: "Mine",
    kind: "owned",
    color_token: "chart-2",
    is_default: true,
    amount: 1500000,
    target_amount: null,
    target_date: null,
  },
  {
    id: "slc_sbi_emergency",
    account_id: "acc_sbi",
    name: "Emergency Reserve",
    kind: "earmark",
    color_token: "chart-5",
    is_default: false,
    amount: 900000,
    target_amount: 3000000,
    target_date: null,
  },

  // Cash — 8,500
  {
    id: "slc_cash_mine",
    account_id: "acc_cash",
    name: "Mine",
    kind: "owned",
    color_token: "chart-2",
    is_default: true,
    amount: 700000,
    target_amount: null,
    target_date: null,
  },

  // Investment accounts keep a single default slice
  {
    id: "slc_mf_mine",
    account_id: "acc_mf",
    name: "Mine",
    kind: "owned",
    color_token: "chart-2",
    is_default: true,
    amount: 8540000,
    target_amount: null,
    target_date: null,
  },
  {
    id: "slc_stocks_mine",
    account_id: "acc_stocks",
    name: "Mine",
    kind: "owned",
    color_token: "chart-2",
    is_default: true,
    amount: 3260000,
    target_amount: null,
    target_date: null,
  },
  {
    id: "slc_gold_mine",
    account_id: "acc_gold",
    name: "Mine",
    kind: "owned",
    color_token: "chart-2",
    is_default: true,
    amount: 1719000,
    target_amount: null,
    target_date: null,
  },
];

/** Account kinds that can be split into slices. */
export const SLICEABLE_KINDS = ["bank", "cash", "investment"] as const;
