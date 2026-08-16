import { test, expect, parseMoney, clickWhenReady } from "./fixtures";

/**
 * Slices E2E plan (Playwright)
 *
 * Slices split one account's balance into named owned/custodial/earmark parts.
 * A custodial slice's own tracked amount is what net worth excludes — see
 * `summariseOwnership` (owned = net_worth - custodial) — while the account's
 * raw balance never changes. Separately, transactions can be labelled with a
 * slice (visible in the detail panel and the Slice table column) for
 * reporting; that labelling does not move money or change net worth either.
 */

const sliceName = `E2E Custodial ${Date.now()}`;
let accountName = "";

test.describe("Slices", () => {
  test.describe.configure({ mode: "serial" });

  test("adding a custodial slice moves it out of net worth but not off the account balance", async ({
    accountsPage: page,
  }) => {
    // Pick an account that actually has transaction rows, so the next test's
    // filter-by-account-name on /transactions has something to find.
    await page.goto("/transactions");
    await page.waitForSelector("table", { timeout: 15_000 });
    const txnAccountNames = new Set(
      (await page.locator("table tbody tr td:nth-child(4)").allTextContents()).map((t) => t.trim()),
    );
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const manageable = page
      .locator("div.card-lift")
      .filter({ has: page.getByRole("button", { name: "Manage" }) });
    const count = await manageable.count();
    let card = manageable.first();
    for (let i = 0; i < count; i++) {
      const candidate = manageable.nth(i);
      const name = ((await candidate.locator("p.text-sm.font-medium").first().textContent()) ?? "").trim();
      if (txnAccountNames.has(name)) {
        card = candidate;
        accountName = name;
        break;
      }
    }
    await expect(card).toBeVisible();
    if (!accountName) {
      accountName = ((await card.locator("p.text-sm.font-medium").first().textContent()) ?? "").trim();
    }
    const balanceBefore = await card.locator("p.numeric.maskable").first().textContent();

    const ownedCard = page.locator(".card-lift", { hasText: "Yours after custodial" }).first();
    const ownedBefore = parseMoney((await ownedCard.locator("p.numeric").textContent()) ?? "");

    const dialog = page.getByRole("dialog");
    await clickWhenReady(card.getByRole("button", { name: "Manage" }), dialog);
    await expect(dialog.getByText("Slices —")).toBeVisible();

    await dialog.getByPlaceholder("Slice name — Mom, Rent, Trip").fill(sliceName);
    await dialog.getByPlaceholder("Amount (₹)").fill("500");
    await dialog.getByRole("button", { name: "Custodial", exact: true }).click();
    await dialog.getByRole("button", { name: "Add slice" }).click();

    const row = dialog.locator("li").filter({ hasText: sliceName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("custodial");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const balanceAfter = await card.locator("p.numeric.maskable").first().textContent();
    expect(balanceAfter).toBe(balanceBefore);

    const ownedAfter = parseMoney((await ownedCard.locator("p.numeric").textContent()) ?? "");
    expect(ownedAfter).toBe(ownedBefore - 50_000);
  });

  test("labelling an existing transaction with the slice shows up in the detail panel and table", async ({
    transactionsPage: page,
  }) => {
    const row = page
      .locator("table tbody tr:not(.bg-muted\\/50)")
      .filter({ has: page.locator("td:nth-child(4)", { hasText: accountName }) })
      .first();
    await expect(row).toBeVisible();
    await row.click();
    // The app shell's nav rail is also an <aside> — scope to the detail panel.
    const aside = page.locator("aside.rise");
    await expect(aside).toBeVisible();

    const popover = page.getByText("Pick a slice").locator("..");
    await clickWhenReady(aside.getByRole("button", { name: "Change Slice" }), popover);
    await popover.getByRole("button", { name: sliceName }).click();
    await expect(aside.locator("dl")).toContainText(sliceName);

    const sliceCell = row.locator("td").nth(4);
    await expect(sliceCell).toContainText(sliceName);

    // Revert so this account is back to how the slices test found it.
    await aside.getByRole("button", { name: "Change Slice" }).click();
    await page
      .getByText("Pick a slice")
      .locator("..")
      .getByRole("button", { name: "Unallocated" })
      .click();
    await expect(aside.locator("dl")).toContainText("Unallocated");
  });

  test("cleanup: archiving the slice removes it and restores the unallocated balance", async ({
    accountsPage: page,
  }) => {
    // Must be the same account test 1 added the slice to, not just any
    // manageable card — accountName was picked there to have transactions.
    const card = page
      .locator("div.card-lift")
      .filter({ has: page.getByRole("button", { name: "Manage" }) })
      .filter({ hasText: accountName });
    const dialog = page.getByRole("dialog");
    await clickWhenReady(card.getByRole("button", { name: "Manage" }), dialog);
    await dialog.getByRole("button", { name: `Archive ${sliceName}` }).click();
    await expect(dialog.locator("li").filter({ hasText: sliceName })).toBeHidden({
      timeout: 10_000,
    });
  });
});
