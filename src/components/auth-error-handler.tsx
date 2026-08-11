/**
 * Global auth error handler.
 *
 * Shows a toast when auth errors occur (token refresh failure, session expiry)
 * and redirects to login when the session becomes invalid.
 */
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSession } from "@/components/session";

export function AuthErrorHandler() {
  const { authError, isAuthenticated, hydrated, clearAuthError } = useSession();
  const navigate = useNavigate();

  // Show toast on auth error
  useEffect(() => {
    if (!authError) return;

    const message = authError.message || "Your session has expired.";

    toast.error("Authentication Error", {
      description: message,
      action: {
        label: "Sign in",
        onClick: () => {
          clearAuthError();
          navigate({ to: "/login" });
        },
      },
      duration: 10000,
    });
  }, [authError, clearAuthError, navigate]);

  // Redirect to login when session becomes invalid after being authenticated
  useEffect(() => {
    if (!hydrated) return;

    // If we have an auth error and no session, redirect to login
    if (authError && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [authError, isAuthenticated, hydrated, navigate]);

  return null;
}
