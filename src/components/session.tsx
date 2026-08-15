import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface AppPrefs {
  theme: "light" | "dark";
  reduceMotion: boolean;
  sidebar: "expanded" | "collapsed";
  accent: string;
  roundToNearest: boolean;
  weekStartsOn: "Monday" | "Sunday";
  numberFormat: "indian" | "international";
  assistantTone: "concise" | "detailed";
  assistantContext: boolean;
  /** Blurs headline figures (stat cards, balances, hero totals) for shoulder privacy. */
  maskNumbers: boolean;
  /** ISO timestamp of the last time the notification feed was opened. "" = never. */
  timelineSeenAt: string;
}

interface SessionValue {
  /** True when a valid Supabase session exists */
  isAuthenticated: boolean;
  /** The Supabase session object (null when signed out) */
  session: Session | null;
  /** The authenticated user (null when signed out) */
  user: User | null;
  /** True once the initial auth state has been determined */
  hydrated: boolean;
  /** Last auth error (e.g., token refresh failure) */
  authError: AuthError | null;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Clear the auth error */
  clearAuthError: () => void;
  /** User preferences */
  prefs: AppPrefs;
  setPrefs: (patch: Partial<AppPrefs>) => void;
}

const defaultPrefs: AppPrefs = {
  theme: "light",
  reduceMotion: false,
  sidebar: "expanded",
  accent: "Antique gold",
  roundToNearest: true,
  weekStartsOn: "Monday",
  numberFormat: "indian",
  assistantTone: "concise",
  assistantContext: true,
  maskNumbers: false,
  timelineSeenAt: "",
};

const SessionContext = createContext<SessionValue | null>(null);

const PREFS_STORAGE_KEY = "money-pal.prefs";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [prefs, setPrefsState] = useState<AppPrefs>(defaultPrefs);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppPrefs>;
        setPrefsState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* first run or invalid JSON */
    }
  }, []);

  // Persist preferences to localStorage
  useEffect(() => {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Apply theme and motion preferences to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", prefs.theme === "dark");
    root.classList.toggle("reduce-motion", prefs.reduceMotion);
    root.classList.toggle("mask-numbers", prefs.maskNumbers);
  }, [prefs.theme, prefs.reduceMotion, prefs.maskNumbers]);

  // Listen to Supabase auth state changes
  useEffect(() => {
    const ensureProfile = async (user: User) => {
      try {
        const { data: existing } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (existing) return;
        await supabase.from("profiles").upsert({
          user_id: user.id,
          email: user.email ?? null,
          display_name: user.email?.split("@")[0] ?? null,
        });
      } catch (err) {
        console.warn("[session] ensureProfile failed", err);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (newSession) {
        setAuthError(null);
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          void ensureProfile(newSession.user);
        }
      }

      if (event === "SIGNED_OUT") {
        setSession(null);
      } else if (event === "TOKEN_REFRESHED") {
        setSession(newSession);
        setAuthError(null);
      } else if (newSession) {
        setSession(newSession);
      }

      if (event === "INITIAL_SESSION") {
        setHydrated(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Periodically check session validity and handle token refresh errors
  useEffect(() => {
    if (!session) return;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[session] Token refresh failed:", error.message);
        setAuthError(error);
        // If the session is truly invalid, sign out
        if (error.message.includes("expired") || error.message.includes("invalid")) {
          setSession(null);
        }
      } else if (!data.session && session) {
        // Session was invalidated server-side
        setSession(null);
      }
    };

    // Check session every 5 minutes
    const interval = setInterval(checkSession, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [session]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      isAuthenticated: Boolean(session),
      session,
      user: session?.user ?? null,
      hydrated,
      authError,
      signOut: handleSignOut,
      clearAuthError,
      prefs,
      setPrefs: (patch) => setPrefsState((p) => ({ ...p, ...patch })),
    }),
    [session, hydrated, authError, handleSignOut, clearAuthError, prefs],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
