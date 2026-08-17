import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-guard";
import {
  Briefcase,
  CreditCard,
  Landmark,
  MoreVertical,
  Pencil,
  PlusCircle,
  Scissors,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { ManageCyclesDialog } from "@/components/manage-cycles-dialog";
import { ManageSlicesDialog } from "@/components/manage-slices-dialog";
import { MaskedText } from "@/components/masked-text";
import { Panel, Ring, SliceBar, Sparkline, StatCard } from "@/components/mm-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  allocationFor,
  getAccounts,
  getCreditCardCycles,
  getSlices,
  summariseNetWorth,
  summariseOwnership,
} from "@/data/repository";
import type { Account, CreditCardCycle, Slice } from "@/data/schema";
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
      {
        property: "og:description",
        content: "Everything you own, owe, and keep aside — in one place.",
      },
    ],
  }),
  beforeLoad: requireAuth,
  loader: async () => {
    const [accounts, slices, cycles] = await Promise.all([
      getAccounts(),
      getSlices(),
      getCreditCardCycles(),
    ]);
    return { accounts, slices, cycles };
  },
  component: AccountsPage,
});

function AccountsPage() {
  const { accounts, slices, cycles } = Route.useLoaderData() as {
    accounts: Account[];
    slices: Slice[];
    cycles: CreditCardCycle[];
  };
  const [manage, setManage] = useState<Account | null>(null);
  const [cyclesFor, setCyclesFor] = useState<Account | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const nw = summariseNetWorth(accounts);
  const sliceable = accounts.filter((a) => a.kind === "bank" || a.kind === "cash");
  const ownership = summariseOwnership(
    accounts,
    sliceable.map((a) => allocationFor(a, slices)),
  );
  const banks = accounts.filter((a) => a.kind === "bank" || a.kind === "cash");
  const cards = accounts.filter((a) => a.kind === "credit_card");
  const investments = accounts.filter((a) => a.kind === "investment");
  const loans = accounts.filter((a) => a.kind === "loan");

  const currentByAccount = useMemo(() => {
    const map = new Map<string, CreditCardCycle>();
    for (const c of cycles) {
      if (c.is_current) map.set(c.account_id, c);
    }
    return map;
  }, [cycles]);

  return (
    <AppShell
      title="Accounts"
      subtitle="Everything you own, owe, and keep aside — in one place."
      signature="accounts"
    >
      {/* TODO: Calculate real month-over-month change percentages for ownership, cash, investments, liabilities */}
      <div className="grid grid-cols-4 gap-5">
        <StatCard
          label="Yours after custodial"
          value={formatMoney(ownership.owned, { whole: true })}
          hint={`${formatMoney(ownership.custodial, { whole: true })} held for others`}
          icon={<Briefcase className="h-4 w-4" />}
          className="pattern-weave"
        />
        <StatCard
          label="Available cash"
          value={formatMoney(nw.cash, { whole: true })}
          icon={<Wallet className="h-4 w-4" />}
          className="pattern-arcs"
        />
        <StatCard
          label="Investments"
          value={formatMoney(nw.investments, { whole: true })}
          icon={<TrendingUp className="h-4 w-4" />}
          className="pattern-hatch"
        />
        <StatCard
          label="Liabilities"
          value={formatMoney(nw.liabilities, { whole: true })}
          icon={<Landmark className="h-4 w-4" />}
          className="pattern-steps"
        />
      </div>

      <Group
        title="Cash & Bank Accounts"
        count={banks.length}
        icon={<Landmark className="h-4 w-4 text-primary" />}
      >
        {banks.map((a) => (
          <div
            key={a.id}
            className="card-lift grain pattern-arcs rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.institution}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {a.is_primary && (
                  <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Primary
                  </span>
                )}
                <AccountMenu onEdit={() => setEditing(a)} onDelete={() => setDeleting(a)} />
              </div>
            </div>
            <p className="numeric maskable mt-4 text-2xl text-foreground">
              <MaskedText>{formatMoney(a.balance, { whole: true })}</MaskedText>
            </p>
            <div className="mt-3 flex items-end justify-between">
              <span
                className={`text-xs ${a.change_pct >= 0 ? "text-success" : "text-destructive"}`}
              >
                {formatPct(a.change_pct, 0)} vs last month
              </span>
              <Sparkline
                points={a.trend}
                width={92}
                height={28}
                tone={a.change_pct >= 0 ? "success" : "destructive"}
              />
            </div>
            <AccountSlices account={a} slices={slices} onManage={() => setManage(a)} />
          </div>
        ))}
      </Group>

      <Group
        title="Credit Cards"
        count={cards.length}
        icon={<CreditCard className="h-4 w-4 text-primary" />}
      >
        {cards.map((a) => {
          const used = a.used_amount ?? Math.abs(a.balance);
          const util = a.credit_limit ? (used / a.credit_limit) * 100 : 0;
          const current = currentByAccount.get(a.id);
          return (
            <div
              key={a.id}
              className="card-lift grain ledger-pattern rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.institution}</p>
                </div>
                <div className="flex items-center gap-2">
                  <AccountMenu
                    onEdit={() => setEditing(a)}
                    onDelete={() => setDeleting(a)}
                    onCycles={() => setCyclesFor(a)}
                  />
                  <Ring
                    value={util}
                    size={52}
                    label={`${util.toFixed(1)}%`}
                    tone={util > 40 ? "destructive" : "primary"}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Used
                  </p>
                  <p className="numeric maskable text-2xl text-foreground">
                    <MaskedText>{formatMoney(used, { whole: true })}</MaskedText>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Limit
                  </p>
                  <p className="numeric text-sm text-muted-foreground">
                    {formatMoney(a.credit_limit ?? 0, { whole: true })}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {current ? (
                    <>
                      Due {current.due_date}
                      <span className="mx-1">·</span>
                      Min {formatMoney(current.minimum_due, { whole: true })}
                    </>
                  ) : a.due_day ? (
                    <>
                      Due day {a.due_day} · Bill day {a.bill_generation_day ?? "—"}
                    </>
                  ) : (
                    <>No cycle yet</>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCyclesFor(a)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform hover:scale-[1.03]"
                >
                  Cycles
                </button>
              </div>
            </div>
          );
        })}
      </Group>

      <Group
        title="Investments"
        count={investments.length}
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
      >
        {investments.map((a) => (
          <div
            key={a.id}
            className="card-lift grain pattern-hatch rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.institution}</p>
              </div>
              <AccountMenu onEdit={() => setEditing(a)} onDelete={() => setDeleting(a)} />
            </div>
            <p className="numeric maskable mt-4 text-2xl text-foreground">
              <MaskedText>{formatMoney(a.balance, { whole: true })}</MaskedText>
            </p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-xs text-success">{formatPct(a.change_pct)} vs last month</span>
              <Sparkline points={a.trend} width={92} height={28} />
            </div>
          </div>
        ))}
      </Group>

      <Group
        title="Loans"
        count={loans.length}
        icon={<Landmark className="h-4 w-4 text-primary" />}
      >
        {loans.map((a) => (
          <div
            key={a.id}
            className="card-lift grain pattern-steps rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.lender || a.institution}
                  {a.interest_rate_bps !== null && (
                    <> · {(a.interest_rate_bps / 100).toFixed(2)}% p.a.</>
                  )}
                </p>
              </div>
              <AccountMenu onEdit={() => setEditing(a)} onDelete={() => setDeleting(a)} />
            </div>
            <p className="numeric maskable mt-4 text-2xl text-foreground">
              <MaskedText>{formatMoney(Math.abs(a.balance), { whole: true })}</MaskedText>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p>EMI {a.emi_amount !== null ? formatMoney(a.emi_amount, { whole: true }) : "—"}</p>
              <p className="text-right">
                Tenure {a.tenure_months !== null ? `${a.tenure_months} mo` : "—"}
              </p>
            </div>
          </div>
        ))}
        <button className="flex min-h-[150px] items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
          <PlusCircle className="h-4 w-4" /> Add account
        </button>
      </Group>

      <ManageSlicesDialog
        account={manage}
        slices={slices}
        open={manage !== null}
        onOpenChange={(next) => !next && setManage(null)}
      />
      <ManageCyclesDialog
        account={cyclesFor}
        open={cyclesFor !== null}
        onOpenChange={(next) => !next && setCyclesFor(null)}
      />
      <EditAccountDialog
        account={editing}
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
      />
      <DeleteAccountDialog
        account={deleting}
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
      />
    </AppShell>
  );
}

/** Slice breakdown strip shown inside a bank, cash or investment card. */
function AccountSlices({
  account,
  slices,
  onManage,
}: {
  account: Account;
  slices: Slice[];
  onManage: () => void;
}) {
  const rows = slices.filter((s) => s.account_id === account.id);
  const allocation = allocationFor(account, slices);
  return (
    <div className="mt-4 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Slices · {rows.length}
        </p>
        <button
          onClick={onManage}
          className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
        >
          <Scissors className="h-3 w-3" /> Manage
        </button>
      </div>
      <SliceBar
        slices={rows}
        unallocated={allocation.unallocated}
        balance={account.balance}
        format={(v) => formatMoney(v, { whole: true })}
      />
    </div>
  );
}

/** Dropdown menu with Edit and Archive actions for an account card. */
function AccountMenu({
  onEdit,
  onDelete,
  onCycles,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onCycles?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Account actions</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onEdit} className="gap-2">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </DropdownMenuItem>
        {onCycles && (
          <DropdownMenuItem onClick={onCycles} className="gap-2">
            <CreditCard className="h-3.5 w-3.5" /> Cycles
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
