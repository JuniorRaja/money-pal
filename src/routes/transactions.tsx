import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Chip, Dot, Panel, Sparkline } from "@/components/mm-ui";
import {
  CURRENT_PERIOD,
  TODAY,
  filterTransactions,
  getAccounts,
  getCategories,
  getLabels,
  listTransactions,
  summariseCashflow,
  type TransactionFilter,
} from "@/data/repository";
import type { Account, Category, Label, Transaction } from "@/data/schema";
import { dayKey, formatDay, formatMoney, formatTime, relativeDayLabel } from "@/lib/money";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Money Mate Financial OS" },
      {
        name: "description",
        content:
          "Every financial event, organised and clear: filter by date, account, category, label and type.",
      },
      { property: "og:title", content: "Transactions — Money Mate" },
      { property: "og:description", content: "Every financial event, organized and clear." },
    ],
  }),
  loader: async () => {
    const [transactions, accounts, categories, labels] = await Promise.all([
      listTransactions(),
      getAccounts(),
      getCategories(),
      getLabels(),
    ]);
    return { transactions, accounts, categories, labels };
  },
  component: TransactionsPage,
});

function TransactionsPage() {
  const { transactions, accounts, categories, labels } = Route.useLoaderData() as {
    transactions: Transaction[];
    accounts: Account[];
    categories: Category[];
    labels: Label[];
  };
  const [filter, setFilter] = useState<TransactionFilter>({ period: CURRENT_PERIOD });
  const [selectedId, setSelectedId] = useState<string | null>("txn_002");

  const rows = useMemo(() => filterTransactions(transactions, filter), [transactions, filter]);
  const summary = summariseCashflow(rows);
  const selected = rows.find((t) => t.id === selectedId) ?? null;

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of rows) {
      const key = dayKey(t.occurred_at);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [rows]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const categoryOf = (id: string) => categories.find((c) => c.id === id);
  const labelOf = (id: string | null) => labels.find((l) => l.id === id);

  return (
    <AppShell
      title="Transactions"
      subtitle="Every financial event, organized and clear."
      signature="transactions"
      searchPlaceholder="Search transactions..."
      actions={
        <>
          <input
            value={filter.search ?? ""}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            placeholder="Search merchant, category, or note..."
            className="h-9 w-[300px] rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-primary/60"
          />
          <Select
            value={filter.period ?? ""}
            onChange={(v) => setFilter({ ...filter, period: v || undefined })}
            options={[
              { value: CURRENT_PERIOD, label: "Date: This Month" },
              { value: "2026-07", label: "Date: Last Month" },
              { value: "", label: "Date: All time" },
            ]}
          />
          <Select
            value={filter.account_id ?? ""}
            onChange={(v) => setFilter({ ...filter, account_id: v || undefined })}
            options={[{ value: "", label: "Account: All" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <Select
            value={filter.category_id ?? ""}
            onChange={(v) => setFilter({ ...filter, category_id: v || undefined })}
            options={[{ value: "", label: "Category: All" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            value={filter.label_id ?? ""}
            onChange={(v) => setFilter({ ...filter, label_id: v || undefined })}
            options={[{ value: "", label: "Label: All" }, ...labels.map((l) => ({ value: l.id, label: l.name }))]}
          />
          <Select
            value={filter.type ?? ""}
            onChange={(v) => setFilter({ ...filter, type: (v || undefined) as TransactionFilter["type"] })}
            options={[
              { value: "", label: "Type: All" },
              { value: "income", label: "Income" },
              { value: "expense", label: "Expense" },
              { value: "transfer", label: "Transfer" },
            ]}
          />
          <div className="ml-auto flex gap-2">
            <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Import
            </button>
            <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]">
              <Plus className="h-3.5 w-3.5" /> Add Transaction
            </button>
          </div>
        </>
      }
    >
      <div className={selected ? "grid grid-cols-[1fr_360px] gap-5" : "grid gap-5"}>
        <div className="space-y-5">
          <Panel bodyClassName="p-0">
            <div className="flex items-center divide-x divide-border">
              <Stat label="Total Transactions" value={String(summary.count)} hint="This month" />
              <Stat label="Total Income" value={formatMoney(summary.income)} tone="success" />
              <Stat label="Total Expenses" value={formatMoney(summary.expense)} tone="destructive" />
              <Stat label="Net Cash Flow" value={formatMoney(summary.net)} tone="success" />
              <div className="flex-1 px-6 py-4">
                <Sparkline points={[12, 18, 14, 22, 19, 26, 21, 28, 24, 30, 27, 33]} width={200} height={44} />
              </div>
            </div>
          </Panel>

          <Panel bodyClassName="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-2 py-3 text-left font-medium">Merchant</th>
                  <th className="px-2 py-3 text-left font-medium">Category</th>
                  <th className="px-2 py-3 text-left font-medium">Account</th>
                  <th className="px-2 py-3 text-left font-medium">Label</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([day, items]) => (
                  <>
                    <tr key={day} className="bg-muted/50">
                      <td colSpan={6} className="px-5 py-2 text-xs">
                        <span className="font-medium text-foreground">{relativeDayLabel(day, TODAY)},</span>{" "}
                        <span className="text-muted-foreground">{formatDay(`${day}T00:00:00`)}</span>
                      </td>
                    </tr>
                    {items.map((t) => {
                      const cat = categoryOf(t.category_id);
                      const lbl = labelOf(t.label_id);
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedId(t.id)}
                          className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40 ${
                            selectedId === t.id ? "bg-accent/50" : ""
                          }`}
                        >
                          <td className="numeric px-5 py-3 text-xs text-muted-foreground">{formatTime(t.occurred_at)}</td>
                          <td className="px-2 py-3">
                            <p className="font-medium text-foreground">{t.merchant}</p>
                            <p className="text-xs text-muted-foreground">{t.descriptor}</p>
                          </td>
                          <td className="px-2 py-3 text-xs text-muted-foreground">{cat?.name}</td>
                          <td className="px-2 py-3 text-xs text-muted-foreground">{accountName(t.account_id)}</td>
                          <td className="px-2 py-3 text-xs text-muted-foreground">
                            {lbl && (
                              <span className="inline-flex items-center gap-1.5">
                                <Dot token={lbl.color_token} /> {lbl.name}
                              </span>
                            )}
                          </td>
                          <td className={`numeric px-5 py-3 text-right ${t.amount > 0 ? "text-success" : "text-destructive"}`}>
                            {formatMoney(t.amount, { sign: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-sm text-muted-foreground">
                      Nothing matches those filters yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>

        {selected && (
          <DetailPanel
            transaction={selected}
            accountName={accountName(selected.account_id)}
            category={categoryOf(selected.category_id)?.name ?? ""}
            label={labelOf(selected.label_id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

function DetailPanel({
  transaction,
  accountName,
  category,
  label,
  onClose,
}: {
  transaction: Transaction;
  accountName: string;
  category: string;
  label?: Label | undefined;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"details" | "notes">("details");
  return (
    <aside className="rise sticky top-6 h-fit rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-sm font-semibold text-primary">
            {transaction.merchant.slice(0, 1)}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{transaction.merchant}</p>
            <p className="text-xs text-muted-foreground">{category}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground transition-colors hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className={`numeric mt-5 text-3xl ${transaction.amount > 0 ? "text-success" : "text-destructive"}`}>
        {formatMoney(transaction.amount, { sign: true })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatTime(transaction.occurred_at)} · {formatDay(transaction.occurred_at)}
      </p>

      <div className="mt-5 flex gap-4 border-b border-border text-sm">
        {(["details", "notes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2 transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {t === "details" ? "Details" : "Notes & Attachments"}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <dl className="mt-4 space-y-3 text-sm">
          <Field label="Account" value={accountName} />
          <Field label="Category" value={category} />
          <Field label="Label" value={label?.name ?? "—"} />
          <Field label="Type" value={transaction.type} />
          <Field label="Payment Method" value={transaction.payment_method} />
          <Field label="Source" value={transaction.source} />
          <Field label="Transaction ID" value={transaction.id.toUpperCase()} />
          <Field label="Confidence" value={`High · ${Math.round(transaction.confidence * 100)}%`} />
        </dl>
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <textarea
            placeholder="Add a note for future you..."
            className="h-28 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary/60"
          />
          <p className="text-xs text-muted-foreground">
            {transaction.attachments} attachment{transaction.attachments === 1 ? "" : "s"} from{" "}
            {transaction.source}.
          </p>
        </div>
      )}
    </aside>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm capitalize text-foreground">{value}</dd>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="px-6 py-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`numeric mt-1 text-xl ${tone ? `text-${tone}` : "text-foreground"}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors hover:bg-accent focus:border-primary/60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export { Chip };
