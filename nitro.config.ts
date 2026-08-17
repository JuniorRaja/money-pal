import { fileURLToPath } from "node:url";

import { defineConfig } from "nitro";

// Cloudflare-only settings — the `cloudflare` key is inert on any other preset,
// so this doesn't reintroduce the hardcoding vite.config.ts's nitro() dropped.
// The preset itself is pinned via NITRO_PRESET=cloudflare_module in CI.
export default defineConfig({
  // Minimum required for Workers Static Assets (serves the client bundle).
  compatibilityDate: "2024-09-19",

  // Tasks are still experimental in Nitro 3 — this flag is what registers them.
  experimental: { tasks: true },

  // Registered by path rather than left to directory scanning: the Vite/Start
  // setup does not put tasks/ where Nitro's scanner looks by default.
  //
  // Absolute, because Nitro writes this string straight into its virtual tasks
  // module — a relative path is resolved against that virtual module rather than
  // this file, and the bundler cannot find it.
  tasks: {
    "prices:refresh": {
      handler: fileURLToPath(new URL("./tasks/prices.ts", import.meta.url)),
      description: "P3-4 daily market price refresh",
    },
  },

  // 19:00 UTC = 00:30 IST — after NSE close and after AMFI publishes NAVs
  // (~23:00 IST). Nitro turns this into a Cloudflare Cron Trigger in the
  // generated wrangler config at build time; no manual wrangler setup.
  scheduledTasks: { "0 19 * * *": "prices:refresh" },
  cloudflare: {
    deployConfig: true,
    wrangler: {
      name: "money-pal",
      // Non-secret runtime config. SUPABASE_SERVICE_ROLE_KEY and the AI provider
      // keys are real secrets — pushed separately via `wrangler secret put` in
      // the deploy workflow, never written into wrangler.json.
      vars: {
        SUPABASE_URL: process.env["SUPABASE_URL"] ?? "",
        SUPABASE_PUBLISHABLE_KEY: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "",
        SUPABASE_PROJECT_ID: process.env["SUPABASE_PROJECT_ID"] ?? "",
      },
    },
  },
});
