// Request-scoped Supabase client for SSR reads, backed by cookie sessions.
// Never hoist this to a module-level singleton — a shared server client would
// leak one user's session to another. Call createServerSupabase() fresh per request.
import { createServerOnlyFn } from "@tanstack/react-start";
import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import type { Database } from "./types";
import { createSupabaseFetch } from "./fetch";

export const createServerSupabase = createServerOnlyFn(() => {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env — see README.md.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    // @supabase/ssr defaults to no `secure` flag at all; httpOnly stays false
    // by their design — the browser client reads this same cookie.
    cookieOptions: { secure: process.env["NODE_ENV"] === "production" },
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, options);
        }
      },
    },
  });
});
