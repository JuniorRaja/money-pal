import { test, expect, clickWhenReady } from "./fixtures";

/**
 * Goals E2E plan (Playwright)
 *
 * 1. New goal saves with a target and shows up as a card.
 * 2. Contribute can link an existing transaction; the goal's saved total
 *    reflects it.
 * 3. Unlinking that transaction from History leaves saved unchanged —
 *    DECISIONS "Goals — saved is stored contributions": saved is
 *    SUM(goal_contributions.amount), a link is metadata on top of that, not
 *    its source.
 * 4. Archive removes the goal from the active list without touching the ledger.
 */

const goalName = `E2E Goal ${Date.now()}`;

test.describe("Goals", () => {
  test.describe.configure({ mode: "serial" });

  test("New goal dialog creates a goal with a target", async ({ goalsPage: page }) => {
    const dialog = page.getByRole("dialog");
    await clickWhenReady(page.getByTestId("goal-new"), dialog);
    await dialog.getByLabel("Goal name").fill(goalName);
    await dialog.getByLabel("Target amount (₹)").fill("5000");
    await dialog.getByRole("button", { name: "Save goal" }).click();

    const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: goalName });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator("p.numeric.maskable")).toHaveText("₹0");
  });

  test("linking a transaction in Contribute, then unlinking it in History, leaves saved unchanged", async ({
    goalsPage: page,
  }) => {
    const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: goalName });

    const contributeItem = page.getByRole("menuitem", { name: "Contribute" });
    await clickWhenReady(card.getByRole("button", { name: "Goal actions" }), contributeItem);
    await contributeItem.click();
    const contribute = page.getByRole("dialog");
    await expect(contribute.getByText("Contribute", { exact: true })).toBeVisible();

    const txnSelect = contribute.getByLabel("Link transaction (optional)");
    const optionValue = await txnSelect.locator("option").nth(1).getAttribute("value");
    await txnSelect.selectOption(optionValue ?? "");
    // Picking a transaction auto-fills the amount from it, satisfying the >0 check.
    await contribute.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Contribution added")).toBeVisible({ timeout: 10_000 });

    // The toast can beat the router.invalidate()-driven DOM update, so poll
    // the value itself rather than reading it once right after the toast.
    const savedStat = card.locator("p.numeric.maskable");
    await expect(savedStat).not.toHaveText("₹0", { timeout: 10_000 });
    const savedAfterContribute = await savedStat.textContent();

    await card.getByRole("button", { name: "Goal actions" }).click();
    await page.getByRole("menuitem", { name: "History" }).click();
    const history = page.getByRole("dialog");
    await expect(history.getByText(`History · ${goalName}`)).toBeVisible();
    await history.getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByText("Unlinked transaction")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(history).toBeHidden();

    const savedAfterUnlink = await card.locator("p.numeric.maskable").textContent();
    expect(savedAfterUnlink).toBe(savedAfterContribute);
  });

  test("cleanup: archiving the goal removes it from the active list", async ({
    goalsPage: page,
  }) => {
    const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: goalName });
    const archiveItem = page.getByRole("menuitem", { name: "Archive" });
    await clickWhenReady(card.getByRole("button", { name: "Goal actions" }), archiveItem);
    await archiveItem.click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText(`Archived ${goalName}`)).toBeVisible({ timeout: 10_000 });
    await expect(card).toBeHidden();
  });
});
