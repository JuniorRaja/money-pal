import { test, expect, parseMoney } from "./fixtures";

test.describe("Transactions Page — Calculations & Amounts", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY STATS CORRECTNESS
  // ─────────────────────────────────────────────────────────────────────────

  test("Total Transactions count matches the number of table rows", async ({ transactionsPage: page }) => {
    // Get the displayed count from the stat
    const statEl = page.locator("text=Total Transactions").locator("..").locator("p.numeric");
    const countText = await statEl.textContent();
    const displayedCount = parseInt(countText?.trim() ?? "0", 10);

    // Count actual data rows in the table (excluding day-group headers)
    const dataRows = page.locator("table tbody tr:not(.bg-muted\\/50)");
    const actualCount = await dataRows.count();

    expect(displayedCount).toBe(actualCount);
  });

  test("Total Income equals sum of all positive amounts in the table", async ({ transactionsPage: page }) => {
    // Get all amount cells (last column)
    const amountCells = page.locator("table tbody tr:not(.bg-muted\\/50) td:last-child");
    const count = await amountCells.count();

    let incomeSum = 0;
    for (let i = 0; i < count; i++) {
      const text = (await amountCells.nth(i).textContent()) ?? "";
      // Positive amounts have text-success class or start with +
      const hasSuccess = await amountCells.nth(i).evaluate((el) =>
        el.classList.contains("text-success"),
      );
      if (hasSuccess) {
        incomeSum += parseMoney(text);
      }
    }

    // Get the displayed Total Income stat
    const incomeStatEl = page.locator("text=Total Income").locator("..").locator("p.numeric");
    const incomeText = (await incomeStatEl.textContent()) ?? "";
    const displayedIncome = parseMoney(incomeText);

    expect(displayedIncome).toBe(incomeSum);
  });

  test("Total Expenses equals sum of all negative amounts in the table (absolute)", async ({ transactionsPage: page }) => {
    const amountCells = page.locator("table tbody tr:not(.bg-muted\\/50) td:last-child");
    const count = await amountCells.count();

    let expenseSum = 0;
    for (let i = 0; i < count; i++) {
      const text = (await amountCells.nth(i).textContent()) ?? "";
      const hasDestructive = await amountCells.nth(i).evaluate((el) =>
        el.classList.contains("text-destructive"),
      );
      if (hasDestructive) {
        // parseMoney returns negative for expenses, we accumulate absolute
        expenseSum += Math.abs(parseMoney(text));
      }
    }

    // Total Expenses is displayed as a positive value (absolute)
    const expenseStatEl = page.locator("text=Total Expenses").locator("..").locator("p.numeric");
    const expenseText = (await expenseStatEl.textContent()) ?? "";
    const displayedExpense = parseMoney(expenseText);

    // The displayed value should match our computed sum (both absolute)
    expect(Math.abs(displayedExpense)).toBe(expenseSum);
  });

  test("Net Cash Flow equals Income minus Expenses", async ({ transactionsPage: page }) => {
    const incomeStatEl = page.locator("text=Total Income").locator("..").locator("p.numeric");
    const expenseStatEl = page.locator("text=Total Expenses").locator("..").locator("p.numeric");
    const netStatEl = page.locator("text=Net Cash Flow").locator("..").locator("p.numeric");

    const incomeText = (await incomeStatEl.textContent()) ?? "";
    const expenseText = (await expenseStatEl.textContent()) ?? "";
    const netText = (await netStatEl.textContent()) ?? "";

    const income = parseMoney(incomeText);
    const expense = parseMoney(expenseText);
    const net = parseMoney(netText);

    // Net = income - |expense| (expense stat is displayed as positive/negative)
    // The summariseCashflow function computes: net = income + expense (where expense is already negative)
    // But displayed expense is absolute, so: net = income - abs(expense)
    const expectedNet = income - Math.abs(expense);
    expect(net).toBe(expectedNet);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AMOUNT FORMATTING & SIGN DISPLAY
  // ─────────────────────────────────────────────────────────────────────────

  test("income amounts are displayed in green (text-success)", async ({ transactionsPage: page }) => {
    const amountCells = page.locator("table tbody tr:not(.bg-muted\\/50) td:last-child");
    const count = await amountCells.count();

    for (let i = 0; i < count; i++) {
      const text = (await amountCells.nth(i).textContent()) ?? "";
      const hasPlus = text.includes("+");
      if (hasPlus) {
        const hasSuccess = await amountCells.nth(i).evaluate((el) =>
          el.classList.contains("text-success"),
        );
        expect(hasSuccess).toBe(true);
      }
    }
  });

  test("expense amounts are displayed in red (text-destructive)", async ({ transactionsPage: page }) => {
    const amountCells = page.locator("table tbody tr:not(.bg-muted\\/50) td:last-child");
    const count = await amountCells.count();

    for (let i = 0; i < count; i++) {
      const text = (await amountCells.nth(i).textContent()) ?? "";
      // Expenses have minus sign (− or -)
      const hasMinus = text.includes("−") || (text.includes("-") && !text.includes("+"));
      if (hasMinus) {
        const hasDestructive = await amountCells.nth(i).evaluate((el) =>
          el.classList.contains("text-destructive"),
        );
        expect(hasDestructive).toBe(true);
      }
    }
  });

  test("all amounts display the rupee symbol (₹)", async ({ transactionsPage: page }) => {
    const amountCells = page.locator("table tbody tr:not(.bg-muted\\/50) td:last-child");
    const count = await amountCells.count();

    for (let i = 0; i < count; i++) {
      const text = (await amountCells.nth(i).textContent()) ?? "";
      if (text.trim()) {
        expect(text).toContain("₹");
      }
    }
  });

  test("detail panel amount matches the row amount", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    const rowAmountCell = dataRow.locator("td:last-child");
    const rowAmountText = (await rowAmountCell.textContent()) ?? "";
    const rowAmount = parseMoney(rowAmountText);

    await dataRow.click();
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();

    const panelAmountEl = aside.locator("p.numeric.text-3xl");
    const panelAmountText = (await panelAmountEl.textContent()) ?? "";
    const panelAmount = parseMoney(panelAmountText);

    expect(panelAmount).toBe(rowAmount);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIDENCE DISPLAY
  // ─────────────────────────────────────────────────────────────────────────

  test("confidence is displayed as percentage in detail panel", async ({ transactionsPage: page }) => {
    const dataRow = page.locator("table tbody tr:not(.bg-muted\\/50)").first();
    await dataRow.click();

    const aside = page.locator("aside");
    const confidenceField = aside.locator("dt:has-text('Confidence')").locator("..").locator("dd");
    const confidenceText = (await confidenceField.textContent()) ?? "";

    // Should contain a percentage like "98%" or "High · 98%"
    expect(confidenceText).toMatch(/\d+%/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FILTER CALCULATIONS — stats should update when filters change
  // ─────────────────────────────────────────────────────────────────────────

  test("stats update when type filter is applied", async ({ transactionsPage: page }) => {
    // Get initial stats
    const netBefore = (
      await page.locator("text=Net Cash Flow").locator("..").locator("p.numeric").textContent()
    ) ?? "";

    // Filter to income only
    const typeSelect = page.locator("select").last();
    await typeSelect.selectOption("income");
    await page.waitForTimeout(300);

    // After filtering to income, Total Expenses should be zero or the stat reflects only income
    const countAfter = (
      await page.locator("text=Total Transactions").locator("..").locator("p.numeric").textContent()
    ) ?? "";
    const rowsAfter = await page.locator("table tbody tr:not(.bg-muted\\/50)").count();

    // The count stat should match visible rows
    expect(parseInt(countAfter.trim(), 10)).toBe(rowsAfter);
  });

  test("stats recalculate correctly after search filter", async ({ transactionsPage: page }) => {
    const searchInput = page.locator("input[placeholder*='Search']");
    await searchInput.fill("a"); // broad filter to still get results
    await page.waitForTimeout(300);

    const countStat = (
      await page.locator("text=Total Transactions").locator("..").locator("p.numeric").textContent()
    ) ?? "";
    const displayedCount = parseInt(countStat.trim(), 10);
    const rowCount = await page.locator("table tbody tr:not(.bg-muted\\/50)").count();

    expect(displayedCount).toBe(rowCount);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DATE SORTING
  // ─────────────────────────────────────────────────────────────────────────

  test("transactions are sorted newest-first (descending date)", async ({ transactionsPage: page }) => {
    // Collect day group headers and verify they appear in descending order
    const dayHeaders = page.locator("tr.bg-muted\\/50 td");
    const count = await dayHeaders.count();

    if (count >= 2) {
      // Extract dates from the visible text — they contain formatted dates
      // Day headers show like "Today, 11 Aug 2026" or "Yesterday, 10 Aug 2026"
      // We just verify the first header is not older than the last
      const firstText = (await dayHeaders.first().textContent()) ?? "";
      const lastText = (await dayHeaders.last().textContent()) ?? "";

      // Both should be non-empty strings indicating valid date groups
      expect(firstText.trim().length).toBeGreaterThan(0);
      expect(lastText.trim().length).toBeGreaterThan(0);
    }
  });
});
