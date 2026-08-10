import type { Transaction } from "@/data/schema";

type Row = [
  string, // id suffix
  string, // occurred_at
  string, // merchant
  string, // descriptor
  number, // amount in paise (signed)
  Transaction["type"],
  string, // account_id
  string, // category_id
  string | null, // label_id
  string, // payment_method
  string, // source
  number, // confidence
];

const rows: Row[] = [
  ["001", "2026-08-07T09:20:00+05:30", "Salary", "HDFC Salary", 7500000, "income", "acc_hdfc_salary", "cat_income", "lbl_work", "NEFT", "Bank feed", 1],
  ["002", "2026-08-07T11:40:00+05:30", "Amazon", "Order #408-7632872", -245000, "expense", "acc_icici_amazon", "cat_shopping", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.98],
  ["003", "2026-08-07T14:15:00+05:30", "Electricity Bill", "BESCOM", -125000, "expense", "acc_hdfc_salary", "cat_utilities", "lbl_home", "UPI", "Gmail", 0.99],
  ["004", "2026-08-07T16:30:00+05:30", "Spotify", "Monthly Subscription", -17900, "expense", "acc_icici_amazon", "cat_subscriptions", "lbl_personal", "Credit Card", "Recurring rule", 1],
  ["005", "2026-08-07T18:45:00+05:30", "UPI Transfer to Mom", "UPI: 9654****32", -500000, "transfer", "acc_hdfc_salary", "cat_transfer", "lbl_mom", "UPI", "SMS \u00b7 Auto import", 0.94],
  ["006", "2026-08-07T20:10:00+05:30", "Blue Tokai", "Indiranagar", -48000, "expense", "acc_hdfc_regalia", "cat_food", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.92],
  ["007", "2026-08-06T08:50:00+05:30", "Swiggy Instamart", "Groceries", -142500, "expense", "acc_icici_amazon", "cat_food", "lbl_home", "Credit Card", "Gmail", 0.97],
  ["008", "2026-08-06T10:05:00+05:30", "Uber", "Airport drop", -68000, "expense", "acc_hdfc_regalia", "cat_transport", "lbl_work", "Credit Card", "Gmail", 0.96],
  ["009", "2026-08-06T13:00:00+05:30", "Zerodha Coin", "SIP \u00b7 Parag Parikh Flexi", -1500000, "expense", "acc_icici_savings", "cat_investment", "lbl_personal", "Auto debit", "Bank feed", 1],
  ["010", "2026-08-06T19:20:00+05:30", "BookMyShow", "Weekend film", -78000, "expense", "acc_hdfc_regalia", "cat_entertainment", "lbl_personal", "Credit Card", "Gmail", 0.95],
  ["011", "2026-08-05T09:15:00+05:30", "House Rent", "Landlord \u00b7 August", -3000000, "expense", "acc_hdfc_salary", "cat_housing", "lbl_home", "NEFT", "Standing order", 1],
  ["012", "2026-08-05T12:40:00+05:30", "Apollo Pharmacy", "Refill", -96500, "expense", "acc_sbi", "cat_health", "lbl_home", "Debit Card", "SMS \u00b7 Auto import", 0.9],
  ["013", "2026-08-05T15:55:00+05:30", "Indian Oil", "Fuel", -320000, "expense", "acc_hdfc_regalia", "cat_transport", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.93],
  ["014", "2026-08-05T21:00:00+05:30", "Netflix", "Premium plan", -64900, "expense", "acc_icici_amazon", "cat_subscriptions", "lbl_home", "Credit Card", "Recurring rule", 1],
  ["015", "2026-08-04T10:30:00+05:30", "Freelance Retainer", "Studio Kavi", 3500000, "income", "acc_icici_savings", "cat_income", "lbl_work", "IMPS", "Bank feed", 1],
  ["016", "2026-08-04T12:10:00+05:30", "Big Basket", "Weekly groceries", -218000, "expense", "acc_icici_amazon", "cat_food", "lbl_home", "Credit Card", "Gmail", 0.98],
  ["017", "2026-08-04T17:25:00+05:30", "Namma Metro", "Smart card top-up", -50000, "expense", "acc_cash", "cat_transport", "lbl_personal", "Cash", "Manual entry", 1],
  ["018", "2026-08-04T19:30:00+05:30", "Decathlon", "Running shoes", -549000, "expense", "acc_axis_neo", "cat_shopping", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.91],
  ["019", "2026-08-03T09:00:00+05:30", "Society Maintenance", "Aug dues", -450000, "expense", "acc_hdfc_salary", "cat_housing", "lbl_home", "UPI", "Standing order", 1],
  ["020", "2026-08-03T11:45:00+05:30", "Third Wave Coffee", "Koramangala", -42000, "expense", "acc_hdfc_regalia", "cat_food", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.89],
  ["021", "2026-08-03T14:20:00+05:30", "Airtel Fiber", "Broadband", -119900, "expense", "acc_hdfc_salary", "cat_utilities", "lbl_home", "UPI", "Recurring rule", 1],
  ["022", "2026-08-03T18:00:00+05:30", "Cult.fit", "Monthly pass", -230000, "expense", "acc_icici_amazon", "cat_health", "lbl_personal", "Credit Card", "Gmail", 0.97],
  ["023", "2026-08-02T09:00:00+05:30", "Home Loan EMI", "HDFC Ltd", -2850000, "expense", "acc_hdfc_salary", "cat_housing", "lbl_home", "Auto debit", "Bank feed", 1],
  ["024", "2026-08-02T13:30:00+05:30", "Zomato", "Lunch", -86000, "expense", "acc_icici_amazon", "cat_food", "lbl_personal", "Credit Card", "Gmail", 0.99],
  ["025", "2026-08-02T16:10:00+05:30", "Croma", "Desk lamp", -389000, "expense", "acc_axis_neo", "cat_shopping", "lbl_home", "Credit Card", "SMS \u00b7 Auto import", 0.88],
  ["026", "2026-08-02T20:45:00+05:30", "Prime Video", "Annual", -149900, "expense", "acc_icici_amazon", "cat_subscriptions", "lbl_personal", "Credit Card", "Recurring rule", 1],
  ["027", "2026-08-01T08:15:00+05:30", "Milk Basket", "Monthly dairy", -186000, "expense", "acc_hdfc_salary", "cat_food", "lbl_home", "UPI", "Recurring rule", 1],
  ["028", "2026-08-01T10:00:00+05:30", "Gold SIP", "Digital gold", -500000, "expense", "acc_icici_savings", "cat_investment", "lbl_personal", "Auto debit", "Bank feed", 1],
  ["029", "2026-08-01T12:00:00+05:30", "Water Tanker", "Society", -70000, "expense", "acc_cash", "cat_utilities", "lbl_home", "Cash", "Manual entry", 1],
  ["030", "2026-08-01T15:35:00+05:30", "Ola", "City ride", -34000, "expense", "acc_hdfc_regalia", "cat_transport", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.94],
  ["031", "2026-08-01T18:30:00+05:30", "Dividend \u00b7 ITC", "Equity payout", 128000, "income", "acc_stocks", "cat_income", "lbl_personal", "Credit", "Bank feed", 1],
  ["032", "2026-08-01T21:15:00+05:30", "Chai Point", "Evening", -18000, "expense", "acc_cash", "cat_food", "lbl_personal", "Cash", "Manual entry", 1],
  ["033", "2026-07-31T09:40:00+05:30", "Interest Credit", "Savings interest", 92000, "income", "acc_icici_savings", "cat_income", "lbl_personal", "Credit", "Bank feed", 1],
  ["034", "2026-07-31T11:20:00+05:30", "Myntra", "Kurta set", -269000, "expense", "acc_icici_amazon", "cat_shopping", "lbl_personal", "Credit Card", "Gmail", 0.96],
  ["035", "2026-07-31T14:00:00+05:30", "LIC Premium", "Term plan", -1240000, "expense", "acc_hdfc_salary", "cat_health", "lbl_home", "Auto debit", "Bank feed", 1],
  ["036", "2026-07-30T10:10:00+05:30", "Petrol \u00b7 Shell", "Fuel", -280000, "expense", "acc_hdfc_regalia", "cat_transport", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.92],
  ["037", "2026-07-30T13:45:00+05:30", "Dominos", "Team lunch", -132000, "expense", "acc_axis_neo", "cat_food", "lbl_work", "Credit Card", "Gmail", 0.95],
  ["038", "2026-07-30T19:00:00+05:30", "Kindle Store", "Two books", -78000, "expense", "acc_icici_amazon", "cat_entertainment", "lbl_personal", "Credit Card", "Gmail", 0.97],
  ["039", "2026-07-29T09:30:00+05:30", "Rent from PG", "Tenant", 1200000, "income", "acc_sbi", "cat_income", "lbl_home", "IMPS", "Bank feed", 1],
  ["040", "2026-07-29T16:20:00+05:30", "Urban Company", "Deep clean", -249000, "expense", "acc_hdfc_regalia", "cat_housing", "lbl_home", "Credit Card", "Gmail", 0.93],
  ["041", "2026-07-29T20:05:00+05:30", "Paradise Biryani", "Dinner", -94000, "expense", "acc_hdfc_regalia", "cat_food", "lbl_personal", "Credit Card", "SMS \u00b7 Auto import", 0.9],
  ["042", "2026-07-28T10:00:00+05:30", "SGB Purchase", "Sovereign Gold Bond", -600000, "expense", "acc_icici_savings", "cat_investment", "lbl_personal", "Netbanking", "Bank feed", 1],
];

export const transactions: Transaction[] = rows.map(
  ([n, at, merchant, descriptor, amount, type, account, category, label, method, source, conf]) => ({
    id: `txn_${n}`,
    occurred_at: at,
    merchant,
    descriptor,
    amount,
    type,
    account_id: account,
    category_id: category,
    label_id: label,
    payment_method: method,
    source,
    confidence: conf,
    note: null,
    attachments: source === "Gmail" ? 1 : 0,
  }),
);
