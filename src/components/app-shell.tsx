import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Bell,
  BarChart3,
  Bot,
  ChevronRight,
  CircleDollarSign,
  Download,
  Flag,
  Gauge,
  LayoutGrid,
  LineChart,
  Lock,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Wallet,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Signature, type SignatureKey } from "@/components/signature";
import { useSession } from "@/components/session";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Money",
    items: [
      { to: "/", label: "Overview", icon: LayoutGrid },
      { to: "/accounts", label: "Accounts", icon: Wallet },
      { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { to: "/timeline", label: "Timeline", icon: Gauge },
    ],
  },
  {
    label: "Plan",
    items: [
      { to: "/budgets", label: "Budgets", icon: CircleDollarSign },
      { to: "/goals", label: "Goals", icon: Flag },
      { to: "/investments", label: "Investments", icon: LineChart },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Workshop",
    items: [
      { to: "/assistant", label: "AI Assistant", icon: Bot },
      { to: "/imports", label: "Import Center", icon: Download },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
] as const;

function Monogram() {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8 text-primary" aria-hidden="true">
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
  );
}

function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { prefs, lock } = useSession();
  const navigate = useNavigate();
  const collapsed = prefs.sidebar === "collapsed";

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <div className="flex items-center gap-3 px-5 py-6">
        <Monogram />
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-sidebar-foreground">money-mate</p>
            <p className="text-[11px] text-muted-foreground">Financial OS</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-6 px-3">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group.label}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = path === item.to;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      title={item.label}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary transition-all duration-300",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <button
        onClick={() => {
          lock();
          navigate({ to: "/login" });
        }}
        className="m-3 flex items-center gap-3 rounded-lg border border-sidebar-border px-3 py-2.5 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          PR
        </span>
        {!collapsed && (
          <span className="flex-1 leading-tight">
            <span className="block text-[13px] font-medium">PR</span>
            <span className="block text-[11px] text-muted-foreground">pr@finos.local</span>
          </span>
        )}
        {!collapsed && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </aside>
  );
}

function TopBar({ searchPlaceholder }: { searchPlaceholder: string }) {
  const { prefs, setPrefs } = useSession();
  return (
    <div className="flex items-center gap-3">
      <label className="flex h-10 w-[320px] items-center gap-2 rounded-full border border-border bg-card/80 px-4 text-sm text-muted-foreground shadow-sm backdrop-blur transition-colors focus-within:border-primary/50">
        <Search className="h-4 w-4" />
        <input
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder={searchPlaceholder}
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </label>
      <Link
        to="/assistant"
        className="flex h-10 items-center gap-2 rounded-full border border-primary/30 bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/60 hover:bg-accent"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        Ask Money Mate
      </Link>
      <button className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground">
        <Bell className="h-4 w-4" />
        <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary" />
      </button>
      <button
        onClick={() => setPrefs({ theme: prefs.theme === "dark" ? "light" : "dark" })}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Toggle theme"
      >
        {prefs.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}

export interface PageProps {
  title: string;
  subtitle: string;
  signature: SignatureKey;
  searchPlaceholder?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  title,
  subtitle,
  signature,
  searchPlaceholder = "Search accounts, transactions...",
  actions,
  children,
}: PageProps) {
  const { unlocked, hydrated } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !unlocked) navigate({ to: "/login" });
  }, [unlocked, hydrated, navigate]);

  return (
    <div className="flex h-screen min-w-[1180px] overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative isolate shrink-0 overflow-hidden border-b border-border/70 bg-gradient-to-b from-accent/50 to-background px-10 pb-6 pt-6">
          <Signature variant={signature} />
          <div className="relative flex items-start justify-between gap-6">
            <div>
              <h1 className="text-[38px] leading-none text-foreground">{title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <TopBar searchPlaceholder={searchPlaceholder} />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-10 pb-8">
          {actions && (
            <div className="sticky top-0 z-20 -mx-10 mb-6 flex flex-wrap items-center gap-3 border-b border-border/70 bg-background/90 px-10 py-3 backdrop-blur">
              {actions}
            </div>
          )}
          <div className={actions ? "" : "pt-8"}>{children}</div>
          <footer className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground">
            Money Mate 0.9.4
            <ChevronRight className="h-3 w-3" />
            Demo ledger, pinned to 07 Aug 2026
          </footer>
        </main>
      </div>
    </div>
  );
}

