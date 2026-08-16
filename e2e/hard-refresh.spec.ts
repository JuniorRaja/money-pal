import { test, expect } from "./fixtures";

/**
 * Hard-refresh SSR regression net — P0-1.
 *
 * Root cause (60fc06d): reads went through a browser-only localStorage
 * session, so every route loader got `[]` during SSR and a page stayed
 * blank until a client-side navigation re-ran the loader with a real
 * session. A hard reload never triggers that client nav, so it would stay
 * blank forever under the old bug. Every other spec in this suite only ever
 * reaches these routes via `page.goto()` from a fresh context or a client
 * transition after sign-in — never a reload of an already-authenticated tab
 * — so this is the one regression net that exercises cookie-based SSR reads
 * on a true hard refresh.
 */

test.describe("Hard refresh renders real content, not a blank SSR shell", () => {
  test("transactions", async ({ transactionsPage: page }) => {
    await page.reload();
    await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("budgets", async ({ budgetsPage: page }) => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("budget-month-label")).toBeVisible();
  });

  test("accounts", async ({ accountsPage: page }) => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Yours after custodial")).toBeVisible();
  });

  test("goals", async ({ goalsPage: page }) => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible({ timeout: 15_000 });
    // Either a real card or the empty state is a loaded render; a blank SSR
    // shell under the old bug would show neither.
    await expect(
      page.locator('[data-testid^="goal-card-"]').or(page.getByTestId("goal-empty")).first(),
    ).toBeVisible();
  });

  test("imports", async ({ importsPage: page }) => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Import Center" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("CSV / Excel")).toBeVisible();
  });
});
