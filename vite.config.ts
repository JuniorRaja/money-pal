import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  server: { port: 3000 },
  resolve: {
    // Use native tsconfig paths resolution (replaces vite-tsconfig-paths plugin)
    tsconfigPaths: true,
    // React/TanStack must not be duplicated across the SSR and client graphs.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Redirect the bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
    // nitro builds the deployable output; it has nothing to do during `vite dev`.
    // Preset is not hardcoded — CI sets NITRO_PRESET=cloudflare_module (see
    // .github/workflows/deploy.yml and nitro.config.ts for Cloudflare specifics).
    command === "build" ? nitro() : null,
  ],
}));
