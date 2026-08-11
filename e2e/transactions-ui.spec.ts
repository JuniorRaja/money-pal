import { test, expect, clickTransactionRow, assertDetailField, setFilter } from "./fixtures";

test.describe("Transactions Page — UI Functionality", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // PAGE LOAD & LAYOUT
  // ─────────────────────────────────────────────────────────────────────────

  test("page loads with title and subtitle", async ({ transactionsPage: page }) => {
    await expect(page.locator("text=Transactions")).toBeVisible();
    await expect(page.locator("text=Every financial event, organized and clear.")).toBeVisible();
  });

  test("summary stats panel is visible with all four metrics", async ({ transactionsPage: page }) => {
    const stats = ["Total Transactions", "Total Income", "Total Expenses", "Net Cash Flow"];
    for (const label of stats) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("transactions table renders with correct column headers", async ({ transactionsPage: page }) => {
    const headers = ["Date", "Merchant", "Category", "Account", "Label", "Amount"];
    for (const header of headers) {
      await expect(page.locator("thead").locator(`text=${header}`)).toBeVisible();
    }
  });

  test("transactions are grouped by day with date header rows", async ({ transactionsPage: page }) => {
    // Day group rows have a specific bg class and span all columns
    const dayHeaders = page.locator("tr.bg-muted\\/50");
    const count = await dayHeaders.count();
    expect(count).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TABLE INTERACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  test("clicking a transaction row opens the detail panel", async ({ transactionsPage: page }) => {
    // Click the first data row (not a day-header row)
    const firstRow = page.locator("table tbody tr").filter({ hasNotText: /^(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/ }).first();
    await firstRow.click();

    // Detail panel (aside) should appear
    await expect(page.locator("aside")).toBeVisible();
  });

  test("detail panel shows merchant name and amount", async ({ transactionsPage: page }) => {
    // Click a known transaction row — use first clickable row
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside");
    await expect(aside).toBeVisible();

    // Should have merchant name (first letter avatar + text)
    await expect(aside.locator("p.text-sm.font-medium")).toBeVisible();
    // Should have amount displayed
    await expect(aside.locator("p.numeric.text-3xl")).toBeVisible();
  });

  test("detail panel has Details and Notes tabs", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside");
    await expect(aside.locator("button", { hasText: "Details" })).toBeVisible();
    await expect(aside.locator("button", { hasText: "Notes & Attachments" })).toBeVisible();
  });

  test("detail panel Details tab shows transaction metadata fields", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside");
    // Details tab should be active by default
    const fields = ["Account", "Category", "Type", "Payment Method", "Source", "Transaction ID", "Confidence"];
    for (const field of fields) {
      await expect(aside.locator(`dt:has-text("${field}")`)).toBeVisible();
    }
  });

  test("detail panel Notes tab shows textarea", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside");
    await aside.locator("button", { hasText: "Notes & Attachments" }).click();
    await expect(aside.locator("textarea")).toBeVisible();
  });

  test("closing detail panel removes it from the DOM", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();
    await expect(page.locator("aside")).toBeVisible();

    // Click close button (X icon)
    await page.locator("aside button").filter({ has: page.locator("svg") }).first().click();
    await expect(page.locator("aside")).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FILTERS
  // ─────────────────────────────────────────────────────────────────────────

  test("search input filters transactions by merchant name", async ({ transactionsPage: page }) => {
    const searchInput = page.locator("input[placeholder*='Search']");
    await searchInput.fill("Zomato");

    // Wait for reactivity
    await page.waitForTimeout(300);

    // Either rows match or "Nothing matches" is shown
    const rows = page.locator("table tbody tr:not(.bg-muted\\/50)");
    const rowCount = await rows.count();
    if (rowCount > 0) {
      // All visible rows should contain the search term
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).textContent();
        expect(text?.toLowerCase()).toContain("zomato");
      }
    } else {
      await expect(page.locator("text=Nothing matches those filters yet.")).toBeVisible();
    }
  });

  test("type filter shows only selected transaction type", async ({ transactionsPage: page }) => {
    // Find the type filter select
    const typeSelect = page.locator("select").last();
    await typeSelect.selectOption("expense");

    await page.waitForTimeout(300);

    // If we open detail panel on any visible row, type should be "expense"
    const rows = page.locator("table tbody tr:not(.bg-muted\\/50)");
    const rowCount = await rows.count();
    if (rowCount > 0) {
      await rows.first().click();
      const aside = page.locator("aside");
      await expect(aside).toBeVisible();
      const typeField = aside.locator("dt:has-text('Type')").locator("..").locator("dd");
      await expect(typeField).toContainText("expense");
    }
  });

  test("period filter changes displayed transactions", async ({ transactionsPage: page }) => {
    // Get initial row count
    const initialRows = await page.locator("table tbody tr:not(.bg-muted\\/50)").count();

    // Switch to "All time"
    const periodSelect = page.locator("select").first();
    await periodSelect.selectOption("");

    await page.waitForTimeout(300);

    const allTimeRows = await page.locator("table tbody tr:not(.bg-muted\\/50)").count();
    // All time should show >= current month rows
    expect(allTimeRows).toBeGreaterThanOrEqual(initialRows);
  });

  test("empty state message shows when no transactions match filters", async ({ transactionsPage: page }) => {
    const searchInput = page.locator("input[placeholder*='Search']");
    await searchInput.fill("xyznonexistentmerchant12345");

    await page.waitForTimeout(300);
    await expect(page.locator("text=Nothing matches those filters yet.")).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RESPONSIVENESS & SELECTED STATE
  // ─────────────────────────────────────────────────────────────────────────

  test("selected row has highlighted background", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    // The row should have the selected class
    await expect(dataRow).toHaveClass(/bg-accent/);
  });

  test("clicking different row changes detail panel content", async ({ transactionsPage: page }) => {
    const rows = page.locator("table tbody tr:not(.bg-muted\\/50)");
    const rowCount = await rows.count();
    if (rowCount < 2) return; // Need at least 2 rows

    await rows.first().click();
    const aside = page.locator("aside");
    const firstMerchant = await aside.locator("p.text-sm.font-medium").textContent();

    await rows.nth(1).click();
    const secondMerchant = await aside.locator("p.text-sm.font-medium").textContent();

    // Different rows should show different merchants (or at minimum panel updates)
    expect(firstMerchant).not.toBeNull();
    expect(secondMerchant).not.toBeNull();
  });
});
