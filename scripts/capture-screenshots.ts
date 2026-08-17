/**
 * Playwright script to capture screenshots for user documentation.
 *
 * Run with: npm run screenshots
 * Or directly: npx playwright test scripts/capture-screenshots.ts --project=chromium
 *
 * Requirements:
 * - Set TESTING_USERID and TESTING_PASSWORD in .env
 * - Demo account should have seeded data for realistic screenshots
 *
 * Output:
 * - Screenshots saved to docs/img/
 * - Re-run after UI changes to keep docs current
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "../e2e/fixtures";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const DOCS_IMG_DIR = join(process.cwd(), "docs", "img");

/** Pages to capture with their paths and screenshot names */
const pages = [
  { path: "/", name: "overview", title: "Overview", wait: "h1" },
  { path: "/accounts", name: "accounts", title: "Accounts", wait: "h1" },
  { path: "/transactions", name: "transactions", title: "Transactions", wait: "table" },
  { path: "/budgets", name: "budgets", title: "Budgets", wait: "h1" },
  { path: "/goals", name: "goals", title: "Goals", wait: "h1" },
  { path: "/imports", name: "imports", title: "Import Center", wait: "h1" },
  { path: "/timeline", name: "timeline", title: "Timeline", wait: "h1" },
  { path: "/investments", name: "investments", title: "Investments", wait: "h1" },
  { path: "/settings", name: "settings", title: "Settings", wait: "h1" },
] as const;

test.describe("Documentation Screenshots", () => {
  test.beforeAll(async () => {
    await mkdir(DOCS_IMG_DIR, { recursive: true });
  });

  test("capture login page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: join(DOCS_IMG_DIR, "login.png"),
      fullPage: false,
    });
    console.log("Captured: login.png");
  });

  test("capture all pages", async ({ page }) => {
    // Set viewport for consistent screenshots
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const p of pages) {
      // Sign in and navigate to page
      await ensureSignedIn(page, p.path, async (pg) => {
        // Wait for the main content to be visible
        await pg.waitForLoadState("networkidle");
        await pg.waitForSelector(p.wait, { timeout: 15_000 });
        // Give charts and animations time to render
        await pg.waitForTimeout(800);
      });

      // Wait a bit more for any lazy-loaded content
      await page.waitForTimeout(500);

      // Take screenshot
      await page.screenshot({
        path: join(DOCS_IMG_DIR, `${p.name}.png`),
        fullPage: false,
      });

      console.log(`Captured: ${p.name}.png`);
    }
  });

  test("capture slices dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await ensureSignedIn(page, "/accounts", async (pg) => {
      await pg.waitForLoadState("networkidle");
      await pg.waitForSelector("h1", { timeout: 15_000 });
    });

    // Find an account card's menu button (three dots)
    const menuButton = page.locator('button[aria-haspopup="menu"]').first();
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(200);

      // Click "Manage slices" option
      const slicesOption = page.getByRole("menuitem", { name: /slice/i });
      if (await slicesOption.isVisible()) {
        await slicesOption.click();
        await page.waitForTimeout(300);

        await page.screenshot({
          path: join(DOCS_IMG_DIR, "slices-dialog.png"),
          fullPage: false,
        });
        console.log("Captured: slices-dialog.png");
      }
    }
  });

  test("capture transaction detail", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await ensureSignedIn(page, "/transactions", async (pg) => {
      await pg.waitForSelector("table", { timeout: 15_000 });
    });

    // Click on the first transaction row to open detail panel
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: join(DOCS_IMG_DIR, "transaction-detail.png"),
        fullPage: false,
      });
      console.log("Captured: transaction-detail.png");
    }
  });

  test("capture add transaction dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await ensureSignedIn(page, "/transactions", async (pg) => {
      await pg.waitForSelector("table", { timeout: 15_000 });
    });

    // Click the add button (usually has a + icon)
    const addButton = page.locator('button:has-text("Add"), button:has-text("New"), [aria-label*="add" i]').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(DOCS_IMG_DIR, "add-transaction.png"),
        fullPage: false,
      });
      console.log("Captured: add-transaction.png");
    }
  });

  test("capture import wizard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await ensureSignedIn(page, "/imports", async (pg) => {
      await pg.waitForSelector("h1", { timeout: 15_000 });
    });

    // Look for the import button
    const importButton = page.locator('button:has-text("Import"), button:has-text("Upload")').first();
    if (await importButton.isVisible()) {
      await importButton.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(DOCS_IMG_DIR, "import-wizard.png"),
        fullPage: false,
      });
      console.log("Captured: import-wizard.png");
    }
  });

  test("capture budget edit", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await ensureSignedIn(page, "/budgets", async (pg) => {
      await pg.waitForSelector("h1", { timeout: 15_000 });
    });

    // Look for add/edit budget button
    const addButton = page.locator('button:has-text("Add"), button:has-text("Budget")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(DOCS_IMG_DIR, "budget-edit.png"),
        fullPage: false,
      });
      console.log("Captured: budget-edit.png");
    }
  });

  test("capture goal progress", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await ensureSignedIn(page, "/goals", async (pg) => {
      await pg.waitForSelector("h1", { timeout: 15_000 });
    });

    // Click on a goal card if available
    const goalCard = page.locator('[class*="goal"], [data-testid*="goal"]').first();
    if (await goalCard.isVisible()) {
      await goalCard.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(DOCS_IMG_DIR, "goal-detail.png"),
        fullPage: false,
      });
      console.log("Captured: goal-detail.png");
    }
  });
});
