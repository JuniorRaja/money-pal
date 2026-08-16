import { test, expect, clickWhenReady } from "./fixtures";
import { currentPeriod, formatPeriodLabel, shiftPeriod } from "../src/lib/period";

/**
 * Budgets E2E plan (Playwright)
 *
 * 1. Open /budgets (sign in if the app redirects to /login).
 * 2. Month picker shows the local calendar month; prev/next changes the label.
 * 3. New budget opens the add dialog with Category, Planned, Period (no income/transfer).
 * 4. Empty month shows the empty state; 50/30/20 opens the income dialog.
 * 5. Copy last month is available and does not crash (toast on nothing to copy is OK).
 * 6. Stats Planned / Spent so far / Remaining / Categories over are visible.
 */

test.describe("Budgets", () => {
  test.describe.configure({ mode: "serial" });
  test("page loads with month picker and stats", async ({ budgetsPage: page }) => {
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    await expect(page.getByTestId("budget-month-label")).toHaveText(
      formatPeriodLabel(currentPeriod()),
    );
    for (const label of ["Planned", "Spent so far", "Remaining", "Categories over"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("budget-new")).toBeVisible();
    await expect(page.getByTestId("budget-apply-template")).toBeVisible();
    await expect(page.getByTestId("budget-copy-last")).toBeVisible();
  });

  test("month picker moves to previous and next month", async ({ budgetsPage: page }) => {
    const prev = shiftPeriod(currentPeriod(), -1);
    const label = page.getByTestId("budget-month-label");
    // First click on a fresh page can land before hydration wires it up.
    await expect(async () => {
      await page.getByTestId("budget-month-prev").click();
      await expect(label).toHaveText(formatPeriodLabel(prev), { timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`period=${prev}`));

    await page.getByTestId("budget-month-next").click();
    await expect(label).toHaveText(formatPeriodLabel(currentPeriod()));
  });

  test("New budget opens the add dialog with budget fields", async ({ budgetsPage: page }) => {
    const dialog = page.getByRole("dialog");
    await clickWhenReady(page.getByTestId("budget-new"), dialog);
    await expect(dialog.getByText("Category", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Planned (₹)")).toBeVisible();
    await expect(dialog.getByText("Period")).toBeVisible();
    const options = await dialog.locator("select").first().locator("option").allTextContents();
    expect(options.join(" ")).not.toMatch(/Salary|Freelance|Transfer/i);
  });

  test("50/30/20 template dialog asks for monthly income", async ({ budgetsPage: page }) => {
    const dialog = page.getByRole("dialog");
    await clickWhenReady(page.getByTestId("budget-apply-template"), dialog);
    await expect(dialog.getByText("Apply Balanced 50/30/20")).toBeVisible();
    await expect(dialog.getByText("Monthly income (₹)")).toBeVisible();
    await dialog.getByRole("button", { name: "Apply template" }).click();
    await expect(dialog.getByText(/greater than 0/i)).toBeVisible();
  });

  test("copy last month is safe when there is nothing to copy", async ({ budgetsPage: page }) => {
    const far = shiftPeriod(currentPeriod(), 18);
    await page.goto(`/budgets?period=${far}`);
    await expect(page.getByTestId("budget-month-label")).toHaveText(formatPeriodLabel(far));
    // Same hydration race as the other first-interaction clicks in this file.
    await expect(async () => {
      await page.getByTestId("budget-copy-last").click();
      await expect(page.getByText(/Nothing to copy|Copied |Already planned/i)).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 15_000 });
  });
});
