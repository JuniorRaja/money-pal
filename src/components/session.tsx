import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { saveProfile, type SaveProfileInput } from "@/data/mutations";
import { getSettings } from "@/data/repository";
import type { ThemePattern, UserSettings } from "@/data/schema";

export interface AppPrefs {
  theme: "light" | "dark";
  reduceMotion: boolean;
  accent: string;
  /** Header artwork family; each has a scene per route. */
  themePattern: ThemePattern;
  roundToNearest: boolean;
  weekStartsOn: "Monday" | "Sunday";
  numberFormat: "indian" | "international";
  assistantTone: "concise" | "detailed";
  assistantContext: boolean;
  /** ISO timestamp of the last time the notification feed was opened. "" = never. */
  timelineSeenAt: string;
  // --- Ephemeral: never persisted, resets on reload. ---
  /** Blurs headline figures (stat cards, balances, hero totals) for shoulder privacy. */
  maskNumbers: boolean;
  sidebar: "expanded" | "collapsed";
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

/**
 * Accent palette. `swatch` is the dot in the picker; `light`/`dark` are what
 * actually land on `--primary` and friends, tuned per mode the same way the
 * base gold is in `styles.css` (dark needs a lighter L to stay readable).
 */
export const ACCENTS = [
  {
    name: "Antique gold",
    swatch: "oklch(0.72 0.11 78)",
    light: "oklch(0.63 0.093 72)",
    dark: "oklch(0.76 0.082 78)",
  },
  {
    name: "Deep teal",
    swatch: "oklch(0.58 0.09 195)",
    light: "oklch(0.55 0.085 195)",
    dark: "oklch(0.72 0.08 195)",
  },
  {
    name: "Ink violet",
    swatch: "oklch(0.55 0.13 300)",
    light: "oklch(0.53 0.12 300)",
    dark: "oklch(0.72 0.105 300)",
  },
  {
    name: "Terracotta",
    swatch: "oklch(0.63 0.13 42)",
    light: "oklch(0.6 0.125 42)",
    dark: "oklch(0.74 0.11 42)",
  },
  {
    name: "Forest",
    swatch: "oklch(0.55 0.1 152)",
    light: "oklch(0.52 0.095 152)",
    dark: "oklch(0.7 0.09 152)",
  },
] as const;

const defaultPrefs: AppPrefs = {
  theme: "light",
  reduceMotion: false,
  accent: ACCENTS[0].name,
  themePattern: "mountain",
  roundToNearest: true,
  weekStartsOn: "Monday",
  numberFormat: "indian",
  assistantTone: "concise",
  assistantContext: true,
  timelineSeenAt: "",
  maskNumbers: false,
  sidebar: "expanded",
};

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Theme and accent only. The profile row is the source of truth for every
 * preference; this cache exists purely so the very first paint is the right
 * colour — reading them from Postgres costs a round trip, and a white flash
 * on every load is worse than two keys in localStorage. The inline script in
 * `__root.tsx` reads this key before React boots.
 */
export const PAINT_CACHE_KEY = "money-pal.appearance";

type PaintCache = Pick<AppPrefs, "theme" | "accent">;

function readPaintCache(): PaintCache | null {
  try {
    const raw = window.localStorage.getItem(PAINT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaintCache>;
    return {
      theme: parsed.theme === "dark" ? "dark" : "light",
      accent: ACCENTS.some((a) => a.name === parsed.accent)
        ? (parsed.accent as string)
        : defaultPrefs.accent,
    };
  } catch {
    return null;
  }
}

/** Paints `--primary` and its ring/sidebar companions for the chosen accent. */
export function applyAccent(root: HTMLElement, accent: string, theme: AppPrefs["theme"]) {
  const chosen = ACCENTS.find((a) => a.name === accent) ?? ACCENTS[0];
  const value = theme === "dark" ? chosen.dark : chosen.light;
  for (const token of ["--primary", "--ring", "--sidebar-primary", "--sidebar-ring"]) {
    root.style.setProperty(token, value);
  }
}

/** Profile row to the subset of prefs the database owns. */
function settingsToPrefs(settings: UserSettings): Partial<AppPrefs> {
  return {
    theme: settings.theme,
    accent: ACCENTS.some((a) => a.name === settings.accent) ? settings.accent : defaultPrefs.accent,
    themePattern: settings.theme_pattern,
    reduceMotion: settings.reduce_motion,
    roundToNearest: settings.round_to_nearest,
    weekStartsOn: settings.week_starts_on,
    numberFormat: settings.number_format,
    assistantTone: settings.assistant_tone,
    assistantContext: settings.assistant_context,
    timelineSeenAt: settings.timeline_seen_at ?? "",
  };
}

/**
 * The inverse, for the write path. `sidebar` and `maskNumbers` are absent by
 * design — both are per-session view state, and a privacy blur that survived
 * a reload would be a surprise rather than a preference.
 */
function prefsToProfilePatch(patch: Partial<AppPrefs>): SaveProfileInput {
  const out: SaveProfileInput = {};
  if (patch.theme !== undefined) out.theme = patch.theme;
  if (patch.accent !== undefined) out.accent = patch.accent;
  if (patch.themePattern !== undefined) out.theme_pattern = patch.themePattern;
  if (patch.reduceMotion !== undefined) out.reduce_motion = patch.reduceMotion;
  if (patch.roundToNearest !== undefined) out.round_to_nearest = patch.roundToNearest;
  if (patch.weekStartsOn !== undefined) out.week_starts_on = patch.weekStartsOn;
  if (patch.numberFormat !== undefined) out.number_format = patch.numberFormat;
  if (patch.assistantTone !== undefined) out.assistant_tone = patch.assistantTone;
  if (patch.assistantContext !== undefined) out.assistant_context = patch.assistantContext;
  if (patch.timelineSeenAt) out.timeline_seen_at = patch.timelineSeenAt;
  return out;
}

const SYNC_DEBOUNCE_MS = 600;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [prefs, setPrefsState] = useState<AppPrefs>(defaultPrefs);
  const pending = useRef<SaveProfileInput>({});
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Catch React up to whatever the pre-hydration script already painted. Done
  // in an effect, not initial state, so SSR and the first client render agree.
  useEffect(() => {
    const cached = readPaintCache();
    if (cached) setPrefsState((prev) => ({ ...prev, ...cached }));
  }, []);

  const userId = session?.user.id ?? null;

  // The profile row wins over the cache once it arrives.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getSettings()
      .then((settings) => {
        if (!cancelled) setPrefsState((prev) => ({ ...prev, ...settingsToPrefs(settings) }));
      })
      .catch((error) => console.warn("[session] could not load profile preferences", error));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const flushPrefs = useCallback(() => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    // Fire and forget: a preference that fails to save is not worth a toast in
    // the middle of an unrelated page, and the next change retries it anyway.
    void saveProfile(patch).catch((error) =>
      console.warn("[session] preference sync failed", error),
    );
  }, []);

  const setPrefs = useCallback(
    (patch: Partial<AppPrefs>) => {
      setPrefsState((prev) => ({ ...prev, ...patch }));
      const profilePatch = prefsToProfilePatch(patch);
      if (!Object.keys(profilePatch).length) return;
      Object.assign(pending.current, profilePatch);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      // Debounced: clicking through five accents should cost one write, not five.
      syncTimer.current = setTimeout(flushPrefs, SYNC_DEBOUNCE_MS);
    },
    [flushPrefs],
  );

  // Do not lose the last toggle to a hard navigation mid-debounce.
  useEffect(() => {
    window.addEventListener("pagehide", flushPrefs);
    return () => {
      window.removeEventListener("pagehide", flushPrefs);
      flushPrefs();
    };
  }, [flushPrefs]);

  // Cache the two paint-critical values for the next load.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PAINT_CACHE_KEY,
        JSON.stringify({ theme: prefs.theme, accent: prefs.accent }),
      );
    } catch {
      /* private mode / quota — the profile row still has it */
    }
  }, [prefs.theme, prefs.accent]);

  // Apply theme, accent and motion preferences to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", prefs.theme === "dark");
    root.classList.toggle("reduce-motion", prefs.reduceMotion);
    root.classList.toggle("mask-numbers", prefs.maskNumbers);
    applyAccent(root, prefs.accent, prefs.theme);
  }, [prefs.theme, prefs.reduceMotion, prefs.maskNumbers, prefs.accent]);

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
      setPrefs,
    }),
    [session, hydrated, authError, handleSignOut, clearAuthError, prefs, setPrefs],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
