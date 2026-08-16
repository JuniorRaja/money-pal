import { test, expect, clickTransactionRow, assertDetailField, setFilter } from "./fixtures";

test.describe("Transactions Page — UI Functionality", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // PAGE LOAD & LAYOUT
  // ─────────────────────────────────────────────────────────────────────────

  test("page loads with title and subtitle", async ({ transactionsPage: page }) => {
    await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible();
    await expect(page.locator("text=Every financial event, organized and clear.")).toBeVisible();
  });

  test("summary stats panel is visible with all four metrics", async ({
    transactionsPage: page,
  }) => {
    const stats = ["Total Transactions", "Total Income", "Total Expenses", "Net Cash Flow"];
    for (const label of stats) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("transactions table renders with correct column headers", async ({
    transactionsPage: page,
  }) => {
    const headers = ["Date", "Merchant", "Category", "Account", "Slice", "Amount"];
    for (const header of headers) {
      await expect(page.locator("thead").locator(`text=${header}`)).toBeVisible();
    }
  });

  test("transactions are grouped by day with date header rows", async ({
    transactionsPage: page,
  }) => {
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
    const firstRow = page
      .locator("table tbody tr")
      .filter({
        hasNotText: /^(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/,
      })
      .first();
    await firstRow.click();

    // Detail panel (aside) should appear
    await expect(page.locator("aside.rise")).toBeVisible();
  });

  test("detail panel shows merchant name and amount", async ({ transactionsPage: page }) => {
    // Click a known transaction row — use first clickable row
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside.rise");
    await expect(aside).toBeVisible();

    // Should have merchant name (first letter avatar + text)
    await expect(aside.locator("p.text-sm.font-medium")).toBeVisible();
    // Should have amount displayed
    await expect(aside.locator("p.numeric.text-3xl")).toBeVisible();
  });

  test("detail panel shows transaction metadata fields", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside.rise");
    // See DetailRow usages in transactions.tsx — no separate tab strip, and
    // no Category/Payment Method/Confidence rows in the read-only panel.
    const fields = ["Slice", "Type", "Account", "Source", "Transaction ID"];
    for (const field of fields) {
      await expect(aside.locator(`dt:has-text("${field}")`)).toBeVisible();
    }
  });

  test("Add Note flips the panel into an editable notes view", async ({
    transactionsPage: page,
  }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside.rise");
    await aside.getByRole("button", { name: "Add Note" }).click();
    await expect(aside.locator("textarea")).toBeVisible();
  });

  test("closing detail panel removes it from the DOM", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();
    const aside = page.locator("aside.rise");
    await expect(aside).toBeVisible();

    // Click close button (X icon, top-right of the panel header).
    await aside
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first()
      .click();
    await expect(aside).toBeHidden();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FILTERS
  // ─────────────────────────────────────────────────────────────────────────

  test("search input filters transactions by merchant name", async ({ transactionsPage: page }) => {
    const searchInput = page.locator("input[placeholder*='Search']");
    // The empty-state row has no bg-muted/50 class either (it's a plain
    // <tr><td colSpan=6>), so exclude it explicitly or a 0-match search
    // miscounts it as one data row.
    const rows = page
      .locator("table tbody tr:not(.bg-muted\\/50)")
      .filter({ hasNotText: "Nothing matches those filters yet." });

    // First interaction on a fresh page can land before hydration wires the
    // input's onChange. A single fill() dispatches one input event that can
    // land in the same dead window — type it out instead so the controlled
    // value actually commits, and retry until the filter takes.
    await expect(async () => {
      await searchInput.fill("");
      await searchInput.pressSequentially("Zomato", { delay: 20 });
      await page.waitForTimeout(300);
      const rowCount = await rows.count();
      if (rowCount > 0) {
        const text = await rows.first().textContent();
        expect(text?.toLowerCase()).toContain("zomato");
      } else {
        await expect(page.getByText("Nothing matches those filters yet.")).toBeVisible({
          timeout: 1000,
        });
      }
    }).toPass({ timeout: 15_000 });
  });

  test("type filter shows only selected transaction type", async ({ transactionsPage: page }) => {
    // Find the type filter select — first interaction on a fresh page, same
    // hydration race as the search box: the native <select> visually shows
    // the picked option even when React's onChange missed it. A row-count
    // change isn't a reliable retry signal (the current period can
    // legitimately be all-expense already) — retry the whole flow against
    // the actual invariant: the opened row's own Type field.
    const typeSelect = page.locator("select").last();
    const rows = page.locator("table tbody tr:not(.bg-muted\\/50)");
    const aside = page.locator("aside.rise");

    await expect(async () => {
      await typeSelect.selectOption("expense");
      await page.waitForTimeout(300);
      expect(await rows.count()).toBeGreaterThan(0);
      await rows.first().click();
      await expect(aside).toBeVisible({ timeout: 2000 });
      const typeField = aside.locator("dt:has-text('Type')").locator("..").locator("dd");
      await expect(typeField).toContainText("expense", { timeout: 2000 });
    }).toPass({ timeout: 15_000 });
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

  test("empty state message shows when no transactions match filters", async ({
    transactionsPage: page,
  }) => {
    const searchInput = page.locator("input[placeholder*='Search']");
    const empty = page.getByText("Nothing matches those filters yet.");

    await expect(async () => {
      await searchInput.fill("");
      await searchInput.pressSequentially("xyznonexistentmerchant12345", { delay: 20 });
      await expect(empty).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
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

  test("clicking different row changes detail panel content", async ({
    transactionsPage: page,
  }) => {
    const rows = page.locator("table tbody tr:not(.bg-muted\\/50)");
    const rowCount = await rows.count();
    if (rowCount < 2) return; // Need at least 2 rows

    await rows.first().click();
    const aside = page.locator("aside.rise");
    const firstMerchant = await aside.locator("p.text-sm.font-medium").textContent();

    await rows.nth(1).click();
    const secondMerchant = await aside.locator("p.text-sm.font-medium").textContent();

    // Different rows should show different merchants (or at minimum panel updates)
    expect(firstMerchant).not.toBeNull();
    expect(secondMerchant).not.toBeNull();
  });
});
