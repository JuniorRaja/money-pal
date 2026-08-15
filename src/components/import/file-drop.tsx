import { FileSpreadsheet, Upload } from "lucide-react";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

const ACCEPT =
  ".csv,.xlsx,.xls,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf";

export function FileDrop({
  file,
  disabled,
  onFile,
  compact,
}: {
  file: File | null;
  disabled?: boolean;
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);

  const take = useCallback(
    (next: File | undefined) => {
      if (!next || disabled) return;
      const name = next.name.toLowerCase();
      if (
        !name.endsWith(".csv") &&
        !name.endsWith(".xlsx") &&
        !name.endsWith(".xls") &&
        !name.endsWith(".pdf")
      )
        return;
      onFile(next);
    },
    [disabled, onFile],
  );

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center transition-colors",
        compact ? "min-h-[88px] py-4" : "min-h-[140px] py-6",
        over ? "border-primary bg-primary/8" : "border-border bg-accent/30 hover:border-primary/50",
        disabled && "pointer-events-none opacity-50",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files[0]);
      }}
    >
      <input
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
        {file ? <FileSpreadsheet className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
      </span>
      {file ? (
        <>
          <p className="mt-3 text-sm font-medium text-foreground">{file.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Drop a different statement to replace it.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium text-foreground">
            Drop a CSV, Excel, or PDF statement
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Parsed in this browser. The file is never uploaded.
          </p>
        </>
      )}
    </label>
  );
}
