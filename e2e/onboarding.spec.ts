import { expect, ensureSignedIn, test } from "./fixtures";

const progressKey = "money-mate.onboarding";

async function authenticatedUserId(
  page: Parameters<typeof ensureSignedIn>[0],
): Promise<string | null> {
  const cookies = await page.context().cookies("http://localhost:3000");
  const roots = new Set(
    cookies
      .map((cookie) => cookie.name.match(/^(sb-.+-auth-token)(?:\.\d+)?$/)?.[1])
      .filter((name): name is string => Boolean(name)),
  );
  for (const root of roots) {
    const value = cookies
      .filter((cookie) => cookie.name === root || cookie.name.startsWith(`${root}.`))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((cookie) => cookie.value)
      .join("");
    try {
      const decoded = decodeURIComponent(value);
      const json = decoded.startsWith("base64-")
        ? Buffer.from(decoded.slice(7), "base64").toString("utf8")
        : decoded;
      const session = JSON.parse(json) as { user?: { id?: string } };
      if (session.user?.id) return session.user.id;
    } catch {
      continue;
    }
  }
  return null;
}

test("account setup resumes on mobile without overflow or undersized controls", async ({
  page,
}) => {
  await ensureSignedIn(page, "/onboarding", async () => {});

  const userId = await authenticatedUserId(page);
  expect(userId).toBeTruthy();
  await page.evaluate(
    ({ key, id }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ userId: id, step: "account", accountKind: "bank" }),
      ),
    { key: progressKey, id: userId },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/onboarding");

  await expect(page.getByRole("heading", { name: "Start with one account" })).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    buttonHeights: [...document.querySelectorAll("button")].map(
      (button) => button.getBoundingClientRect().height,
    ),
  }));
  expect(layout.content).toBeLessThanOrEqual(layout.viewport);
  expect(layout.buttonHeights.every((height) => height >= 44)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/mobile.png", fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: ".impeccable/review/desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Account name").fill("P7 synthetic test account");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Add a statement" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "p7-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Narration,Debit,Credit,Closing Balance\n01/11/2026,UPI-SWIGGY,250,,9750\n02/11/2026,NEFT-SALARY,,1000,10750\n",
    ),
  });
  await expect(page.getByRole("button", { name: "Use this statement" })).toBeVisible();
  await expect(page.getByText(/2 rows/)).toBeVisible();
});
