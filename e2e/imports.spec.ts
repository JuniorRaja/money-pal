import { test as base, expect, type Page } from "./fixtures";

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

const email = process.env.E2E_EMAIL ?? process.env.TESTING_USERID ?? process.env.TEST_EMAIL ?? "";
const password =
  process.env.E2E_PASSWORD ?? process.env.TESTING_PASSWORD ?? process.env.TEST_PASSWORD ?? "";

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

async function ensureSignedIn(page: Page) {
  await page.goto("/imports");
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/login")) return;

  if (!email || !password) {
    throw new Error("Import tests need E2E_EMAIL and E2E_PASSWORD (or TEST_EMAIL / TEST_PASSWORD).");
  }

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Import Center" })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Drops the fixture and lands on the review deck. The dialog only renders its
 * file input once five repository reads resolve, so the wait is generous. When
 * more than one account matches the statement the wizard asks which one — pick
 * the first rather than assuming the single-candidate shortcut.
 */
async function dropStatement(page: Page) {
  // The tile renders in the SSR HTML but does nothing until React hydrates, and
  // Playwright's actionability checks do not wait for that — so click until the
  // dialog actually appears rather than once.
  const input = page.locator('input[type="file"]');
  await expect(async () => {
    await page.locator('main button:has-text("CSV / Excel")').click();
    await expect(input).toBeAttached({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await input.setInputFiles({
    name: `hdfc-${Date.now()}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(STATEMENT, "utf8"),
  });

  const accountSelect = page.locator('[role="dialog"] select');
  const deck = page.getByText(/left in this job/);
  await expect(accountSelect.or(deck).first()).toBeVisible({ timeout: 30_000 });

  if (await accountSelect.isVisible().catch(() => false)) {
    const value = await accountSelect.locator("option").nth(1).getAttribute("value");
    await accountSelect.selectOption(value ?? "");
    await page.locator('[role="dialog"] button:has-text("Review rows")').click();
  }
  await expect(deck).toBeVisible({ timeout: 30_000 });
}

const test = base.extend<{ importsPage: Page }>({
  importsPage: async ({ page }, use) => {
    await ensureSignedIn(page);
    await use(page);
  },
});

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
    await dropStatement(page);
    // Reaching the deck at all means date/description/amount resolved on their
    // own — the mapping editor never appeared.
    await expect(page.getByText(/Match date, description, and amount/)).toBeHidden();
    await expect(page.getByText(/left in this job/)).toContainText("3");
  });

  test("review deck shows the amount and date the statement stated", async ({
    importsPage: page,
  }) => {
    await dropStatement(page);
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
    await dropStatement(page);
    const card = page.locator('[role="dialog"] article').first();
    await expect(card).toBeVisible();

    await page.locator('[role="dialog"] button:has-text("Hold")').click();

    // Whether hold succeeds or the RPC is missing, a stuck flying card with the
    // live card at opacity-0 is the failure this guards against.
    await expect(card).toHaveCSS("opacity", "1", { timeout: 15_000 });
    await expect(page.locator('[role="dialog"] button:has-text("Accept")')).toBeEnabled();
  });
});
