import { test as base, expect, type Page } from "./fixtures";
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

const email = process.env.E2E_EMAIL ?? process.env.TESTING_USERID ?? process.env.TEST_EMAIL ?? "";
const password = process.env.E2E_PASSWORD ?? process.env.TESTING_PASSWORD ?? process.env.TEST_PASSWORD ?? "";

async function ensureSignedIn(page: Page) {
  await page.goto("/budgets");
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/login")) return;

  if (!email || !password) {
    throw new Error("Budgets tests need E2E_EMAIL and E2E_PASSWORD (or TEST_EMAIL / TEST_PASSWORD).");
  }

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
  await page.goto("/budgets");
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible({ timeout: 15_000 });
}

const test = base.extend<{ budgetsPage: Page }>({
  budgetsPage: async ({ page }, use) => {
    await ensureSignedIn(page);
    await use(page);
  },
});

test.describe("Budgets", () => {
  test.describe.configure({ mode: "serial" });
  test("page loads with month picker and stats", async ({ budgetsPage: page }) => {
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    await expect(page.getByTestId("budget-month-label")).toHaveText(formatPeriodLabel(currentPeriod()));
    for (const label of ["Planned", "Spent so far", "Remaining", "Categories over"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("budget-new")).toBeVisible();
    await expect(page.getByTestId("budget-apply-template")).toBeVisible();
    await expect(page.getByTestId("budget-copy-last")).toBeVisible();
  });

  test("month picker moves to previous and next month", async ({ budgetsPage: page }) => {
    const prev = shiftPeriod(currentPeriod(), -1);
    await page.getByTestId("budget-month-prev").click();
    await expect(page.getByTestId("budget-month-label")).toHaveText(formatPeriodLabel(prev));
    await expect(page).toHaveURL(new RegExp(`period=${prev}`));

    await page.getByTestId("budget-month-next").click();
    await expect(page.getByTestId("budget-month-label")).toHaveText(formatPeriodLabel(currentPeriod()));
  });

  test("New budget opens the add dialog with budget fields", async ({ budgetsPage: page }) => {
    await page.getByTestId("budget-new").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Category")).toBeVisible();
    await expect(dialog.getByText("Planned (₹)")).toBeVisible();
    await expect(dialog.getByText("Period")).toBeVisible();
    const options = await dialog.locator("select").first().locator("option").allTextContents();
    expect(options.join(" ")).not.toMatch(/Salary|Freelance|Transfer/i);
  });

  test("50/30/20 template dialog asks for monthly income", async ({ budgetsPage: page }) => {
    await page.getByTestId("budget-apply-template").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Apply Balanced 50/30/20")).toBeVisible();
    await expect(dialog.getByText("Monthly income (₹)")).toBeVisible();
    await dialog.getByRole("button", { name: "Apply template" }).click();
    await expect(dialog.getByText(/greater than 0/i)).toBeVisible();
  });

  test("copy last month is safe when there is nothing to copy", async ({ budgetsPage: page }) => {
    const far = shiftPeriod(currentPeriod(), 18);
    await page.goto(`/budgets?period=${far}`);
    await expect(page.getByTestId("budget-month-label")).toHaveText(formatPeriodLabel(far));
    await page.getByTestId("budget-copy-last").click();
    await expect(page.getByText(/Nothing to copy|Copied |Already planned/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
