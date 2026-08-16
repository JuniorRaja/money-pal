import { test, expect } from "./fixtures";
import { dropStatement } from "./import-helpers";

/**
 * Near-duplicate import E2E plan (Playwright) — P0-3.
 *
 * Exact-hash dedupe (DECISIONS — "Import — hash dedupe") only catches a byte-
 * identical re-import. A statement re-exported with reworded narration slips
 * past it, so `matchNearDuplicates` (lib/import/near-duplicate.ts) instead
 * flags same account + same signed amount + date within ±1 IST day —
 * narration is irrelevant to the match. A flagged row must never commit by
 * itself: the deck leads with Skip and demotes Accept to "Accept anyway".
 *
 * First statement commits a seed transaction; the second, reworded one stages
 * a same-amount, next-day row against the same account and must come up
 * flagged. The amount is derived from the run's own timestamp so re-runs
 * don't collide with a leftover "seed" from an earlier run; the seed is also
 * deleted at the end so nothing accumulates across runs at all.
 */

const REF = Date.now();
const RUPEES = 1000 + (REF % 9000); // 1000–9999: wide enough to avoid re-run collisions
const AMOUNT_RAW = `${RUPEES}.00`; // plain digits, safe for the CSV statement text
// formatMoney (Intl en-IN) renders a 4-digit rupee amount as "D,DDD.00" —
// match that exact on-screen grouping for the UI assertions below.
const AMOUNT = `${Math.floor(RUPEES / 1000)},${String(RUPEES % 1000).padStart(3, "0")}.00`;

const SEED_STATEMENT = `HDFC BANK
Account Statement for A/c XXXX1234

Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
03/08/2026,UPI-BIGBASKET-E2EDUPSEED@YBL-HDFC0001234-${REF}-PAYMENT,03/08/2026,Rs.${AMOUNT_RAW},0.00,,50000.00
`;

// Same account, same signed amount, one day later, completely reworded
// narration — everything near-duplicate matching is supposed to catch.
const REWORDED_STATEMENT = `HDFC BANK
Account Statement for A/c XXXX1234

Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
04/08/2026,POS 998877 BIGBASKET GROCERY ORDER ${REF},04/08/2026,Rs.${AMOUNT_RAW},0.00,,49700.00
`;

test.describe("Import Center — near-duplicate detection", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("commits the seed transaction", async ({ importsPage: page }) => {
    await dropStatement(page, SEED_STATEMENT);
    const card = page.locator('[role="dialog"] article').first();
    await expect(card).toContainText(AMOUNT);
    await page.locator('[role="dialog"] button:has-text("Accept")').click();
    await expect(page.getByText("Caught up for now")).toBeVisible({ timeout: 15_000 });
  });

  test("a reworded same-amount, next-day row is flagged and does not commit by default", async ({
    importsPage: page,
  }) => {
    await dropStatement(page, REWORDED_STATEMENT);
    const card = page.locator('[role="dialog"] article').first();
    await expect(card).toContainText(AMOUNT);

    await expect(page.getByText("Looks like an existing transaction")).toBeVisible();

    // The safe action leads and accept is demoted — see review-deck.tsx.
    const skip = page.locator('[role="dialog"] button:has-text("Skip")');
    const accept = page.locator('[role="dialog"] button', { hasText: "Accept anyway" });
    await expect(accept).toBeVisible();
    await expect(skip).toBeVisible();

    // Skip resolves the flagged row without ever committing it.
    await skip.click();
    await expect(page.getByText("Caught up for now")).toBeVisible({ timeout: 15_000 });
    await page.locator('[role="dialog"] button:has-text("Back to Import Center")').click();

    await page.goto("/transactions");
    await page.waitForSelector("table", { timeout: 15_000 });
    const rows = page
      .locator("table tbody tr")
      .filter({ hasText: "Bigbasket" })
      .filter({ hasText: AMOUNT });
    // Only the seed commit exists — the flagged near-duplicate was skipped.
    await expect(rows).toHaveCount(1);

    // Cleanup: delete the seed commit so re-runs don't accumulate rows.
    await rows.first().click();
    const aside = page.locator("aside.rise");
    await aside.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Delete Transaction" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(rows).toHaveCount(0, { timeout: 10_000 });
  });
});
