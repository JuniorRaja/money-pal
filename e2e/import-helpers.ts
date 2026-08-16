import { expect, type Page } from "./fixtures";

/**
 * Drops a CSV statement and lands on the review deck. The dialog only renders
 * its file input once five repository reads resolve, so the wait is
 * generous. When more than one account matches the statement the wizard
 * asks which one — pick the first rather than assuming the single-candidate
 * shortcut.
 */
export async function dropStatement(page: Page, statement: string): Promise<void> {
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
    buffer: Buffer.from(statement, "utf8"),
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
