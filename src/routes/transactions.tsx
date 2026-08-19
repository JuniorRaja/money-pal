import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-guard";
import {
  CircleDot,
  CreditCard,
  Edit,
  FileText,
  MoreHorizontal,
  SmartphoneNfc,
  StickyNote,
  Tag,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { MaskedText } from "@/components/masked-text";
import { Chip, Dot, Panel, Sparkline } from "@/components/mm-ui";
import { TransactionsSkeleton } from "@/components/route-skeletons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CURRENT_PERIOD,
  TODAY,
  filterTransactions,
  getAccounts,
  getCategories,
  getLabels,
  groupTransactionsForDisplay,
  listTransactions,
  summariseCashflow,
  type TransactionFilter,
} from "@/data/repository";
import { deleteTransaction, updateTransaction } from "@/data/mutations";
import type { Account, Category, Label, Transaction, TransactionType } from "@/data/schema";
import { dayKey, formatDay, formatMoney, formatTime, relativeDayLabel } from "@/lib/money";
import { shiftPeriod } from "@/lib/period";

type TransactionsSearch = { q?: string; period?: string };

export const Route = createFileRoute("/transactions")({
  // `q` is how the command palette hands free text to this page's search box.
  // `period` ("YYYY-MM" or the "all" sentinel) scopes the loader's fetch to one
  // month; absent = current month.
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => {
    const q = typeof search["q"] === "string" ? search["q"].trim() : "";
    const p = typeof search["period"] === "string" ? search["period"] : "";
    const period = /^\d{4}-\d{2}$/.test(p) || p === "all" ? p : undefined;
    return { ...(q ? { q } : {}), ...(period ? { period } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Transactions — Money Pal Financial OS" },
      {
        name: "description",
        content:
          "Every financial event, organised and clear: filter by date, account, category, label and type.",
      },
      { property: "og:title", content: "Transactions — Money Pal" },
      { property: "og:description", content: "Every financial event, organized and clear." },
    ],
  }),
  beforeLoad: requireAuth,
  loaderDeps: ({ search }) => ({ period: search.period, q: search.q }),
  loader: async ({ deps }) => {
    // Scope the DB fetch to the selected month (default: current). Search and
    // the "all" sentinel need every month, so they fetch unscoped.
    const period = deps.q || deps.period === "all" ? undefined : (deps.period ?? CURRENT_PERIOD);
    const [transactions, accounts, categories, labels] = await Promise.all([
      listTransactions({ period }),
      getAccounts(),
      getCategories(),
      getLabels(),
    ]);
    return { transactions, accounts, categories, labels };
  },
  pendingComponent: TransactionsSkeleton,
  pendingMs: 200,
  pendingMinMs: 500,
  component: TransactionsPage,
});

function TransactionsPage() {
  const router = useRouter();
  const { transactions, accounts, categories, labels } = Route.useLoaderData() as {
    transactions: Transaction[];
    accounts: Account[];
    categories: Category[];
    labels: Label[];
  };
  const navigate = useNavigate({ from: "/transactions" });
  const { q, period } = Route.useSearch();
  // Period is URL-driven and scopes the fetch; `filter` holds the client-side
  // refinements applied to whatever month the loader returned.
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [sliceNameFilter, setSliceNameFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Arriving with ?q= searches all time — a month window would hide most hits.
  useEffect(() => {
    if (q) setFilter({ search: q });
  }, [q]);

  // Slice options: if account is selected, show only that account's slices
  // Otherwise show all slices with "Account - Name" format
  const sliceOptions = useMemo(() => {
    if (filter.account_id) {
      // Account selected: show just that account's slice names
      const accountLabels = labels.filter((l) => l.account_id === filter.account_id);
      return accountLabels.map((l) => ({ value: l.id, label: l.name }));
    }
    // No account selected: show all slices with account prefix
    return labels.map((l) => {
      const acc = accounts.find((a) => a.id === l.account_id);
      const accName = acc?.name ?? "Unknown";
      return { value: l.id, label: `${accName} - ${l.name}` };
    });
  }, [labels, accounts, filter.account_id]);

  // Reset slice filter when account changes and current slice isn't in new options
  useEffect(() => {
    if (sliceNameFilter && !sliceOptions.some((opt) => opt.value === sliceNameFilter)) {
      setSliceNameFilter("");
    }
  }, [sliceOptions, sliceNameFilter]);

  const rows = useMemo(() => {
    let filtered = filterTransactions(transactions, filter);
    // Apply slice filter by label ID
    if (sliceNameFilter) {
      filtered = filtered.filter((t) => t.label_id === sliceNameFilter);
    }
    return groupTransactionsForDisplay(filtered);
  }, [transactions, filter, sliceNameFilter]);
  const summary = summariseCashflow(rows);
  const selected = rows.find((t) => t.transaction_id === selectedId) ?? null;

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
  const accountLabel = (t: Transaction) => {
    if (t.type !== "transfer" || !t.counterparty_account_id) return accountName(t.account_id);
    // Always render From → To regardless of which leg we display.
    if (t.amount < 0)
      return `${accountName(t.account_id)} → ${accountName(t.counterparty_account_id)}`;
    return `${accountName(t.counterparty_account_id)} → ${accountName(t.account_id)}`;
  };

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
            value={period ?? CURRENT_PERIOD}
            onChange={(v) =>
              navigate({
                search: { ...(q ? { q } : {}), ...(v === CURRENT_PERIOD ? {} : { period: v }) },
              })
            }
            options={[
              { value: CURRENT_PERIOD, label: "Date: This Month" },
              { value: shiftPeriod(CURRENT_PERIOD, -1), label: "Date: Last Month" },
              { value: "all", label: "Date: All time" },
            ]}
          />
          <Select
            value={filter.account_id ?? ""}
            onChange={(v) => setFilter({ ...filter, account_id: v || undefined })}
            options={[
              { value: "", label: "Account: All" },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
          <Select
            value={filter.category_id ?? ""}
            onChange={(v) => setFilter({ ...filter, category_id: v || undefined })}
            options={[
              { value: "", label: "Category: All" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            value={sliceNameFilter}
            onChange={(v) => setSliceNameFilter(v)}
            options={[{ value: "", label: "Slice: All" }, ...sliceOptions]}
          />
          <Select
            value={filter.type ?? ""}
            onChange={(v) =>
              setFilter({ ...filter, type: (v || undefined) as TransactionFilter["type"] })
            }
            options={[
              { value: "", label: "Type: All" },
              { value: "income", label: "Income" },
              { value: "expense", label: "Expense" },
              { value: "transfer", label: "Transfer" },
            ]}
          />
        </>
      }
    >
      <div className={selected ? "grid grid-cols-[minmax(0,1fr)_360px] gap-5" : "grid gap-5"}>
        <div className="min-w-0 space-y-5">
          <Panel bodyClassName="p-0">
            <div className="flex items-center divide-x divide-border">
              <Stat label="Total Transactions" value={String(summary.count)} hint="This month" />
              <Stat label="Total Income" value={formatMoney(summary.income)} tone="success" />
              <Stat
                label="Total Expenses"
                value={formatMoney(summary.expense)}
                tone="destructive"
              />
              <Stat label="Net Cash Flow" value={formatMoney(summary.net)} tone="success" />
              <div className="flex-1 px-6 py-4">
                <Sparkline
                  points={[12, 18, 14, 22, 19, 26, 21, 28, 24, 30, 27, 33]}
                  width={200}
                  height={44}
                />
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
                  <th className="px-2 py-3 text-left font-medium">Slice</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([day, items]) => (
                  <Fragment key={day}>
                    <tr className="bg-muted/50">
                      <td colSpan={6} className="px-5 py-2 text-xs">
                        <span className="font-medium text-foreground">
                          {relativeDayLabel(day, TODAY)},
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {formatDay(`${day}T00:00:00`)}
                        </span>
                      </td>
                    </tr>
                    {items.map((t) => {
                      const cat = categoryOf(t.category_id);
                      const lbl = labelOf(t.label_id);
                      return (
                        <tr
                          key={t.transaction_id}
                          onClick={() => setSelectedId(t.transaction_id)}
                          className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40 ${selectedId === t.transaction_id ? "bg-accent/50" : ""
                            }`}
                        >
                          <td className="numeric px-5 py-3 text-xs text-muted-foreground">
                            {formatTime(t.occurred_at)}
                          </td>
                          <td className="px-2 py-3">
                            <p className="font-medium text-foreground">{t.merchant}</p>
                            <p className="text-xs text-muted-foreground">{t.descriptor}</p>
                          </td>
                          <td className="px-2 py-3 text-xs text-muted-foreground">{cat?.name}</td>
                          <td className="px-2 py-3 text-xs text-muted-foreground">
                            {accountLabel(t)}
                          </td>
                          <td className="px-2 py-3 text-xs text-muted-foreground">
                            {lbl && (
                              <span className="inline-flex items-center gap-1.5">
                                <Dot token={lbl.color_token} /> {lbl.name}
                              </span>
                            )}
                          </td>
                          <td
                            className={`numeric px-5 py-3 text-right ${t.amount > 0 ? "text-success" : "text-destructive"}`}
                          >
                            {formatMoney(t.amount, { sign: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-16 text-center text-sm text-muted-foreground"
                    >
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
            key={selected.transaction_id}
            transaction={selected}
            accountName={accountLabel(selected)}
            category={categoryOf(selected.category_id)?.name ?? ""}
            label={labelOf(selected.label_id)}
            labels={labels}
            categories={categories}
            accounts={accounts}
            onClose={() => setSelectedId(null)}
            onUpdated={async () => {
              await router.invalidate();
            }}
            onDeleted={() => setSelectedId(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// DETAIL PANEL (side menu)
// =============================================================================

function DetailPanel({
  transaction,
  accountName,
  category,
  label,
  labels,
  categories,
  accounts,
  onClose,
  onUpdated,
  onDeleted,
}: {
  transaction: Transaction;
  accountName: string;
  category: string;
  label?: Label | undefined;
  labels: Label[];
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<"details" | "notes">("details");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [noteValue, setNoteValue] = useState(transaction.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Sync note when the transaction data refreshes (after router.invalidate)
  // The key={selected.id} handles transaction *switching*, this handles *same* transaction data update
  useMemo(() => {
    setNoteValue(transaction.note ?? "");
  }, [transaction.note]);

  // Filter labels to only those belonging to the same account (slices)
  const accountLabels = useMemo(
    () => labels.filter((l) => l.account_id === transaction.account_id),
    [labels, transaction.account_id],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    const ok = await deleteTransaction(transaction.id, transaction.transaction_id);
    if (ok) {
      toast.success("Transaction deleted");
      setDeleteOpen(false);
      onDeleted();
      await onUpdated();
    } else {
      setDeleting(false);
      setDeleteOpen(false);
      toast.error("Failed to delete transaction");
    }
  }, [transaction.id, transaction.transaction_id, onDeleted, onUpdated]);

  const handleLabelChange = useCallback(
    async (labelId: string | null) => {
      try {
        await updateTransaction(
          { id: transaction.id, transaction_id: transaction.transaction_id, label_id: labelId },
          transaction,
        );
        toast.success("Slice updated");
        setLabelOpen(false);
        onUpdated();
      } catch {
        toast.error("Failed to update slice");
      }
    },
    [transaction, onUpdated],
  );

  const handleNoteSave = useCallback(async () => {
    if (noteValue === (transaction.note ?? "")) return;
    setSavingNote(true);
    try {
      await updateTransaction(
        { id: transaction.id, transaction_id: transaction.transaction_id, note: noteValue || null },
        transaction,
      );
      toast.success("Note saved");
      onUpdated();
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }, [noteValue, transaction, onUpdated]);

  const focusNotes = () => {
    setTab("notes");
    setTimeout(() => noteRef.current?.focus(), 100);
  };

  return (
    <>
      <aside className="rise sticky top-6 h-fit rounded-2xl border border-border bg-card p-5">
        {/* Header */}
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
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Amount */}
        <p
          className={`numeric maskable mt-5 text-3xl ${transaction.amount > 0 ? "text-success" : "text-destructive"}`}
        >
          <MaskedText>{formatMoney(transaction.amount, { sign: true })}</MaskedText>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatTime(transaction.occurred_at)} · {formatDay(transaction.occurred_at)}
        </p>

        {/* Metadata rows */}
        <dl className="mt-5 space-y-3 text-sm">
          <DetailRow icon={<CircleDot className="h-3.5 w-3.5" />} label="Slice">
            {label ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Dot token={label.color_token} /> {label.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Unallocated</span>
            )}
          </DetailRow>
          <DetailRow icon={<Timer className="h-3.5 w-3.5" />} label="Type">
            <span className="text-sm font-medium capitalize text-primary">{transaction.type}</span>
          </DetailRow>
          <DetailRow icon={<CreditCard className="h-3.5 w-3.5" />} label="Account">
            <span className="text-sm text-foreground">{accountName}</span>
          </DetailRow>
          <DetailRow icon={<SmartphoneNfc className="h-3.5 w-3.5" />} label="Source">
            <span className="text-sm text-foreground">{transaction.source}</span>
          </DetailRow>
          <DetailRow icon={<FileText className="h-3.5 w-3.5" />} label="Transaction ID">
            <span className="text-sm font-mono text-foreground">
              {transaction.transaction_id.slice(0, 12).toUpperCase()}
            </span>
          </DetailRow>
        </dl>

        {/* Actions section */}
        <div className="mt-6">
          <p className="text-xs font-medium text-muted-foreground">Actions</p>
          <div className="mt-2 flex items-center gap-2">
            <ActionButton
              icon={<Edit className="h-4 w-4" />}
              label="Edit"
              onClick={() => setEditOpen(true)}
            />
            <Popover open={labelOpen} onOpenChange={setLabelOpen}>
              <PopoverTrigger asChild>
                <button className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <Tag className="h-4 w-4" />
                  <span className="text-[10px]">Change Slice</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Pick a slice</p>
                <button
                  onClick={() => handleLabelChange(null)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
                >
                  Unallocated
                </button>
                {accountLabels.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => handleLabelChange(l.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${l.id === transaction.label_id ? "bg-accent/60 font-medium" : ""
                      }`}
                  >
                    <Dot token={l.color_token} /> {l.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <ActionButton
              icon={<StickyNote className="h-4 w-4" />}
              label="Add Note"
              onClick={focusNotes}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="text-[10px]">More</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Transaction
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Notes section */}
        {tab === "notes" && (
          <div className="mt-5 space-y-2">
            <textarea
              ref={noteRef}
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              onBlur={handleNoteSave}
              placeholder="Add a note for future you..."
              className="h-24 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary/60"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {transaction.attachments} attachment{transaction.attachments === 1 ? "" : "s"}
              </p>
              {savingNote && <p className="text-[11px] text-muted-foreground">Saving...</p>}
            </div>
          </div>
        )}

        {tab === "details" && (
          <button
            onClick={focusNotes}
            className="mt-3 w-full text-left text-xs text-primary hover:underline"
          >
            {transaction.note ? "View note \u2192" : "Add a note \u2192"}
          </button>
        )}
      </aside>

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        transaction={transaction}
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categories}
        accounts={accounts}
        labels={labels}
        onUpdated={onUpdated}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the transaction for {transaction.merchant} (
              {formatMoney(Math.abs(transaction.amount), { sign: transaction.type !== "transfer" })}
              ).
              {transaction.type === "transfer" ? " Both transfer legs will be removed." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground ring-offset-background transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {deleting ? "Deleting\u2026" : "Delete"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================================
// EDIT TRANSACTION DIALOG
// =============================================================================

const fieldBase =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary";

function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
  categories,
  accounts,
  labels,
  onUpdated,
}: {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  accounts: Account[];
  labels: Label[];
  onUpdated: () => void;
}) {
  const [merchant, setMerchant] = useState(transaction.merchant);
  const [descriptor, setDescriptor] = useState(transaction.descriptor);
  const [amount, setAmount] = useState(String(Math.abs(transaction.amount) / 100));
  const [type, setType] = useState<TransactionType>(transaction.type);
  const [accountId, setAccountId] = useState(transaction.account_id);
  const [toAccountId, setToAccountId] = useState(transaction.counterparty_account_id ?? "");
  const [categoryId, setCategoryId] = useState(transaction.category_id);
  const [labelId, setLabelId] = useState(transaction.label_id ?? "");
  const [toLabelId, setToLabelId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(transaction.payment_method);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMerchant(transaction.merchant);
    setDescriptor(transaction.descriptor);
    setAmount(String(Math.abs(transaction.amount) / 100));
    setType(transaction.type);
    setAccountId(transaction.account_id);
    setToAccountId(transaction.counterparty_account_id ?? "");
    setCategoryId(transaction.category_id);
    setLabelId(transaction.label_id ?? "");
    setToLabelId("");
    setPaymentMethod(transaction.payment_method);
    setError(null);
  }, [open, transaction]);

  const accountLabelsForEdit = useMemo(
    () => labels.filter((l) => l.account_id === accountId),
    [labels, accountId],
  );
  const toAccountLabelsForEdit = useMemo(
    () => labels.filter((l) => l.account_id === toAccountId),
    [labels, toAccountId],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant.trim()) return setError("Merchant is required");
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return setError("Enter a valid amount");
    if (type === "transfer") {
      if (!toAccountId) return setError("Pick a destination account");
      if (toAccountId === accountId) return setError("Transfer accounts must differ");
    }

    setSaving(true);
    setError(null);
    try {
      await updateTransaction(
        {
          id: transaction.id,
          transaction_id: transaction.transaction_id,
          merchant: merchant.trim(),
          descriptor: descriptor.trim() || merchant.trim(),
          amount: Math.round(parsedAmount * 100),
          type,
          account_id: accountId,
          to_account_id: type === "transfer" ? toAccountId : null,
          category_id: categoryId,
          label_id: labelId || null,
          to_label_id: type === "transfer" ? toLabelId || null : null,
          payment_method: paymentMethod,
        },
        transaction,
      );
      toast.success("Transaction updated");
      onOpenChange(false);
      onUpdated();
    } catch {
      toast.error("Failed to update transaction");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>Update the details of this transaction.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Merchant</label>
            <input
              className={fieldBase}
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input
              className={fieldBase}
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <input
                className={fieldBase}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                className={fieldBase}
                value={type}
                onChange={(e) => {
                  const next = e.target.value as TransactionType;
                  setType(next);
                  if (next !== "transfer") {
                    setToAccountId("");
                    setToLabelId("");
                  }
                }}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {type === "transfer" ? "From account" : "Account"}
            </label>
            <select
              className={fieldBase}
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setLabelId("");
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {type === "transfer" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">To account</label>
              <select
                className={fieldBase}
                value={toAccountId}
                onChange={(e) => {
                  setToAccountId(e.target.value);
                  setToLabelId("");
                }}
              >
                <option value="">Select account</option>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <select
              className={fieldBase}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {type === "transfer" ? "From slice" : "Slice"}
            </label>
            <select
              className={fieldBase}
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
            >
              <option value="">Unallocated</option>
              {accountLabelsForEdit.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          {type === "transfer" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">To slice</label>
              <select
                className={fieldBase}
                value={toLabelId}
                onChange={(e) => setToLabelId(e.target.value)}
              >
                <option value="">Unallocated</option>
                {toAccountLabelsForEdit.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
            <input
              className={fieldBase}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter className="pt-2">
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {saving ? "Saving\u2026" : "Save Changes"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="px-6 py-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`numeric maskable mt-1 text-xl ${tone ? `text-${tone}` : "text-foreground"}`}>
        <MaskedText>{value}</MaskedText>
      </p>
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
