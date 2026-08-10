import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, CreditCard, Landmark, PlusCircle, TrendingUp, Wallet } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Panel, Ring, Sparkline, StatCard } from "@/components/mm-ui";
import { getAccounts, summariseNetWorth } from "@/data/repository";
import type { Account } from "@/data/schema";
import { formatMoney, formatPct } from "@/lib/money";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Money Pal Financial OS" },
      {
        name: "description",
        content:
          "Every bank account, card, investment and loan you hold, with balances, utilisation and trends.",
      },
      { property: "og:title", content: "Accounts — Money Pal" },
      { property: "og:description", content: "Everything you own, owe, and keep aside — in one place." },
    ],
  }),
  loader: async () => ({ accounts: await getAccounts() }),
  component: AccountsPage,
});

function AccountsPage() {
  const { accounts } = Route.useLoaderData() as { accounts: Account[] };
  const nw = summariseNetWorth(accounts);
  const banks = accounts.filter((a) => a.kind === "bank" || a.kind === "cash");
  const cards = accounts.filter((a) => a.kind === "credit_card");
  const investments = accounts.filter((a) => a.kind === "investment");
  const loans = accounts.filter((a) => a.kind === "loan");

  return (
    <AppShell
      title="Accounts"
      subtitle="Everything you own, owe, and keep aside — in one place."
      signature="accounts"
    >
      <div className="grid grid-cols-4 gap-5">
        <StatCard label="Total across accounts" value={formatMoney(nw.net_worth, { whole: true })} delta={12.5} hint="vs last month" icon={<Briefcase className="h-4 w-4" />} className="pattern-weave" />
        <StatCard label="Available cash" value={formatMoney(nw.cash, { whole: true })} delta={18.4} hint="vs last month" icon={<Wallet className="h-4 w-4" />} className="pattern-arcs" />
        <StatCard label="Investments" value={formatMoney(nw.investments, { whole: true })} delta={14.7} hint="vs last month" icon={<TrendingUp className="h-4 w-4" />} className="pattern-hatch" />
        <StatCard label="Liabilities" value={formatMoney(nw.liabilities, { whole: true })} delta={-6.2} hint="paid down" icon={<Landmark className="h-4 w-4" />} className="pattern-steps" />
      </div>

      <Group title="Cash & Bank Accounts" count={banks.length} icon={<Landmark className="h-4 w-4 text-primary" />}>
        {banks.map((a) => (
          <div key={a.id} className="card-lift grain pattern-arcs rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.institution}</p>
              </div>
              {a.is_primary && (
                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">
                  Primary
                </span>
              )}
            </div>
            <p className="numeric mt-4 text-2xl text-foreground">{formatMoney(a.balance, { whole: true })}</p>
            <div className="mt-3 flex items-end justify-between">
              <span className={`text-xs ${a.change_pct >= 0 ? "text-success" : "text-destructive"}`}>
                {formatPct(a.change_pct, 0)} vs last month
              </span>
              <Sparkline points={a.trend} width={92} height={28} tone={a.change_pct >= 0 ? "success" : "destructive"} />
            </div>
          </div>
        ))}
      </Group>

      <Group title="Credit Cards" count={cards.length} icon={<CreditCard className="h-4 w-4 text-primary" />}>
        {cards.map((a) => {
          const used = Math.abs(a.balance);
          const util = a.credit_limit ? (used / a.credit_limit) * 100 : 0;
          return (
            <div key={a.id} className="card-lift grain ledger-pattern rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.institution}</p>
                </div>
                <Ring value={util} size={52} label={`${util.toFixed(1)}%`} tone={util > 40 ? "destructive" : "primary"} />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Outstanding</p>
                  <p className="numeric text-2xl text-foreground">{formatMoney(used, { whole: true })}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Limit</p>
                  <p className="numeric text-sm text-muted-foreground">
                    {formatMoney(a.credit_limit ?? 0, { whole: true })}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Due 12 Aug 2026</p>
                <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform hover:scale-[1.03]">
                  Pay Now
                </button>
              </div>
            </div>
          );
        })}
      </Group>

      <Group title="Investments" count={investments.length} icon={<TrendingUp className="h-4 w-4 text-primary" />}>
        {investments.map((a) => (
          <div key={a.id} className="card-lift grain pattern-hatch rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">{a.name}</p>
            <p className="text-xs text-muted-foreground">{a.institution}</p>
            <p className="numeric mt-4 text-2xl text-foreground">{formatMoney(a.balance, { whole: true })}</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-xs text-success">{formatPct(a.change_pct)} vs last month</span>
              <Sparkline points={a.trend} width={92} height={28} />
            </div>
          </div>
        ))}
      </Group>

      <Group title="Loans" count={loans.length} icon={<Landmark className="h-4 w-4 text-primary" />}>
        {loans.map((a) => (
          <div key={a.id} className="card-lift grain pattern-steps rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">{a.name}</p>
            <p className="text-xs text-muted-foreground">{a.institution}</p>
            <p className="numeric mt-4 text-2xl text-foreground">{formatMoney(Math.abs(a.balance), { whole: true })}</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-xs text-success">{formatPct(a.change_pct)} outstanding</span>
              <Sparkline points={a.trend} width={92} height={28} tone="primary" />
            </div>
          </div>
        ))}
        <button className="flex min-h-[150px] items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
          <PlusCircle className="h-4 w-4" /> Add account
        </button>
      </Group>
    </AppShell>
  );
}

function Group({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel
      className="mt-6"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
            {icon}
          </span>
          {title}
        </span>
      }
      action={<span className="text-xs text-muted-foreground">{count} accounts</span>}
    >
      <div className="grid grid-cols-4 gap-5">{children}</div>
    </Panel>
  );
}

