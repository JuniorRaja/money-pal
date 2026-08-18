import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import appCss from "../styles.css?url";
import { ACCENTS, PAINT_CACHE_KEY, SessionProvider } from "../components/session";
import { AuthErrorHandler } from "../components/auth-error-handler";
import { Toaster } from "../components/ui/sonner";
import { isAuthError } from "../data/live";
import { supabase } from "../integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const authExpired = isAuthError(error);

  // Full reload (not router.navigate) so this works even when the error boundary
  // renders outside SessionProvider, e.g. an error thrown during SSR.
  useEffect(() => {
    if (!authExpired) return;
    void supabase.auth.signOut().finally(() => {
      window.location.href = "/login";
    });
  }, [authExpired]);

  if (authExpired) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Money Pal — Personal Finance OS" },
      {
        name: "description",
        content:
          "Money Pal is a premium personal finance workspace: accounts, transactions, budgets, goals, investments and an AI assistant.",
      },
      { property: "og:title", content: "Money Pal — Personal Finance OS" },
      {
        property: "og:description",
        content: "Accounts, budgets, goals and an AI assistant in one calm financial workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Runs before React hydrates, so a dark-theme user never sees a white flash.
 * The accent map is generated from `ACCENTS` rather than restated, so the two
 * cannot drift; everything else about preferences comes from the profile row.
 */
const PAINT_CACHE_SCRIPT = `(function(){try{
var c=JSON.parse(localStorage.getItem(${JSON.stringify(PAINT_CACHE_KEY)})||"{}");
var dark=c.theme==="dark";
var root=document.documentElement;
if(dark)root.classList.add("dark");
var m=${JSON.stringify(Object.fromEntries(ACCENTS.map((a) => [a.name, [a.light, a.dark]])))};
var v=(m[c.accent]||m[${JSON.stringify(ACCENTS[0].name)}])[dark?1:0];
["--primary","--ring","--sidebar-primary","--sidebar-ring"].forEach(function(t){root.style.setProperty(t,v);});
}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    // PAINT_CACHE_SCRIPT sets the theme class and accent variables on <html>
    // before hydration, which React would otherwise report as a server/client
    // attribute mismatch it cannot patch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: PAINT_CACHE_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AuthErrorHandler />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="bottom-right" />
      </SessionProvider>
    </QueryClientProvider>
  );
}
