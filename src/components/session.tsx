import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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
}

interface SessionValue {
  unlocked: boolean;
  unlock: () => void;
  lock: () => void;
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
};

const SessionContext = createContext<SessionValue | null>(null);

const STORAGE_KEY = "money-mate.session";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [prefs, setPrefsState] = useState<AppPrefs>(defaultPrefs);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { unlocked?: boolean; prefs?: Partial<AppPrefs> };
        if (parsed.unlocked) setUnlocked(true);
        if (parsed.prefs) setPrefsState({ ...defaultPrefs, ...parsed.prefs });
      }
    } catch {
      /* first run */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked, prefs }));
  }, [unlocked, prefs, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.classList.toggle("dark", prefs.theme === "dark");
    root.classList.toggle("reduce-motion", prefs.reduceMotion);
  }, [prefs.theme, prefs.reduceMotion, hydrated]);

  const value = useMemo<SessionValue>(
    () => ({
      unlocked,
      unlock: () => setUnlocked(true),
      lock: () => setUnlocked(false),
      prefs,
      setPrefs: (patch) => setPrefsState((p) => ({ ...p, ...patch })),
    }),
    [unlocked, prefs],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
