import type { ColumnMapping, DateFormatHint, UnsignedAmountMeans } from "@/lib/import";
import { cn } from "@/lib/utils";

const fieldBase =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60";

function ColumnSelect({
  label,
  value,
  headers,
  optional,
  onChange,
}: {
  label: string;
  value: string | null;
  headers: string[];
  optional?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <select
        className={fieldBase}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        {optional && <option value="">—</option>}
        {!optional && !value && <option value="">Select column</option>}
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MappingEditor({
  headers,
  previewRows,
  mapping,
  errors,
  onChange,
}: {
  headers: string[];
  previewRows: string[][];
  mapping: ColumnMapping;
  errors: string[];
  onChange: (next: ColumnMapping) => void;
}) {
  const patch = (partial: Partial<ColumnMapping>) => onChange({ ...mapping, ...partial });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ColumnSelect
          label="Date"
          value={mapping.dateColumn}
          headers={headers}
          onChange={(dateColumn) => patch({ dateColumn: dateColumn ?? "" })}
        />
        <ColumnSelect
          label="Description"
          value={mapping.descriptionColumn}
          headers={headers}
          onChange={(descriptionColumn) => patch({ descriptionColumn: descriptionColumn ?? "" })}
        />
        <ColumnSelect
          label="Debit"
          value={mapping.debitColumn}
          headers={headers}
          optional
          onChange={(debitColumn) => patch({ debitColumn })}
        />
        <ColumnSelect
          label="Credit"
          value={mapping.creditColumn}
          headers={headers}
          optional
          onChange={(creditColumn) => patch({ creditColumn })}
        />
        <ColumnSelect
          label="Amount"
          value={mapping.amountColumn}
          headers={headers}
          optional
          onChange={(amountColumn) => patch({ amountColumn })}
        />
        <ColumnSelect
          label="Cr / Dr"
          value={mapping.crDrColumn}
          headers={headers}
          optional
          onChange={(crDrColumn) => patch({ crDrColumn })}
        />
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Date format
          </span>
          <select
            className={fieldBase}
            value={mapping.dateFormat}
            onChange={(event) => patch({ dateFormat: event.target.value as DateFormatHint })}
          >
            <option value="auto">Auto (India: DD/MM)</option>
            <option value="DMY">DD/MM/YYYY</option>
            <option value="MDY">MM/DD/YYYY</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Single amount means
          </span>
          <select
            className={fieldBase}
            value={mapping.unsignedAmountMeans}
            onChange={(event) =>
              patch({ unsignedAmountMeans: event.target.value as UnsignedAmountMeans })
            }
          >
            <option value="signed">Signed (negative is money out)</option>
            <option value="expense">Unsigned amounts are expenses</option>
            <option value="income">Unsigned amounts are income</option>
          </select>
        </label>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-[11px]">
          <thead className="bg-accent/50 text-muted-foreground">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className={cn(
                    "whitespace-nowrap px-2.5 py-2 font-medium",
                    header === mapping.dateColumn ||
                      header === mapping.descriptionColumn ||
                      header === mapping.amountColumn ||
                      header === mapping.debitColumn ||
                      header === mapping.creditColumn
                      ? "text-primary"
                      : "",
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {previewRows.map((row, index) => (
              <tr key={index}>
                {headers.map((header, col) => (
                  <td key={header} className="max-w-[160px] truncate px-2.5 py-1.5 text-foreground">
                    {row[col] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
