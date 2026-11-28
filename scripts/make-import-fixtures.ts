/**
 * Writes SYNTHETIC statement fixtures to src/lib/import/fixtures/.
 * Layouts copy real bank exports (row offsets, header text, column positions);
 * every name, number and amount is made up. The repo is public: never paste real rows here.
 *
 * Run: npx tsx scripts/make-import-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const OUT = "src/lib/import/fixtures";
mkdirSync(OUT, { recursive: true });

type Row = (string | number)[];
const at = (cells: Record<number, string | number>, width = 25): Row => {
  const r: Row = Array(width).fill("");
  for (const [i, v] of Object.entries(cells)) r[Number(i)] = v;
  return r;
};
const save = (rows: Row[], sheet: string, file: string, bookType: XLSX.BookType) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  writeFileSync(`${OUT}/${file}`, XLSX.write(wb, { bookType, type: "buffer" }));
};

// ── IndusInd credit card "Billed statement" (.xls) ──────────────────────────
// Header on row 18. Amount in col 20, "Cr" in col 23 marks credits; blank = debit.
// The reward column header varies by card ("REWARDS" vs "Feature Reward Points").
function indusind(rewardsHeader: string, txns: [string, string, string, "Cr" | ""][]): Row[] {
  const holder = "TEST USER       [CKYC ID : 00000000000000 ]";
  return [
    at({ 0: "Name", 4: "TEST USER" }),
    at({ 0: "Address", 4: "1/1, Sample Street, Testnagar" }),
    at({ 0: "Address", 4: "CHENNAI-600000 TN", 13: "Credit Card No.: 000000XXXXXX0000" }),
    at({ 0: "Customer ID", 4: "00000000000000", 13: "Auto Account Number: 0000000000000000000" }),
    at({ 0: "Customer GSTIN" }),
    at({ 0: "Payment Due Date", 4: "10 Nov, 2026" }),
    at({ 0: "Statement Date", 4: "20 Oct, 2026" }),
    at({ 0: "Total Amount Due", 4: "6,251.00", 10: "Past Dues (If any)" }),
    at({
      0: "Minimum Amount Due",
      4: "313.00",
      10: "Overdue",
      13: "1 Month",
      15: "2 Months",
      17: "3 Months+",
      19: "Current Dues",
      22: "Min Amount Due",
    }),
    at({
      0: "Credit Limit",
      4: "1,00,000",
      10: "0.00",
      13: "0.00",
      15: "0.00",
      17: "0.00",
      19: "313.00",
      22: "313.00",
    }),
    at({ 0: "Available Limit", 4: "93,749" }),
    at({ 0: "Available Cash Limit", 4: "20,000" }),
    at({}),
    at({ 0: "Account Summary" }),
    at({
      0: "Opening Bal",
      4: "-",
      5: "Payments / Credits",
      9: "+",
      10: "Purchases / Debits",
      14: "+",
      15: "Fees Charges",
      19: "=",
      20: "Total Dues",
    }),
    at({ 0: "3,120.00", 5: "3,120.00", 10: "6,251.00", 15: "0.00", 20: "6,251.00" }),
    at({}),
    at({}),
    at({
      0: "Transaction type",
      4: "Primary / Addon Customer Name",
      9: "Date & Time",
      12: "Description",
      18: rewardsHeader,
      20: "AMT",
      23: "Debit / Credit",
    }),
    ...txns.map(([when, desc, amt, dc]) =>
      at({ 0: "Domestic", 4: holder, 9: when, 12: desc, 20: amt, 23: dc }),
    ),
    at({}),
    at({ 0: "*GST levied on service charges is available in the statement summary." }),
    at({}),
    at({ 0: "Registered Office Address: Sample Bank House, Sample Road" }),
  ];
}

save(
  indusind("REWARDS", [
    ["21/09/2026 / 09:33", "MURUGAN IDLI SHOP CHENNAI ", "687.00", ""],
    ["23/09/2026 / 14:10", "RAZ*SWIGGY Bengaluru ", "1,248.00", ""],
    [
      "25/09/2026 / 11:02",
      "BPPY CC PAYMENT DP000000ABCDEFGHIJ (Ref# ST000000000000000000000)",
      "3,120.00",
      "Cr",
    ],
    ["28/09/2026 / 20:41", "BHARTI AIRTEL LTD GURGAON ", "1,029.00", ""],
    ["02/10/2026 / 18:26", "FLIPKART INTERNET Pvt NOIDA ", "2,499.00", ""],
    ["05/10/2026 / 08:15", "UBER INDIA SYSTEMS PVT LTD BANGALORE ", "312.00", ""],
    ["09/10/2026 / 13:05", "AMAZON PAY INDIA PRIVATE BANGALORE ", "476.00", ""],
  ]),
  "Statement",
  "indusind-cc-rewards.xls",
  "biff8",
);

save(
  indusind("Feature Reward Points", [
    ["20/10/2026 / 00:00", "1% Swiggy CashBack  ", "23.63", "Cr"],
    ["20/10/2026 / 00:00", "10% Swiggy CashBack  ", "64.60", "Cr"],
    ["24/10/2026 / 12:18", "RSP*SWIGGY PVT LTD FO BENGALURU ", "1,127.00", ""],
    ["27/10/2026 / 19:44", "ZOMATO LTD GURGAON ", "640.00", ""],
    ["01/11/2026 / 10:00", "CC Payment Net Banking (Ref# 000000000000000000)", "5,000.00", "Cr"],
    ["03/11/2026 / 21:12", "BOOKMYSHOW MUMBAI ", "850.00", ""],
  ]),
  "Statement",
  "indusind-cc-feature-points.xls",
  "biff8",
);

// ── HDFC savings (.xls), one month that overlaps the Money Manager fixture ──
// Lets "learn from history" match old manual entries to bank lines by date + amount.
const hdfcTxns: [string, string, string, string, string][] = [
  // date, narration, ref, withdrawal, deposit
  [
    "01/06/26",
    "NEFT DR-TEST0000001-SAMPLE PAYEE-NET BANKING SI -RENT",
    "HDFCH00000000001",
    "7000",
    "",
  ],
  [
    "02/06/26",
    "UPI-RAVI KUMAR-ravi.k@okaxis-SBIN0000001-600000000001-LUNCH",
    "0000600000000001",
    "500",
    "",
  ],
  [
    "03/06/26",
    "UPI-SWIGGY-swiggy.stores@axb-UTIB0000001-600000000002-PAY",
    "0000600000000002",
    "412",
    "",
  ],
  [
    "05/06/26",
    "UPI-ANITA S-anita@oksbi-SBIN0000002-600000000003-UPI",
    "0000600000000003",
    "",
    "2000",
  ],
  [
    "07/06/26",
    "UPI-UBER INDIA-uber@hdfcbank-HDFC0000001-600000000004-PAY",
    "0000600000000004",
    "268",
    "",
  ],
  ["10/06/26", "IB BILLPAY DR-HDFCXX-000000XXXXXX0000", "000000000000", "3120", ""],
  [
    "12/06/26",
    "UPI-RAVI KUMAR-ravi.k@okaxis-SBIN0000001-600000000005-UPI",
    "0000600000000005",
    "350",
    "",
  ],
  ["15/06/26", "SALARY JUN 2026 SAMPLE EMPLOYER PVT LTD", "000000000006", "", "85000"],
  [
    "18/06/26",
    "UPI-SAFEGOLD-safegold@ybl-YESB0000001-600000000007-GOLD",
    "0000600000000007",
    "100",
    "",
  ],
  [
    "20/06/26",
    "UPI-AIRTEL-airtel@ybl-YESB0000002-600000000008-RECHARGE",
    "0000600000000008",
    "299",
    "",
  ],
];
let bal = 50000;
save(
  [
    ["HDFC BANK Ltd.                              "],
    [],
    [],
    [],
    at({ 4: "Account Branch :SAMPLE BRANCH" }, 7),
    at({ 0: "MR      TEST USER", 4: "Address :NO.1, SAMPLE ROAD" }, 7),
    at({ 0: "1/1, Sample Street", 4: "SAMPLE AREA," }, 7),
    at({ 0: "Testnagar", 4: "SAMPLE NAGAR" }, 7),
    at({ 0: "CHENNAI", 4: "City :CHENNAI 600000" }, 7),
    at({ 0: "CHENNAI 600000", 4: "State :TAMIL NADU" }, 7),
    at({ 0: "TAMIL NADU INDIA", 4: "Phone no. :00000000/00000000" }, 7),
    at({ 4: "Email :TEST@EXAMPLE.COM" }, 7),
    at({ 0: "JOINT HOLDERS :", 4: "OD Limit :0.00   Currency :INR" }, 7),
    at({ 4: "Cust ID :000000000" }, 7),
    at({ 0: "Nomination  :  Registered", 4: "Account No :00000000000000   OTHER ON PRODUCT" }, 7),
    at(
      {
        0: "Statement From  :  01/06/2026         To  :  30/06/2026",
        4: "A/C Open Date :01/01/2020",
      },
      7,
    ),
    at({ 4: "Account Status :Regular" }, 7),
    at({ 4: "RTGS/NEFT IFSC :HDFC0000000   MICR :000000000" }, 7),
    [],
    ["****************************************"],
    [
      "Date",
      "Narration",
      "Chq./Ref.No.",
      "Value Dt",
      "Withdrawal Amt.",
      "Deposit Amt.",
      "Closing Balance",
    ],
    [
      "********",
      "**********************************",
      "************",
      "********",
      "******************",
      "******************",
      "******************",
    ],
    ...hdfcTxns.map(([d, n, ref, w, dep]) => {
      bal += Number(dep || 0) - Number(w || 0);
      return [d, n, ref, d, w, dep, bal.toFixed(2)];
    }),
    [],
    [
      "Generated On:",
      "01-Jul-2026 10:00",
      "Generated By:",
      "000000000",
      "Requesting Branch Code:",
      "NET",
    ],
    [],
    ["---  End Of Statement ---"],
  ],
  "Sheet 1",
  "hdfc-savings-jun-2026.xls",
  "biff8",
);

// ── Money Manager export (.xlsx) ────────────────────────────────────────────
// Real export quirks kept: two "Account" columns (the 2nd holds the amount),
// accounts/people used as categories for money moves, "Transfer-Out" type.
// Rows marked * match an HDFC fixture line by date + amount.
const mmHeader = [
  "Date",
  "Account",
  "Category",
  "Subcategory",
  "Note",
  "INR",
  "Income/Expense",
  "Tag",
  "Description",
  "Amount",
  "Currency",
  "Account",
];
const mm: [string, string, string, string, string, number, string, string][] = [
  // date, account, category, subcategory, note, amount, type, description
  ["01/06/2026 09:00:00", "HDFC", "Household", "Rent", "RENT", 7000, "Expense", "June rent"], // *
  ["02/06/2026 13:20:11", "HDFC", "Food", "Lunch", "RAVI", 500, "Expense", "Lunch split, office"], // *
  ["03/06/2026 20:05:43", "HDFC", "Food", "Dinner", "SWIGGY", 412, "Expense", ""], // *
  [
    "05/06/2026 18:30:00",
    "HDFC",
    "Receivables",
    "",
    "ANITA",
    2000,
    "Income",
    "Anita paid back trip share",
  ], // *
  ["07/06/2026 08:47:19", "HDFC", "Transportation", "Cab", "UBER", 268, "Expense", ""], // *
  ["10/06/2026 10:00:00", "HDFC", "Credit Card", "", "CC BILL", 3120, "Transfer-Out", "Card bill"], // *
  [
    "12/06/2026 13:02:55",
    "HDFC",
    "Social Life",
    "Treat",
    "RAVI",
    350,
    "Expense",
    "Coffee + snacks with Ravi",
  ], // *
  ["15/06/2026 09:00:00", "HDFC", "Salary", "", "SALARY", 85000, "Income", ""], // *
  [
    "18/06/2026 07:00:00",
    "HDFC",
    "Investment",
    "Gold",
    "SAFEGOLD",
    100,
    "Expense",
    "Daily gold SIP",
  ], // *
  ["20/06/2026 11:11:11", "HDFC", "Communication", "Mobile", "AIRTEL", 299, "Expense", ""], // *
  ["21/06/2026 19:40:00", "Cash", "Food", "Snacks", "TEA SHOP", 40, "Expense", ""],
  ["22/06/2026 12:00:00", "HDFC", "Dad", "", "DAD", 5000, "Transfer-Out", "Sent to Dad"],
  ["24/06/2026 21:15:00", "AXIS CC", "Entertainment", "Movies", "BOOKMYSHOW", 850, "Expense", ""],
  ["25/06/2026 13:30:00", "HDFC CC", "Food", "Lunch", "CAFETERIA", 36, "Expense", ""],
  ["28/06/2026 22:00:00", "HDFC", "Unnecessary", "", "ONLINE", 999, "Expense", "Impulse buy"],
];
save(
  [
    mmHeader,
    ...mm.map(([d, a, c, s, n, amt, t, desc]) => [
      d,
      a,
      c,
      s,
      n,
      String(amt),
      t,
      "",
      desc,
      `${amt}.0`,
      "INR",
      String(amt),
    ]),
  ],
  "Money Manager",
  "money-manager-export.xlsx",
  "xlsx",
);

console.log(`wrote fixtures to ${OUT}`);
