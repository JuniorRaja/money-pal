import { test, expect } from "./fixtures";
import { dropStatement } from "./import-helpers";

/**
 * Import Center E2E plan (Playwright)
 *
 * 1. Open /imports (sign in if the app redirects to /login).
 * 2. The CSV / Excel tile opens the import dialog.
 * 3. A dropped HDFC statement is detected, mapped, and staged without help.
 * 4. The review deck shows the first row with the date and amount the file
 *    stated — this is the regression net for the paise and IST-date fixes.
 * 5. Skip / Hold / Back move rows through the deck without stranding it.
 *
 * The file never leaves the browser, so the fixture is written straight into
 * the file input rather than uploaded from disk.
 */

/**
 * Amounts here exercise the parser paths that used to fail silently:
 * "Rs." prefixes and Indian digit grouping. Dates are first-of-month so a
 * one-day shift lands in the previous month and is impossible to miss.
 */
const STATEMENT = `HDFC BANK
Account Statement for A/c XXXX1234

Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
01/08/2026,UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT,01/08/2026,Rs.100,0.00,,50000.00
01/09/2026,NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG,01/09/2026,0.00,"1,20,000.00",,169550.00
01/10/2026,UPI-AMAZON-amazonpay@apl-0000-333-SHOP,01/10/2026,"Rs. 1,299.00",,,168251.00
`;

/**
 * A second, distinct statement for the commit round-trip test — one row, its
 * own amount/date/narration, so the resulting transaction is unambiguous to
 * find on /transactions regardless of what earlier tests staged or held from
 * STATEMENT above. The reference number carries a run-unique timestamp so a
 * re-run's exact-hash dedupe (DECISIONS — "Import — hash dedupe") never
 * silently skips staging it.
 */
const ROUNDTRIP_STATEMENT = `HDFC BANK
Account Statement for A/c XXXX1234

Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
02/08/2026,UPI-SWIGGY-E2EROUNDTRIP@YBL-HDFC0001234-${Date.now()}-PAYMENT,02/08/2026,Rs.222.00,0.00,,50000.00
`;

test.describe("Import Center", () => {
  // The import dialog cannot accept a file until five repository reads resolve,
  // which is well past the 30s default on a slow Supabase connection.
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("hub renders the ingest tiles", async ({ importsPage: page }) => {
    await expect(page.getByRole("heading", { name: "Import Center" })).toBeVisible();
    await expect(page.getByText("CSV / Excel")).toBeVisible();
    await expect(page.getByText("Manual entry")).toBeVisible();
  });

  test("maps the columns without asking for help", async ({ importsPage: page }) => {
    await dropStatement(page, STATEMENT);
    // Reaching the deck at all means date/description/amount resolved on their
    // own — the mapping editor never appeared.
    await expect(page.getByText(/Match date, description, and amount/)).toBeHidden();
    await expect(page.getByText(/left in this job/)).toContainText("3");
  });

  test("review deck shows the amount and date the statement stated", async ({
    importsPage: page,
  }) => {
    await dropStatement(page, STATEMENT);
    const card = page.locator('[role="dialog"] article').first();

    // "Rs.100" must read as ₹100.00, not ₹0.10 (the character-class bug), and
    // 01 Aug must not slip to 31 Jul (the UTC-slice bug).
    await expect(card).toContainText("100.00");
    await expect(card).toContainText(/01 Aug 2026/);

    // The edit field is what accept posts back, so it must agree with the card.
    await page.locator('[role="dialog"] button:has-text("Edit")').click();
    await expect(page.locator('[role="dialog"] input[type="date"]')).toHaveValue("2026-08-01");
  });

  test("the deck stays interactive when a row action fails", async ({ importsPage: page }) => {
    await dropStatement(page, STATEMENT);
    const card = page.locator('[role="dialog"] article').first();
    await expect(card).toBeVisible();

    await page.locator('[role="dialog"] button:has-text("Hold")').click();

    // Whether hold succeeds or the RPC is missing, a stuck flying card with the
    // live card at opacity-0 is the failure this guards against.
    await expect(card).toHaveCSS("opacity", "1", { timeout: 15_000 });
    await expect(page.locator('[role="dialog"] button:has-text("Accept")')).toBeEnabled();
  });

  test("accepting a row commits it — it appears on /transactions with the right amount, date, and category", async ({
    importsPage: page,
  }) => {
    await dropStatement(page, ROUNDTRIP_STATEMENT);
    const card = page.locator('[role="dialog"] article').first();
    await expect(card).toContainText("222.00");
    await expect(card).toContainText(/02 Aug 2026/);

    await page.locator('[role="dialog"] button:has-text("Accept")').click();
    await expect(page.getByText("Caught up for now")).toBeVisible({ timeout: 15_000 });
    await page.locator('[role="dialog"] button:has-text("Back to Import Center")').click();

    await page.goto("/transactions");
    await page.waitForSelector("table", { timeout: 15_000 });
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: "Swiggy" })
      .filter({ hasText: "222.00" });
    await expect(row.first()).toBeVisible({ timeout: 10_000 });
    // SWIGGY is a keyword-mapped Dining merchant (see lib/import/heuristics.ts).
    await expect(row.first().locator("td").nth(2)).toContainText("Dining");
  });
});
