/**
 * Server-side auth guard for route protection.
 *
 * Use `requireAuth` in `beforeLoad` to redirect unauthenticated users server-side,
 * preventing any app shell markup from reaching the browser before redirect.
 *
 * This uses `getClaims()` to verify the JWT server-side, not `getSession()` which
 * only checks local state on the browser.
 */
import { redirect } from "@tanstack/react-router";
import { createServerSupabase } from "@/integrations/supabase/server";

/**
 * Checks authentication server-side and throws a redirect to /login if not authenticated.
 * Call this in `beforeLoad` on any route that requires auth.
 *
 * @example
 * ```ts
 * export const Route = createFileRoute("/dashboard")({
 *   beforeLoad: requireAuth,
 *   loader: async () => { ... },
 *   component: DashboardPage,
 * });
 * ```
 */
export async function requireAuth(): Promise<void> {
  // Only run on the server — browser-side checks happen in SessionProvider
  if (typeof window !== "undefined") return;

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims?.sub) {
      throw redirect({ to: "/login", replace: true });
    }
  } catch (err) {
    // If it's already a redirect, rethrow it
    if (err && typeof err === "object" && "to" in err) {
      throw err;
    }
    // Any other error means we can't verify auth, so redirect to login
    console.error("[auth-guard] Failed to verify auth:", err);
    throw redirect({ to: "/login", replace: true });
  }
}

/**
 * Returns the authenticated user ID, or null if not authenticated.
 * Useful for optional auth checks in loaders.
 */
export async function getAuthUserId(): Promise<string | null> {
  if (typeof window !== "undefined") return null;

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims?.sub) {
      return null;
    }

    return data.claims.sub as string;
  } catch {
    return null;
  }
}
