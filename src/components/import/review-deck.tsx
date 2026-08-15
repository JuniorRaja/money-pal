import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { Category, ImportJobRow, ImportRule } from "@/data/schema";
import { IMPORT_LOW_CONFIDENCE_MAX } from "@/data/schema";
import { commitImportRow, holdImportRow, reopenImportRow, skipImportRow } from "@/data/mutations";
import { midnightIst, resolveSuggestedCategoryId } from "@/lib/import";
import { dayKey, formatDay, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type StampKind = "accepted" | "skipped" | "held";

const fieldBase =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60";

function Seal({ kind }: { kind: StampKind }) {
  const label = kind === "accepted" ? "Accepted" : kind === "skipped" ? "Skipped" : "Held";
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-5 top-8 rotate-[-18deg] rounded-sm border-[3px] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.22em]",
        kind === "accepted" && "border-success text-success",
        kind === "skipped" && "border-destructive text-destructive",
        kind === "held" && "border-primary text-primary",
      )}
    >
      {label}
    </div>
  );
}

function PeekFace({
  row,
  categories,
}: {
  row: ImportJobRow;
  categories: Category[];
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {formatDay(row.occurred_at)}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {row.merchant || row.descriptor || "Imported row"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {categoryName(categories, row.suggested_category_id)}
        </p>
      </div>
      <p className="numeric shrink-0 text-base text-foreground">
        {formatMoney(row.type === "income" ? row.amount_paise : -row.amount_paise, { sign: true })}
      </p>
    </div>
  );
}

type EditState = {
  occurred_on: string;
  merchant: string;
  descriptor: string;
  amount: string;
  type: "income" | "expense";
  category_id: string;
};

function paiseToRupees(paise: number): string {
  return (Math.abs(paise) / 100).toFixed(2);
}

function rupeesToPaise(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function categoryName(categories: Category[], id: string | null): string {
  if (!id) return "Uncategorised";
  return categories.find((category) => category.id === id)?.name ?? "Uncategorised";
}

export function ReviewDeck({
  rows,
  categories,
  rules,
  focusId,
  onDone,
}: {
  rows: ImportJobRow[];
  categories: Category[];
  rules: ImportRule[];
  focusId?: string | undefined;
  onDone: () => void;
}) {
  const [queue, setQueue] = useState(() => {
    if (!focusId) return rows;
    const hit = rows.find((row) => row.id === focusId);
    if (!hit) return rows;
    return [hit, ...rows.filter((row) => row.id !== focusId)];
  });
  const [heldAway, setHeldAway] = useState<Set<string>>(() => new Set());
  const [history, setHistory] = useState<Array<{ row: ImportJobRow; stamp: StampKind }>>([]);
  const [flying, setFlying] = useState<{ row: ImportJobRow; stamp: StampKind } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [pointerId, setPointerId] = useState<number | null>(null);
  const startX = useRef(0);

  const visible = useMemo(() => {
    const pending = queue.filter((row) => row.status === "pending");
    const held = queue.filter((row) => row.status === "held" && !heldAway.has(row.id));
    return [...pending, ...held];
  }, [heldAway, queue]);

  const current = visible[0] ?? null;
  const remaining = visible.length;
  const peek = visible.slice(1, 4);

  const suggestedId = current
    ? resolveSuggestedCategoryId({
        merchant: current.merchant,
        suggestedCategoryId: current.suggested_category_id,
        categories,
        rules,
        accountId: current.account_id,
      })
    : null;

  const [edit, setEdit] = useState<EditState | null>(null);

  useEffect(() => {
    if (!current) {
      setEdit(null);
      setEditing(false);
      return;
    }
    const id = resolveSuggestedCategoryId({
      merchant: current.merchant,
      suggestedCategoryId: current.suggested_category_id,
      categories,
      rules,
      accountId: current.account_id,
    });
    setEdit({
      occurred_on: dayKey(current.occurred_at),
      merchant: current.merchant,
      descriptor: current.descriptor,
      amount: paiseToRupees(current.amount_paise),
      type: current.type,
      category_id: id ?? "",
    });
    setEditing(false);
    setDragX(0);
  }, [categories, current, rules]);

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const stampThen = useCallback(
    async (stamp: StampKind, work: () => Promise<void>) => {
      if (!current) return;
      setFlying({ row: current, stamp });
      try {
        // Run the request alongside the card animation, not after it.
        await Promise.all([work(), new Promise((resolve) => window.setTimeout(resolve, 420))]);
        setHistory((prev) => [...prev, { row: current, stamp }]);
      } finally {
        // Without this the card stays hidden behind a stuck ghost on any failure.
        setFlying(null);
      }
    },
    [current],
  );

  const accept = useCallback(async () => {
    if (!current || busy || !edit) return;
    const amount = rupeesToPaise(edit.amount);
    if (amount == null) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    const originalCategory = suggestedId;
    const nextCategory = edit.category_id || null;
    const categoryChanged = nextCategory !== originalCategory && Boolean(nextCategory);
    setBusy(true);
    try {
      await stampThen("accepted", async () => {
        await commitImportRow({
          row_id: current.id,
          patch: {
            occurred_at: midnightIst(edit.occurred_on),
            merchant: edit.merchant.trim() || null,
            descriptor: edit.descriptor.trim() || null,
            amount_paise: amount,
            type: edit.type,
            suggested_category_id: nextCategory,
          },
          ...(categoryChanged && edit.merchant.trim() && nextCategory
            ? {
                rule: {
                  match: edit.merchant.trim(),
                  category_id: nextCategory,
                  account_id: current.account_id,
                },
              }
            : {}),
        });
        remove(current.id);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept this row");
    } finally {
      setBusy(false);
    }
  }, [busy, current, edit, remove, stampThen, suggestedId]);

  const skip = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await stampThen("skipped", async () => {
        await skipImportRow(current.id);
        remove(current.id);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not skip this row");
    } finally {
      setBusy(false);
    }
  }, [busy, current, remove, stampThen]);

  const hold = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await stampThen("held", async () => {
        if (current.status !== "held") await holdImportRow(current.id);
        setHeldAway((prev) => new Set(prev).add(current.id));
        setQueue((prev) =>
          prev.map((row) => (row.id === current.id ? { ...row, status: "held" as const } : row)),
        );
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not hold this row");
    } finally {
      setBusy(false);
    }
  }, [busy, current, stampThen]);

  const goBack = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    if (last.stamp === "accepted") {
      toast.message("Already on the ledger", {
        description: "Accepted rows stay posted. Skip or hold can be undone.",
      });
      return;
    }
    setBusy(true);
    try {
      if (last.stamp === "skipped") await reopenImportRow(last.row.id);
      if (last.stamp === "held") {
        await reopenImportRow(last.row.id);
        setHeldAway((prev) => {
          const next = new Set(prev);
          next.delete(last.row.id);
          return next;
        });
      }
      setQueue((prev) => {
        const rest = prev.filter((row) => row.id !== last.row.id);
        return [{ ...last.row, status: "pending" }, ...rest];
      });
      setHistory((prev) => prev.slice(0, -1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not go back");
    } finally {
      setBusy(false);
    }
  }, [busy, history]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
        if (event.key === "Escape") {
          setEditing(false);
        }
        return;
      }
      if (event.key === "Escape") {
        onDone();
        return;
      }
      // Enter already fires the focused button's own click — don't accept as well.
      if (event.key === "Enter" && target?.tagName === "BUTTON") return;
      if (!current || busy) return;
      if (event.key === "a" || event.key === "A" || event.key === "Enter") {
        event.preventDefault();
        void accept();
      } else if (event.key === "s" || event.key === "S" || event.key === "ArrowLeft") {
        event.preventDefault();
        void skip();
      } else if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        void hold();
      } else if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        setEditing(true);
      } else       if (event.key === "ArrowRight") {
        event.preventDefault();
        void accept();
      } else if (event.key === "b" || event.key === "B" || event.key === "ArrowDown") {
        event.preventDefault();
        void goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accept, busy, current, goBack, hold, onDone, skip]);

  if (!current) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">Caught up for now</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Held rows stay in Needs your eye on the Import Center.
        </p>
        <button
          onClick={onDone}
          className="mt-5 h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Back to Import Center
        </button>
      </div>
    );
  }

  const swipeHint = dragX > 48 ? "Accept" : dragX < -48 ? "Skip" : null;
  const flyDir = flying?.stamp === "skipped" ? -1 : 1;

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="mb-3 text-center text-xs text-muted-foreground">{remaining} left in this job</p>

      <div className="relative mx-auto min-h-[200px] w-full max-w-md">
        {peek
          .slice()
          .reverse()
          .map((row, reverseIndex) => {
            const depth = peek.length - reverseIndex;
            return (
              <div
                key={row.id}
                className="absolute inset-x-0 top-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                style={{
                  transform: `translateY(${depth * 11}px) scale(${1 - depth * 0.045})`,
                  opacity: 1 - depth * 0.16,
                  zIndex: 10 - depth,
                }}
                aria-hidden
              >
                <PeekFace row={row} categories={categories} />
              </div>
            );
          })}

        {flying && (
          <article
            className="absolute inset-x-0 top-0 z-30 rounded-2xl border border-border bg-card p-5 shadow-md"
            style={{
              transform: `translateX(${flyDir * 140}px) rotate(${flyDir * 12}deg)`,
              opacity: 0.35,
              transition: "transform 380ms ease, opacity 380ms ease",
            }}
          >
            <Seal kind={flying.stamp} />
            <PeekFace row={flying.row} categories={categories} />
          </article>
        )}

        <article
          className={cn(
            "relative z-20 touch-pan-y rounded-2xl border border-border bg-card p-5 shadow-md",
            swipeHint === "Accept" && "border-success/50",
            swipeHint === "Skip" && "border-destructive/50",
            flying && "opacity-0",
          )}
          style={{ transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)` }}
          onPointerDown={(event) => {
            if (editing || busy) return;
            startX.current = event.clientX;
            setPointerId(event.pointerId);
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (pointerId !== event.pointerId) return;
            setDragX(event.clientX - startX.current);
          }}
          onPointerUp={() => {
            if (dragX > 88) void accept();
            else if (dragX < -88) void skip();
            setDragX(0);
            setPointerId(null);
          }}
          onPointerCancel={() => {
            setDragX(0);
            setPointerId(null);
          }}
        >
          {swipeHint && <Seal kind={swipeHint === "Accept" ? "accepted" : "skipped"} />}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {formatDay(current.occurred_at)}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground">
                {current.merchant || current.descriptor || "Imported row"}
              </h2>
              {current.descriptor && current.descriptor !== current.merchant && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {current.descriptor}
                </p>
              )}
            </div>
            <p
              className={cn(
                "numeric shrink-0 text-xl",
                current.type === "income" ? "text-success" : "text-foreground",
              )}
            >
              {formatMoney(
                current.type === "income" ? current.amount_paise : -current.amount_paise,
                {
                  sign: true,
                },
              )}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-medium text-primary">
              {current.type === "income" ? "Income" : "Expense"}
            </span>
            <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] text-foreground">
              {categoryName(categories, suggestedId)}
            </span>
            {current.status === "held" && (
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                Held
              </span>
            )}
            {(current.confidence ?? 0) < IMPORT_LOW_CONFIDENCE_MAX && (
              <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">
                Needs a look
              </span>
            )}
          </div>

          {editing && edit && (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Date
                </span>
                <input
                  type="date"
                  className={fieldBase}
                  value={edit.occurred_on}
                  onChange={(event) => setEdit({ ...edit, occurred_on: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Amount (₹)
                </span>
                <input
                  inputMode="decimal"
                  className={fieldBase}
                  value={edit.amount}
                  onChange={(event) => setEdit({ ...edit, amount: event.target.value })}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Merchant
                </span>
                <input
                  className={fieldBase}
                  value={edit.merchant}
                  onChange={(event) => setEdit({ ...edit, merchant: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Type
                </span>
                <select
                  className={fieldBase}
                  value={edit.type}
                  onChange={(event) =>
                    setEdit({ ...edit, type: event.target.value as "income" | "expense" })
                  }
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Category
                </span>
                <select
                  className={fieldBase}
                  value={edit.category_id}
                  onChange={(event) => setEdit({ ...edit, category_id: event.target.value })}
                >
                  <option value="">Uncategorised</option>
                  {categories
                    .filter((category) => category.group !== "transfer")
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
        </article>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <button
          disabled={busy || history.length === 0}
          onClick={() => void goBack()}
          className="h-9 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          Back
        </button>
        <button
          disabled={busy}
          onClick={() => void skip()}
          className="h-9 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          Skip
        </button>
        <button
          disabled={busy}
          onClick={() => void hold()}
          className="h-9 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          Hold
        </button>
        <button
          disabled={busy}
          onClick={() => setEditing((open) => !open)}
          className="h-9 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          {editing ? "Hide edit" : "Edit"}
        </button>
        <button
          disabled={busy}
          onClick={() => void accept()}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Accept
        </button>
      </div>

      <p className="mt-4 hidden text-center text-[11px] text-muted-foreground sm:block">
        A accept · S skip · H hold · E edit · B back · Esc done. Swipe right to accept, left to skip.
      </p>
      <p className="mt-4 text-center text-[11px] text-muted-foreground sm:hidden">
        Swipe right to accept, left to skip.
      </p>
    </div>
  );
}
