import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { Signature } from "@/components/signature";
import { useSession } from "@/components/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Money Pal" },
      {
        name: "description",
        content: "Sign in to your Money Pal account to access your personal finance dashboard.",
      },
      { property: "og:title", content: "Sign in — Money Pal" },
      { property: "og:description", content: "Access your personal finance dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { isAuthenticated, hydrated } = useSession();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, hydrated, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
    }
    // On success, onAuthStateChange in SessionProvider will update state and redirect
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
    } else {
      setMessage("Check your email for a confirmation link to complete sign up.");
    }
  }

  function switchMode(newMode: "signin" | "signup") {
    setMode(newMode);
    setError(null);
    setMessage(null);
  }

  // Show nothing until we know auth state to avoid flash
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-w-[1180px]">
      <div className="flex w-[46%] flex-col justify-center px-24">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="h-9 w-9 text-primary" aria-hidden="true">
            <path
              d="M6 32 V10 L20 26 L34 10 V32"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="20" cy="8" r="2" fill="currentColor" />
          </svg>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">money-pal</p>
            <p className="text-[11px] text-muted-foreground">Financial OS</p>
          </div>
        </div>

        {mode === "signin" ? (
          <form onSubmit={handleSignIn} className="rise mt-14 max-w-[420px]">
            <h1 className="text-[44px] leading-tight">Welcome back.</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Sign in to your account to access your ledger.
            </p>

            <label className="mt-10 block text-sm text-foreground" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-primary/60"
            />

            <label className="mt-4 block text-sm text-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-primary/60"
            />

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {message && <p className="mt-3 text-sm text-green-600">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-transform duration-200 hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Sign in
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="rise mt-14 max-w-[420px]">
            <h1 className="text-[44px] leading-tight">Create account.</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Sign up to start tracking your finances with Money Pal.
            </p>

            <label className="mt-10 block text-sm text-foreground" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-primary/60"
            />

            <label className="mt-4 block text-sm text-foreground" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-primary/60"
            />

            <label className="mt-4 block text-sm text-foreground" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••"
              className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-primary/60"
            />

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {message && <p className="mt-3 text-sm text-green-600">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-transform duration-200 hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Create account
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>

      <div className="relative isolate flex w-[54%] flex-col justify-end overflow-hidden bg-accent/60 p-12">
        <Signature variant="login" />
        <div className="relative border-t border-border/60 pt-6 text-xs text-muted-foreground">
          <p>Money Pal 1.0.0 · Secure cloud sync</p>
          <p className="mt-1">Powered by Supabase</p>
        </div>
      </div>
    </div>
  );
}
