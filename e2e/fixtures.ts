import { test as base, expect, type Page } from "@playwright/test";

/**
 * Custom test fixtures for Money Pal E2E tests.
 *
 * - `transactionsPage`: navigates to /transactions and waits for the page to
 *   be fully loaded (table visible).
 * - `authenticatedPage`: if login is required, handles Supabase auth flow.
 *   For now, assumes the app shows data without auth in dev mode or that
 *   the session cookie is pre-seeded.
 */

export interface TransactionsFixtures {
  transactionsPage: Page;
}

export const test = base.extend<TransactionsFixtures>({
  transactionsPage: async ({ page }, use) => {
    await page.goto("/transactions");
    // Wait for the transactions table to render
    await page.waitForSelector("table", { timeout: 15_000 });
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
export async function assertDetailField(page: Page, label: string, expected: string): Promise<void> {
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
