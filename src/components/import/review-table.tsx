import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { Category, ImportJobRow, ImportRule } from "@/data/schema";
import { IMPORT_LOW_CONFIDENCE_MAX } from "@/data/schema";
import { commitImportRow, skipImportRow } from "@/data/mutations";
import { midnightIst, resolveSuggestedCategoryId } from "@/lib/import";
import { dayKey, formatDay, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ConfidenceFilter = "all" | "high" | "low" | "needs_review";

function confidenceLabel(confidence: number | null): string {
  if (confidence == null) return "Unknown";
  if (confidence >= 0.9) return "High";
  if (confidence >= IMPORT_LOW_CONFIDENCE_MAX) return "Medium";
  return "Low";
}

function confidenceBadge(confidence: number | null): React.ReactNode {
  const label = confidenceLabel(confidence);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        label === "High" && "bg-success/15 text-success",
        label === "Medium" && "bg-primary/15 text-primary",
        label === "Low" && "bg-destructive/15 text-destructive",
        label === "Unknown" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function categoryName(categories: Category[], id: string | null): string {
  if (!id) return "Uncategorised";
  return categories.find((category) => category.id === id)?.name ?? "Uncategorised";
}

export function ReviewTable({
  rows,
  categories,
  rules,
  onRowProcessed,
  onDone,
}: {
  rows: ImportJobRow[];
  categories: Category[];
  rules: ImportRule[];
  onRowProcessed: (id: string) => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ConfidenceFilter>("all");
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Filter visible rows based on confidence filter
  const visible = useMemo(() => {
    const pending = rows.filter((row) => row.status === "pending" || row.status === "held");
    if (filter === "all") return pending;
    if (filter === "high") return pending.filter((row) => (row.confidence ?? 0) >= 0.9);
    if (filter === "low") return pending.filter((row) => (row.confidence ?? 0) < IMPORT_LOW_CONFIDENCE_MAX);
    if (filter === "needs_review") {
      return pending.filter(
        (row) =>
          (row.confidence ?? 0) < IMPORT_LOW_CONFIDENCE_MAX || row.possible_duplicate != null,
      );
    }
    return pending;
  }, [rows, filter]);

  // Confidence breakdown for summary
  const breakdown = useMemo(() => {
    const pending = rows.filter((row) => row.status === "pending" || row.status === "held");
    const high = pending.filter((row) => (row.confidence ?? 0) >= 0.9);
    const medium = pending.filter(
      (row) => (row.confidence ?? 0) >= IMPORT_LOW_CONFIDENCE_MAX && (row.confidence ?? 0) < 0.9,
    );
    const low = pending.filter((row) => (row.confidence ?? 0) < IMPORT_LOW_CONFIDENCE_MAX);
    const duplicates = pending.filter((row) => row.possible_duplicate != null);
    return { total: pending.length, high: high.length, medium: medium.length, low: low.length, duplicates: duplicates.length };
  }, [rows]);

  const allSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));
  const someSelected = visible.some((row) => selected.has(row.id));

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((row) => row.id)));
    }
  }, [allSelected, visible]);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Accept a single row with its suggested category
  const acceptRow = useCallback(
    async (row: ImportJobRow) => {
      const categoryId = resolveSuggestedCategoryId({
        merchant: row.merchant,
        suggestedCategoryId: row.suggested_category_id,
        categories,
        rules,
        accountId: row.account_id,
      });

      await commitImportRow({
        row_id: row.id,
        patch: {
          occurred_at: midnightIst(dayKey(row.occurred_at)),
          merchant: row.merchant || null,
          descriptor: row.descriptor || null,
          note: row.note,
          amount_paise: row.amount_paise,
          type: row.type,
          suggested_category_id: categoryId,
        },
      });
    },
    [categories, rules],
  );

  // Accept all high-confidence rows
  const acceptAllHighConfidence = useCallback(async () => {
    const highConfidence = visible.filter(
      (row) => (row.confidence ?? 0) >= 0.9 && !row.possible_duplicate,
    );
    if (highConfidence.length === 0) {
      toast.message("No high-confidence rows", {
        description: "All rows need manual review.",
      });
      return;
    }

    setBusy(true);
    setProcessingIds(new Set(highConfidence.map((row) => row.id)));

    let accepted = 0;
    let failed = 0;

    for (const row of highConfidence) {
      try {
        await acceptRow(row);
        onRowProcessed(row.id);
        accepted++;
      } catch {
        failed++;
      }
    }

    setProcessingIds(new Set());
    setBusy(false);
    setSelected(new Set());

    if (failed > 0) {
      toast.error(`Accepted ${accepted}, failed ${failed}`);
    } else {
      toast.success(`Accepted ${accepted} transactions`);
    }
  }, [visible, acceptRow, onRowProcessed]);

  // Accept selected rows
  const acceptSelected = useCallback(async () => {
    const toAccept = visible.filter((row) => selected.has(row.id));
    if (toAccept.length === 0) return;

    setBusy(true);
    setProcessingIds(new Set(toAccept.map((row) => row.id)));

    let accepted = 0;
    let failed = 0;

    for (const row of toAccept) {
      try {
        await acceptRow(row);
        onRowProcessed(row.id);
        accepted++;
      } catch {
        failed++;
      }
    }

    setProcessingIds(new Set());
    setBusy(false);
    setSelected(new Set());

    if (failed > 0) {
      toast.error(`Accepted ${accepted}, failed ${failed}`);
    } else {
      toast.success(`Accepted ${accepted} transactions`);
    }
  }, [visible, selected, acceptRow, onRowProcessed]);

  // Skip selected rows
  const skipSelected = useCallback(async () => {
    const toSkip = visible.filter((row) => selected.has(row.id));
    if (toSkip.length === 0) return;

    setBusy(true);
    setProcessingIds(new Set(toSkip.map((row) => row.id)));

    let skipped = 0;
    let failed = 0;

    for (const row of toSkip) {
      try {
        await skipImportRow(row.id);
        onRowProcessed(row.id);
        skipped++;
      } catch {
        failed++;
      }
    }

    setProcessingIds(new Set());
    setBusy(false);
    setSelected(new Set());

    if (failed > 0) {
      toast.error(`Skipped ${skipped}, failed ${failed}`);
    } else {
      toast.success(`Skipped ${skipped} transactions`);
    }
  }, [visible, selected, onRowProcessed]);

  // Assign category to selected rows and accept them
  const assignCategoryAndAccept = useCallback(async () => {
    if (!bulkCategory) {
      toast.error("Select a category first");
      return;
    }
    const toProcess = visible.filter((row) => selected.has(row.id));
    if (toProcess.length === 0) return;

    setBusy(true);
    setProcessingIds(new Set(toProcess.map((row) => row.id)));

    let processed = 0;
    let failed = 0;

    for (const row of toProcess) {
      try {
        await commitImportRow({
          row_id: row.id,
          patch: {
            occurred_at: midnightIst(dayKey(row.occurred_at)),
            merchant: row.merchant || null,
            descriptor: row.descriptor || null,
            note: row.note,
            amount_paise: row.amount_paise,
            type: row.type,
            suggested_category_id: bulkCategory,
          },
        });
        onRowProcessed(row.id);
        processed++;
      } catch {
        failed++;
      }
    }

    setProcessingIds(new Set());
    setBusy(false);
    setSelected(new Set());
    setBulkCategory("");

    if (failed > 0) {
      toast.error(`Processed ${processed}, failed ${failed}`);
    } else {
      toast.success(`Categorised and accepted ${processed} transactions`);
    }
  }, [visible, selected, bulkCategory, onRowProcessed]);

  if (visible.length === 0 && breakdown.total === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="mt-2 text-xs text-muted-foreground">No more transactions to review.</p>
        <button
          onClick={onDone}
          className="mt-5 h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Back to Import Center
        </button>
      </div>
    );
  }

  const highConfidenceCount = visible.filter(
    (row) => (row.confidence ?? 0) >= 0.9 && !row.possible_duplicate,
  ).length;

  return (
    <div className="space-y-3">
      {/* Summary Banner */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium text-foreground">{breakdown.total} transactions</span>
        <span className="text-success">{breakdown.high} high</span>
        <span className="text-primary">{breakdown.medium} medium</span>
        <span className="text-destructive">{breakdown.low} low</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(value) => setFilter(value as ConfidenceFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({breakdown.total})</SelectItem>
            <SelectItem value="high">High ({breakdown.high})</SelectItem>
            <SelectItem value="low">Needs review ({breakdown.low})</SelectItem>
          </SelectContent>
        </Select>

        <button
          disabled={busy || highConfidenceCount === 0}
          onClick={() => void acceptAllHighConfidence()}
          className="h-9 rounded-lg bg-success px-3 text-sm font-medium text-success-foreground disabled:opacity-50"
        >
          Accept high ({highConfidenceCount})
        </button>

        {someSelected && (
          <>
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <button
              disabled={busy}
              onClick={() => void acceptSelected()}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Accept
            </button>
            <button
              disabled={busy}
              onClick={() => void skipSelected()}
              className="h-9 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50"
            >
              Skip
            </button>

            <div className="flex items-center gap-1">
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((category) => category.group !== "transfer")
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <button
                disabled={busy || !bulkCategory}
                onClick={() => void assignCategoryAndAccept()}
                className="h-9 rounded-lg border border-border px-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </>
        )}

        <button
          onClick={onDone}
          className="ml-auto h-9 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent"
        >
          Done
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-24">Date</TableHead>
              <TableHead className="min-w-[180px]">Merchant</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
              <TableHead className="w-32">Category</TableHead>
              <TableHead className="w-20">Conf.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const isProcessing = processingIds.has(row.id);
              const categoryId = resolveSuggestedCategoryId({
                merchant: row.merchant,
                suggestedCategoryId: row.suggested_category_id,
                categories,
                rules,
                accountId: row.account_id,
              });

              return (
                <TableRow
                  key={row.id}
                  data-state={selected.has(row.id) ? "selected" : undefined}
                  className={cn(isProcessing && "opacity-50")}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggleRow(row.id)}
                      disabled={isProcessing}
                      aria-label={`Select ${row.merchant || "row"}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDay(row.occurred_at)}
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {row.merchant || row.descriptor || "Unknown"}
                      </p>
                      {row.descriptor && row.descriptor !== row.merchant && (
                        <p className="truncate text-xs text-muted-foreground">{row.descriptor}</p>
                      )}
                      {row.possible_duplicate && (
                        <p className="mt-1 text-xs text-destructive">Possible duplicate</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "numeric text-right text-sm",
                      row.type === "income" ? "text-success" : "text-foreground",
                    )}
                  >
                    {formatMoney(row.type === "income" ? row.amount_paise : -row.amount_paise, {
                      sign: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground">{categoryName(categories, categoryId)}</span>
                  </TableCell>
                  <TableCell>{confidenceBadge(row.confidence)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {visible.length === 0 && breakdown.total > 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No transactions match this filter. Try a different filter.
          </p>
        </div>
      )}
    </div>
  );
}
