/**
 * Hook that redirects unauthenticated users to /login.
 *
 * Use this in any component or route that requires authentication.
 * Returns the auth state so callers can show loading states.
 */
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/components/session";

export interface UseRequireAuthOptions {
  /** Where to redirect if not authenticated. Defaults to "/login" */
  redirectTo?: string;
}

export interface UseRequireAuthResult {
  /** True when a valid Supabase session exists */
  isAuthenticated: boolean;
  /** True once the initial auth state has been determined */
  isLoading: boolean;
  /** The authenticated user's ID, or null */
  userId: string | null;
  /** The authenticated user's email, or null */
  userEmail: string | null;
}

export function useRequireAuth(options: UseRequireAuthOptions = {}): UseRequireAuthResult {
  const { redirectTo = "/login" } = options;
  const { isAuthenticated, hydrated, user } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    // Wait until we know the auth state
    if (!hydrated) return;

    // Redirect if not authenticated
    if (!isAuthenticated) {
      navigate({ to: redirectTo });
    }
  }, [isAuthenticated, hydrated, navigate, redirectTo]);

  return {
    isAuthenticated,
    isLoading: !hydrated,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
  };
}
