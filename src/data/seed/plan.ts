import type { BudgetPeriod, Goal, Holding, MonthlyRollup } from "@/data/schema";

export const budgetPeriods: BudgetPeriod[] = [
  { id: "bgt_08_housing", period: "2026-08", category_id: "cat_housing", planned: 3000000, spent: 2500000 },
  { id: "bgt_08_food", period: "2026-08", category_id: "cat_food", planned: 2000000, spent: 1235000 },
  { id: "bgt_08_transport", period: "2026-08", category_id: "cat_transport", planned: 1000000, spent: 450000 },
  { id: "bgt_08_shopping", period: "2026-08", category_id: "cat_shopping", planned: 1500000, spent: 680000 },
  { id: "bgt_08_subs", period: "2026-08", category_id: "cat_subscriptions", planned: 500000, spent: 215000 },
  { id: "bgt_08_utilities", period: "2026-08", category_id: "cat_utilities", planned: 600000, spent: 380000 },
  { id: "bgt_08_health", period: "2026-08", category_id: "cat_health", planned: 900000, spent: 825000 },
  { id: "bgt_07_housing", period: "2026-07", category_id: "cat_housing", planned: 3000000, spent: 2940000 },
  { id: "bgt_07_food", period: "2026-07", category_id: "cat_food", planned: 2000000, spent: 1980000 },
  { id: "bgt_07_transport", period: "2026-07", category_id: "cat_transport", planned: 1000000, spent: 910000 },
  { id: "bgt_07_shopping", period: "2026-07", category_id: "cat_shopping", planned: 1500000, spent: 1620000 },
  { id: "bgt_07_subs", period: "2026-07", category_id: "cat_subscriptions", planned: 500000, spent: 480000 },
  { id: "bgt_07_utilities", period: "2026-07", category_id: "cat_utilities", planned: 600000, spent: 560000 },
  { id: "bgt_07_health", period: "2026-07", category_id: "cat_health", planned: 900000, spent: 640000 },
];

export const goals: Goal[] = [
  {
    id: "goal_emergency",
    name: "Emergency Fund",
    blurb: "Six months of essentials, kept liquid.",
    target: 60000000,
    saved: 42500000,
    target_date: "2027-03-31",
    account_id: "acc_icici_savings",
    monthly_contribution: 2500000,
    icon: "shield",
  },
  {
    id: "goal_japan",
    name: "Japan in Spring",
    blurb: "Two weeks, cherry blossom season.",
    target: 35000000,
    saved: 14200000,
    target_date: "2027-02-15",
    account_id: "acc_sbi",
    monthly_contribution: 1500000,
    icon: "plane",
  },
  {
    id: "goal_home",
    name: "Home Down Payment",
    blurb: "Twenty percent, no compromises.",
    target: 250000000,
    saved: 78000000,
    target_date: "2029-06-30",
    account_id: "acc_mf",
    monthly_contribution: 4000000,
    icon: "home",
  },
  {
    id: "goal_studio",
    name: "Studio Upgrade",
    blurb: "Camera body and a proper desk.",
    target: 18000000,
    saved: 15600000,
    target_date: "2026-11-30",
    account_id: "acc_hdfc_salary",
    monthly_contribution: 800000,
    icon: "camera",
  },
];

export const holdings: Holding[] = [
  { id: "hld_ppfas", name: "Parag Parikh Flexi Cap", asset_class: "mutual_fund", units: 1420.32, invested: 3200000, current_value: 4120000, day_change_pct: 0.62, account_id: "acc_mf" },
  { id: "hld_nifty", name: "UTI Nifty 50 Index", asset_class: "mutual_fund", units: 890.11, invested: 2400000, current_value: 2960000, day_change_pct: 0.41, account_id: "acc_mf" },
  { id: "hld_smallcap", name: "Axis Small Cap", asset_class: "mutual_fund", units: 310.5, invested: 1200000, current_value: 1460000, day_change_pct: -0.28, account_id: "acc_mf" },
  { id: "hld_infy", name: "Infosys", asset_class: "equity", units: 62, invested: 880000, current_value: 1040000, day_change_pct: 1.12, account_id: "acc_stocks" },
  { id: "hld_itc", name: "ITC", asset_class: "equity", units: 210, invested: 780000, current_value: 920000, day_change_pct: 0.34, account_id: "acc_stocks" },
  { id: "hld_hdfcbank", name: "HDFC Bank", asset_class: "equity", units: 48, invested: 720000, current_value: 690000, day_change_pct: -0.86, account_id: "acc_stocks" },
  { id: "hld_tata", name: "Tata Motors", asset_class: "equity", units: 95, invested: 540000, current_value: 610000, day_change_pct: 2.04, account_id: "acc_stocks" },
  { id: "hld_sgb", name: "Sovereign Gold Bond 2032", asset_class: "gold", units: 22, invested: 1380000, current_value: 1719000, day_change_pct: 0.51, account_id: "acc_gold" },
  { id: "hld_fd", name: "HDFC Fixed Deposit", asset_class: "fixed_income", units: 1, invested: 1500000, current_value: 1612000, day_change_pct: 0.02, account_id: "acc_icici_savings" },
];

export const monthlyRollups: MonthlyRollup[] = [
  { period: "2026-03", income: 10800000, expense: 7420000, planned: 6200000 },
  { period: "2026-04", income: 11200000, expense: 8010000, planned: 6400000 },
  { period: "2026-05", income: 10900000, expense: 6980000, planned: 6300000 },
  { period: "2026-06", income: 11500000, expense: 7640000, planned: 6500000 },
  { period: "2026-07", income: 11800000, expense: 9130000, planned: 6500000 },
  { period: "2026-08", income: 12000000, expense: 7845000, planned: 6500000 },
];
