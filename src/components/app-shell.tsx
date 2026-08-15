import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Bell,
  BarChart3,
  Bot,
  CircleDollarSign,
  CreditCard,
  Download,
  Flag,
  Gauge,
  LayoutGrid,
  LineChart,
  LineChart as LineChartIcon,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Target,
  Wallet,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AddRecordDialog, type RecordKind } from "@/components/add-record-dialog";
import { Signature, type SignatureKey } from "@/components/signature";
import { useSession } from "@/components/session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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

const addItems: { kind: RecordKind; label: string; icon: typeof Wallet }[] = [
  { kind: "transaction", label: "Transaction", icon: ArrowLeftRight },
  { kind: "account", label: "Account", icon: Wallet },
  { kind: "goal", label: "Goal", icon: Target },
  { kind: "budget", label: "Budget", icon: CreditCard },
  { kind: "investment", label: "Investment", icon: LineChartIcon },
];

function Sidebar({
  onAdd,
  className,
  onNavigate,
}: {
  onAdd: (kind: RecordKind) => void;
  className?: string;
  /** Fires on any nav click so the mobile drawer can close itself. */
  onNavigate?: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { prefs, signOut, user } = useSession();
  const navigate = useNavigate();
  // The drawer is always full-width; only the docked sidebar collapses.
  const collapsed = prefs.sidebar === "collapsed" && !onNavigate;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300",
        collapsed ? "w-[76px]" : "w-[248px]",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-5 py-6">
        <Monogram />
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              money-pal
            </p>
            <p className="text-[11px] text-muted-foreground">Financial OS</p>
          </div>
        )}
      </div>

      <div className={cn("pb-5", collapsed ? "px-4" : "px-4")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Add new"
              className={cn(
                "group flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]",
                collapsed ? "w-10" : "w-full",
              )}
            >
              {!collapsed && <span>Add new</span>}
              <Plus className="h-4 w-4 transition-transform group-data-[state=open]:rotate-45" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {addItems.map((item) => (
              <DropdownMenuItem key={item.kind} onSelect={() => onAdd(item.kind)}>
                <item.icon className="mr-2 h-4 w-4 text-primary" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
                const active =
                  item.to === "/"
                    ? path === "/"
                    : path === item.to || path.startsWith(`${item.to}/`);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      title={item.label}
                      onClick={onNavigate}
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
        onClick={async () => {
          await signOut();
          navigate({ to: "/login" });
        }}
        className="m-3 flex items-center gap-3 rounded-lg border border-sidebar-border px-3 py-2.5 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {user?.email?.charAt(0).toUpperCase() || "U"}
        </span>
        {!collapsed && (
          <span className="flex-1 leading-tight">
            <span className="block text-[13px] font-medium">
              {user?.email?.split("@")[0] || "User"}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {user?.email || "Not signed in"}
            </span>
          </span>
        )}
        {!collapsed && <LogOut className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </aside>
  );
}

function TopBar({ searchPlaceholder }: { searchPlaceholder: string }) {
  const { prefs, setPrefs } = useSession();
  return (
    <div className="flex items-center gap-3">
      {/* Search, the assistant label, and notifications are the first things to
          go on a phone — the theme toggle is the only one worth its width. */}
      <label className="hidden h-10 w-[320px] items-center gap-2 rounded-full border border-border bg-card/80 px-4 text-sm text-muted-foreground shadow-sm backdrop-blur transition-colors focus-within:border-primary/50 xl:flex">
        <Search className="h-4 w-4" />
        <input
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder={searchPlaceholder}
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </label>
      <Link
        to="/assistant"
        className="flex h-10 items-center gap-2 rounded-full border border-primary/30 bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/60 hover:bg-accent sm:px-4"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">Ask Money Pal</span>
      </Link>
      <button className="relative hidden h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground sm:flex">
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
  const { isAuthenticated, hydrated } = useSession();
  const navigate = useNavigate();
  const [addKind, setAddKind] = useState<RecordKind | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !isAuthenticated) navigate({ to: "/login" });
  }, [isAuthenticated, hydrated, navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AddRecordDialog kind={addKind} onOpenChange={(open) => !open && setAddKind(null)} />
      <Sidebar onAdd={setAddKind} className="hidden lg:flex" />

      {/* Below lg the sidebar would eat the whole viewport, so it becomes a drawer. */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[248px] p-0 sm:max-w-[248px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            onAdd={(kind) => {
              setNavOpen(false);
              setAddKind(kind);
            }}
            onNavigate={() => setNavOpen(false)}
            className="h-full w-full border-r-0"
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative isolate shrink-0 overflow-hidden border-b border-border/70 bg-gradient-to-b from-accent/50 to-background px-4 pb-5 pt-5 sm:px-10 sm:pb-6 sm:pt-6">
          <Signature variant={signature} />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setNavOpen(true)}
                className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="text-[28px] leading-none text-foreground sm:text-[38px]">{title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <TopBar searchPlaceholder={searchPlaceholder} />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-10">
          {actions && (
            <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur sm:-mx-10 sm:px-10">
              {actions}
            </div>
          )}
          <div className={actions ? "" : "pt-8"}>{children}</div>
          <footer className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground">
            Money Pal
          </footer>
        </main>
      </div>
    </div>
  );
}
