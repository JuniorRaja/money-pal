import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { attachHashesToRows } from "./hash.ts";
import { applyHeuristics, extractMerchant } from "./heuristics.ts";
import { detectBankPreset } from "./presets.ts";
import { parseImportBuffer, parseImportText } from "./parse.ts";
import { parseAmountToPaise, parseStatementDate } from "./normalize.ts";

const ACCOUNT = "acct-001";

const HDFC_SAVINGS_CSV = `HDFC BANK
Account Statement for A/c XXXX1234

Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
01/08/2026,UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT,01/08/2026,450.00,0.00,,50000.00
01/08/2026,UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT,01/08/2026,450.00,0.00,,49550.00
02/08/2026,NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG,02/08/2026,0.00,"1,20,000.00",,169550.00
03/08/2026,UPI-AMAZON-amazonpay@apl-0000-333-SHOP,03/08/2026,1299.00,,,168251.00
`;

const HDFC_CC_CSV = `Credit Card Statement

Transaction Date,Posted Date,Transaction Description,Credit / Debit,Amount
05/08/2026,06/08/2026,SWIGGY BANGALORE,DEBIT,620.50
07/08/2026,07/08/2026,PAYMENT RECEIVED THANK YOU,CREDIT,10000.00
`;

const DBS_CSV = `Account Number: XXXX
Transaction Date,Value Date,Transaction Description,Debit,Credit,Account Balance
08 Aug 2026,08 Aug 2026,UPI/ZOMATO/123,350.00,,12000.00
09 Aug 2026,09 Aug 2026,Interest Credit,,12.50,12012.50
10/08/2026,10/08/2026,POS 4321 STARBUCKS COFFEE,280.00,,11732.50
`;

describe("amount and date parsing", () => {
  it("parses Indian grouped rupees to paise", () => {
    assert.equal(parseAmountToPaise("1,20,000.00"), 12000000);
    assert.equal(parseAmountToPaise("450.00"), 45000);
    assert.equal(parseAmountToPaise("(12.50)"), -1250);
    assert.equal(parseAmountToPaise(""), 0);
  });

  it("parses DMY and named month dates", () => {
    assert.equal(parseStatementDate("01/08/2026", "DMY"), "2026-08-01");
    assert.equal(parseStatementDate("08 Aug 2026", "auto"), "2026-08-08");
    assert.equal(parseStatementDate("2026-08-09", "auto"), "2026-08-09");
  });
});

describe("HDFC / DBS fixture rows → mapped fields", () => {
  it("skips HDFC NetBanking junk until the header and maps debit/credit", async () => {
    const result = await parseImportText(HDFC_SAVINGS_CSV, {
      filename: "hdfc-savings.csv",
    });
    assert.equal(result.detectedPreset, "hdfc_savings");
    assert.equal(result.mappingErrors.length, 0);
    assert.equal(result.rows.length, 4);

    const [swiggy0, swiggy1, salary, amazon] = await attachHashesToRows(ACCOUNT, result.rows);
    assert.equal(swiggy0?.occurred_on, "2026-08-01");
    assert.equal(swiggy0?.amount_paise, -45000);
    assert.equal(swiggy0?.type, "expense");
    assert.equal(swiggy0?.suggested_category_name, "Dining");
    assert.equal(swiggy0?.occurrence_index, 0);
    assert.ok((swiggy0?.confidence ?? 0) >= 0.75);

    assert.equal(swiggy1?.occurred_on, "2026-08-01");
    assert.equal(swiggy1?.amount_paise, -45000);
    assert.equal(swiggy1?.occurrence_index, 1);
    assert.notEqual(swiggy0?.import_hash, swiggy1?.import_hash);

    assert.equal(salary?.type, "income");
    assert.equal(salary?.amount_paise, 12000000);
    assert.equal(salary?.suggested_category_name, "Salary");
    assert.match(salary?.merchant ?? "", /Acme/i);

    assert.equal(amazon?.amount_paise, -129900);
    assert.equal(amazon?.suggested_category_name, "Shopping");
  });

  it("maps HDFC credit card Debit/Credit + amount", async () => {
    const result = await parseImportText(HDFC_CC_CSV, {
      filename: "hdfc-cc.csv",
      preset: "hdfc_cc",
    });
    assert.equal(result.detectedPreset, "hdfc_cc");
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0]?.type, "expense");
    assert.equal(result.rows[0]?.amount_paise, -62050);
    assert.equal(result.rows[0]?.suggested_category_name, "Dining");
    assert.equal(result.rows[1]?.type, "income");
    assert.equal(result.rows[1]?.amount_paise, 1000000);
  });

  it("maps DBS debit/credit and named-month dates", async () => {
    const result = await parseImportText(DBS_CSV, {
      filename: "dbs.csv",
    });
    assert.equal(result.detectedPreset, "dbs");
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0]?.occurred_on, "2026-08-08");
    assert.equal(result.rows[0]?.amount_paise, -35000);
    assert.equal(result.rows[0]?.suggested_category_name, "Dining");
    assert.equal(result.rows[1]?.type, "income");
    assert.equal(result.rows[1]?.amount_paise, 1250);
    assert.equal(result.rows[1]?.suggested_category_name, "Interest");
    assert.equal(result.rows[2]?.occurred_on, "2026-08-10");
    assert.equal(result.rows[2]?.suggested_category_name, "Dining");
  });

  it("parses the same HDFC layout from an .xlsx buffer", async () => {
    const lines = [
      ["HDFC BANK"],
      ["Account Statement for A/c XXXX1234"],
      [],
      [
        "Date",
        "Narration",
        "Value Dat",
        "Debit Amount",
        "Credit Amount",
        "Chq/Ref Number",
        "Closing Balance",
      ],
      [
        "01/08/2026",
        "UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT",
        "01/08/2026",
        "450.00",
        "0.00",
        "",
        "50000.00",
      ],
      [
        "02/08/2026",
        "NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG",
        "02/08/2026",
        "0.00",
        "120000.00",
        "",
        "169550.00",
      ],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(lines);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as Uint8Array;

    const result = await parseImportBuffer(bytes, {
      filename: "hdfc-savings.xlsx",
    });
    assert.equal(result.detectedPreset, "hdfc_savings");
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0]?.amount_paise, -45000);
    assert.equal(result.rows[1]?.amount_paise, 12000000);
  });

  it("detects presets from headers alone", () => {
    assert.equal(
      detectBankPreset(["Date", "Narration", "Debit Amount", "Credit Amount", "Closing Balance"]),
      "hdfc_savings",
    );
    assert.equal(
      detectBankPreset(["Transaction Date", "Transaction Description", "Credit / Debit", "Amount"]),
      "hdfc_cc",
    );
    assert.equal(
      detectBankPreset([
        "Transaction Date",
        "Transaction Description",
        "Debit",
        "Credit",
        "Account Balance",
      ]),
      "dbs",
    );
  });
});

describe("merchant heuristics", () => {
  it("extracts UPI and NEFT merchants", () => {
    assert.match(extractMerchant("UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111-PAYMENT"), /swiggy/i);
    assert.match(extractMerchant("NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG"), /acme/i);
  });

  it("scores salary credits as Salary", () => {
    const hit = applyHeuristics({
      narration: "NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG",
      type: "income",
    });
    assert.equal(hit.suggested_category_name, "Salary");
    assert.ok(hit.confidence >= 0.9);
  });
});
