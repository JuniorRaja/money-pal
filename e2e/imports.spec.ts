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

async function dropStatement(page: Page) {
  await page.getByText("CSV / Excel").click();
  const input = page.locator('input[type="file"]');
  await expect(input).toBeAttached({ timeout: 10_000 });
  await input.setInputFiles({
    name: `hdfc-${Date.now()}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(STATEMENT, "utf8"),
  });
}

const test = base.extend<{ importsPage: Page }>({
  importsPage: async ({ page }, use) => {
    await ensureSignedIn(page);
    await use(page);
  },
});

test.describe("Import Center", () => {
  test.describe.configure({ mode: "serial" });

  test("hub renders the ingest tiles", async ({ importsPage: page }) => {
    await expect(page.getByRole("heading", { name: "Import Center" })).toBeVisible();
    await expect(page.getByText("CSV / Excel")).toBeVisible();
    await expect(page.getByText("Manual entry")).toBeVisible();
  });

  test("detects the bank and stages rows without asking for a mapping", async ({
    importsPage: page,
  }) => {
    await dropStatement(page);
    // Detection + staging is automatic when exactly one account matches; either
    // the account step or the review deck is a pass, a mapping editor is not.
    await expect(page.getByText(/Match date, description, and amount/)).toBeHidden();
    await expect(page.getByText(/left in this job|Which account is this statement for/)).toBeVisible(
      { timeout: 20_000 },
    );
  });

  test("review deck shows the amount and date the statement stated", async ({
    importsPage: page,
  }) => {
    await dropStatement(page);
    const deck = page.getByText(/left in this job/);
    await expect(deck).toBeVisible({ timeout: 20_000 });

    // "Rs.100" must read as ₹100.00, not ₹0.10 (the character-class bug), and
    // 01 Aug must not slip to 31 Jul (the UTC-slice bug).
    await expect(page.locator("article").first()).toContainText("100.00");
    await expect(page.locator("article").first()).toContainText(/01 Aug 2026/);
  });

  test("skip advances the deck and back restores the row", async ({ importsPage: page }) => {
    await dropStatement(page);
    await expect(page.getByText(/left in this job/)).toBeVisible({ timeout: 20_000 });

    const remaining = async () => {
      const text = (await page.getByText(/left in this job/).textContent()) ?? "";
      return Number(text.match(/(\d+)/)?.[1] ?? 0);
    };

    const before = await remaining();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect.poll(remaining, { timeout: 15_000 }).toBe(before - 1);

    await page.getByRole("button", { name: "Back" }).click();
    await expect.poll(remaining, { timeout: 15_000 }).toBe(before);

    // The deck must still be interactive — a failed mutation used to leave a
    // stuck flying card with the live card at opacity-0 and no way forward.
    await expect(page.getByRole("button", { name: "Accept" })).toBeEnabled();
  });
});
