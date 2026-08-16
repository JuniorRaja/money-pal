import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * Custom test fixtures for Money Pal E2E tests.
 *
 * One shared sign-in path (`ensureSignedIn`) for every page fixture below —
 * see docs/plans/P2-2-playwright-journeys.md for why three copies of this
 * used to exist. Auth is env-based real Supabase session, not a mock: set
 * TESTING_USERID / TESTING_PASSWORD (see .env.example).
 */

const email = process.env.TESTING_USERID ?? "";
const password = process.env.TESTING_PASSWORD ?? "";

/**
 * Navigates to `path`, signs in via the real login form if redirected, then
 * re-navigates to `path` and waits for `ready` to confirm the page loaded.
 */
export async function ensureSignedIn(
  page: Page,
  path: string,
  ready: (page: Page) => Promise<unknown>,
): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    if (!email || !password) {
      throw new Error(
        "E2E tests need TESTING_USERID and TESTING_PASSWORD set (see .env.example).",
      );
    }
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
    await page.goto(path);
  }
  await ready(page);
}

/**
 * A page's first click after load can land before React finishes hydrating —
 * the SSR HTML is already there, but nothing is wired up yet, and
 * Playwright's actionability checks don't wait for hydration. Click until
 * `opens` actually shows up rather than once.
 */
export async function clickWhenReady(
  target: Locator,
  opens: Locator,
  timeout = 30_000,
): Promise<void> {
  await expect(async () => {
    await target.click();
    await expect(opens).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout });
}

export interface AppFixtures {
  transactionsPage: Page;
  budgetsPage: Page;
  importsPage: Page;
  goalsPage: Page;
  accountsPage: Page;
}

export const test = base.extend<AppFixtures>({
  transactionsPage: async ({ page }, use) => {
    await ensureSignedIn(page, "/transactions", (p) =>
      p.waitForSelector("table", { timeout: 15_000 }),
    );
    await use(page);
  },
  budgetsPage: async ({ page }, use) => {
    await ensureSignedIn(page, "/budgets", (p) =>
      expect(p.getByRole("heading", { name: "Budgets" })).toBeVisible({ timeout: 15_000 }),
    );
    await use(page);
  },
  importsPage: async ({ page }, use) => {
    await ensureSignedIn(page, "/imports", (p) =>
      expect(p.getByRole("heading", { name: "Import Center" })).toBeVisible({ timeout: 15_000 }),
    );
    await use(page);
  },
  goalsPage: async ({ page }, use) => {
    await ensureSignedIn(page, "/goals", (p) =>
      expect(p.getByRole("heading", { name: "Goals" })).toBeVisible({ timeout: 15_000 }),
    );
    await use(page);
  },
  accountsPage: async ({ page }, use) => {
    // "Accounts" also substring-matches the "Cash & Bank Accounts" section
    // heading below it, so this needs an exact match.
    await ensureSignedIn(page, "/accounts", (p) =>
      expect(p.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible({
        timeout: 15_000,
      }),
    );
    await use(page);
  },
});

export { expect };

/**
 * Helper: get the text content of a summary stat by its label.
 */
export async function getStatValue(page: Page, label: string): Promise<string> {
  const stat = page.locator(`text=${label}`).locator("..").locator("p.numeric");
  return (await stat.textContent()) ?? "";
}

/**
 * Helper: click a row in the transactions table by merchant name.
 */
export async function clickTransactionRow(page: Page, merchant: string): Promise<void> {
  await page.locator(`table tr`).filter({ hasText: merchant }).first().click();
}

/**
 * Helper: verify the detail panel shows a specific field value.
 */
export async function assertDetailField(
  page: Page,
  label: string,
  expected: string,
): Promise<void> {
  const field = page.locator("aside").locator(`text=${label}`).locator("..").locator("dd");
  await expect(field).toContainText(expected);
}

/**
 * Helper: select a filter dropdown value by its display prefix.
 */
export async function setFilter(page: Page, prefix: string, value: string): Promise<void> {
  const select = page.locator("select").filter({ hasText: new RegExp(prefix) });
  await select.selectOption({ label: value });
}

/**
 * Helper: parse a formatted money string back to a number (paise).
 * Handles Indian number format: "−₹1,23,456.78" → -12345678
 */
export function parseMoney(formatted: string): number {
  const negative = formatted.includes("−") || formatted.includes("-");
  const cleaned = formatted.replace(/[^0-9.]/g, "");
  const value = Math.round(parseFloat(cleaned) * 100);
  return negative ? -value : value;
}
