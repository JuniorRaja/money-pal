import { defineConfig } from "nitro";

// Cloudflare-only settings — the `cloudflare` key is inert on any other preset,
// so this doesn't reintroduce the hardcoding vite.config.ts's nitro() dropped.
// The preset itself is pinned via NITRO_PRESET=cloudflare_module in CI.
export default defineConfig({
  // Minimum required for Workers Static Assets (serves the client bundle).
  compatibilityDate: "2024-09-19",
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
