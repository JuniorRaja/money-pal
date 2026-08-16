import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    // Values may be quoted in .env; the quotes are delimiters, not part of the value.
    const value = trimmed.slice(eq + 1).replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Playwright configuration for Money Pal E2E tests.
 *
 * `webServer` below starts (or reuses) the dev server on port 3000.
 */
export default defineConfig({
  testDir: "./e2e",
  // Every spec shares one live Supabase test account (TESTING_USERID) — two
  // spec files mutating transactions/net-worth concurrently produces false
  // failures (a slice's "owned" total shifting mid-assertion because another
  // worker committed a transaction). Force serial execution everywhere, not
  // just CI, until specs get per-file account isolation.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
