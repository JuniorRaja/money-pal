import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { FileDrop } from "@/components/import/file-drop";
import { MappingEditor } from "@/components/import/mapping-editor";
import { createAccount, stageImport } from "@/data/mutations";
import type {
  Account,
  AccountKind,
  Category,
  ImportProfile,
  ImportRule,
  ImportSource,
} from "@/data/schema";
import {
  asColumnMapping,
  attachHashesToRows,
  bankPresetLabel,
  importableAccounts,
  parseFileToGrid,
  parseImportGrid,
  suggestImportAccounts,
  toStageDrafts,
  validateMapping,
} from "@/lib/import";
import type { BankPresetId, ColumnMapping, StatementParseResult } from "@/lib/import";
import { mutationErrorMessage } from "@/lib/mutation-error";
import { inferOpeningBalance } from "@/lib/import/stage";
import { cn } from "@/lib/utils";

export type StageResult = {
  job_id: string;
  rows_done: number;
  rows_total: number;
  duplicates: number;
};

type WizardStep = "file" | "password" | "map" | "account";

function isPdfPasswordError(error: unknown): error is Error & { incorrect: boolean } {
  return error instanceof Error && error.name === "PdfPasswordError";
}

export function ImportWizard({
  accounts,
  sources,
  profiles,
  categories,
  rules,
  sourceId,
  initialFile,
  onboardingAccount,
  onboardingAccountId,
  onAccountCreated,
  onStaged,
}: {
  accounts: Account[];
  sources: ImportSource[];
  profiles: ImportProfile[];
  categories: Category[];
  rules: ImportRule[];
  sourceId?: string | undefined;
  initialFile?: File | null;
  onboardingAccount?: { name: string; institution: string; kind: AccountKind } | null;
  onboardingAccountId?: string | null;
  onAccountCreated?: (account: Account) => void;
  onStaged: (result: StageResult) => void;
}) {
  const source = sources.find((row) => row.id === sourceId && row.kind === "csv") ?? null;
  const profile = source
    ? (profiles.find((row) => row.source_id === source.id) ??
      profiles.find((row) => row.id === source.profile_id))
    : null;

  const [file, setFile] = useState<File | null>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [parsed, setParsed] = useState<StatementParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(asColumnMapping(profile?.mapping));
  const [accountId, setAccountId] = useState(source?.account_id ?? onboardingAccountId ?? "");
  const [step, setStep] = useState<WizardStep>("file");
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    if (!parsed) return [];
    return suggestImportAccounts(accounts, {
      detectedPreset: parsed.detectedPreset,
      filename: parsed.filename,
      headers: parsed.headers,
    });
  }, [accounts, parsed]);

  const mappingErrors = useMemo(
    () => (parsed && mapping ? validateMapping(mapping, parsed.headers) : []),
    [mapping, parsed],
  );

  const mappingOk = Boolean(
    parsed && mapping && mappingErrors.length === 0 && parsed.rows.length > 0,
  );

  useEffect(() => {
    if (initialFile) void ingestFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ingestFile(next: File, nextMapping?: ColumnMapping | null, password?: string) {
    setFile(next);
    setBusy(true);
    setParseError(null);
    try {
      const savedMapping = source ? asColumnMapping(profile?.mapping) : null;
      // Decode once; onMappingChange re-maps this grid instead of re-reading the file.
      const nextGrid = await parseFileToGrid(await next.arrayBuffer(), next.name, password);
      setPasswordError(null);
      setGrid(nextGrid);
      const result = parseImportGrid(nextGrid, {
        filename: next.name,
        preset: (source?.bank_preset as BankPresetId | null) ?? undefined,
        mapping: nextMapping ?? savedMapping ?? undefined,
      });
      // Three distinct columns is the floor for date + description + amount, so
      // anything narrower can never satisfy the mapping editor. Say so here
      // rather than dropping the user into an unsatisfiable form.
      if (result.headers.length < 3) {
        setParseError(
          `This doesn't look like a bank statement — only ${result.headers.length} column${
            result.headers.length === 1 ? "" : "s"
          } found. Export the statement itself as CSV or Excel and try again.`,
        );
        setParsed(null);
        setStep("file");
        return;
      }
      setParsed(result);
      setMapping(result.mapping);
      const errors = result.mapping
        ? validateMapping(result.mapping, result.headers)
        : ["Could not read columns in this file."];
      const needsHelp = errors.length > 0 || result.rows.length === 0;
      if (needsHelp) {
        setStep("map");
        return;
      }
      if (source?.account_id) {
        await confirmStage(source.account_id, result, result.mapping);
        return;
      }
      if (onboardingAccount) {
        setStep("account");
        return;
      }
      const suggested = suggestImportAccounts(accounts, {
        detectedPreset: result.detectedPreset,
        filename: result.filename,
        headers: result.headers,
      });
      if (suggested.length === 1 && suggested[0]) {
        setAccountId(suggested[0].id);
        await confirmStage(suggested[0].id, result, result.mapping);
        return;
      }
      setStep("account");
    } catch (error) {
      if (isPdfPasswordError(error)) {
        setPasswordError(error.incorrect ? "Incorrect password." : null);
        setStep("password");
        return;
      }
      setParseError(mutationErrorMessage(error, "Could not parse this file"));
      setParsed(null);
      setStep("file");
    } finally {
      setBusy(false);
    }
  }

  function onMappingChange(next: ColumnMapping) {
    setMapping(next);
    if (!file || !grid) return;
    setParseError(null);
    try {
      const result = parseImportGrid(grid, {
        filename: file.name,
        mapping: next,
        preset: parsed?.detectedPreset ?? "custom",
      });
      setParsed(result);
      setMapping(result.mapping ?? next);
      if (result.mappingErrors.length === 0 && result.rows.length > 0) setStep("account");
    } catch (error) {
      setParseError(mutationErrorMessage(error, "Could not re-parse with this mapping"));
    }
  }

  async function confirmStage(nextAccountId: string, current = parsed, currentMapping = mapping) {
    if (!current || !currentMapping) return;
    if (validateMapping(currentMapping, current.headers).length > 0) return;
    if (current.rows.length === 0) {
      toast.error("No statement rows found in this file.");
      return;
    }
    setBusy(true);
    try {
      let destinationAccountId = nextAccountId || accountId;
      let destinationAccount = accounts.find((row) => row.id === destinationAccountId);
      if (!destinationAccountId && onboardingAccount) {
        const kind =
          current.detectedPreset === "hdfc_cc"
            ? "credit_card"
            : current.detectedPreset === "hdfc_savings" || current.detectedPreset === "dbs"
              ? "bank"
              : onboardingAccount.kind;
        destinationAccount = await createAccount({
          name: onboardingAccount.name,
          institution: current.detectedPreset
            ? bankPresetLabel(current.detectedPreset)
            : onboardingAccount.institution,
          kind,
          balance: inferOpeningBalance(current.rows, kind),
          credit_limit: null,
        });
        destinationAccountId = destinationAccount.id;
        setAccountId(destinationAccountId);
        onAccountCreated?.(destinationAccount);
      }
      if (!destinationAccountId) return;

      const hashed = await attachHashesToRows(destinationAccountId, current.rows);
      const drafts = toStageDrafts(hashed, categories, rules, destinationAccountId);
      if (drafts.length === 0) {
        toast.error("No valid amounts to import.");
        return;
      }
      const preset: BankPresetId = current.detectedPreset ?? source?.bank_preset ?? "custom";
      const result = await stageImport({
        account_id: destinationAccountId,
        bank_preset: preset,
        source_name:
          source?.name ??
          `${destinationAccount?.name ?? onboardingAccount?.name ?? "Account"} · ${bankPresetLabel(preset)}`,
        source_id: source?.id ?? null,
        mapping: currentMapping,
        title: current.filename,
        rows: drafts,
      });
      onStaged(result);
    } catch (error) {
      toast.error(mutationErrorMessage(error, "Could not stage this import"));
    } finally {
      setBusy(false);
    }
  }

  if (!onboardingAccount && importableAccounts(accounts).length === 0) {
    return (
      <div className="px-1 py-2">
        <p className="text-sm font-medium text-foreground">Add an account first</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Imports land on a bank, cash, or credit card account.
        </p>
        <Link
          to="/accounts"
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Go to accounts
        </Link>
      </div>
    );
  }

  const steps: WizardStep[] = ["file", "map", "account"];
  const active = steps.indexOf(step === "password" ? "file" : step);

  return (
    <div className="relative min-h-[260px] pb-8">
      {steps
        .map((id, index) => ({ id, index, behind: index - active }))
        .filter(({ behind }) => behind >= 0 && behind <= 2)
        .reverse()
        .map(({ id, behind }) => (
          <PipelineCard
            key={id}
            depth={behind}
            label={
              id === "file"
                ? "Statement"
                : id === "map"
                  ? "Columns"
                  : onboardingAccount
                    ? "Confirm statement"
                    : "Account"
            }
            active={behind === 0}
          >
            {id === "file" && behind === 0 && step === "password" && file && (
              <PasswordStep
                filename={file.name}
                busy={busy}
                error={passwordError}
                onSubmit={(password) => void ingestFile(file, undefined, password)}
                onBack={() => {
                  setFile(null);
                  setPasswordError(null);
                  setStep("file");
                }}
              />
            )}
            {id === "file" && behind === 0 && step !== "password" && (
              <div className="space-y-3">
                <FileDrop
                  compact
                  file={file}
                  disabled={busy}
                  onFile={(next) => void ingestFile(next)}
                />
                {parseError && <p className="text-xs text-destructive">{parseError}</p>}
                {parsed && mappingOk && (
                  <p className="text-xs text-muted-foreground">
                    {parsed.detectedPreset
                      ? `Detected ${bankPresetLabel(parsed.detectedPreset)}`
                      : "Columns mapped automatically"}
                    {` · ${parsed.rows.length} rows`}
                    {parsed.skippedRowCount > 0 ? ` · ${parsed.skippedRowCount} skipped` : ""}.
                  </p>
                )}
                {busy && <p className="text-xs text-muted-foreground">Reading the statement…</p>}
              </div>
            )}
            {id === "map" && behind === 0 && parsed && mapping && (
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  Match date, description, and amount so we can read this file.
                </p>
                <MappingEditor
                  headers={parsed.headers}
                  previewRows={parsed.previewRows}
                  mapping={mapping}
                  errors={mappingErrors}
                  onChange={onMappingChange}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-lg border border-border px-3 text-sm"
                    onClick={() => setStep("file")}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
            {id === "account" &&
              behind === 0 &&
              (onboardingAccount && parsed ? (
                <StatementConfirmStep
                  parsed={parsed}
                  accountName={onboardingAccount.name}
                  busy={busy}
                  onBack={() => setStep("file")}
                  onContinue={() => void confirmStage(onboardingAccountId ?? "")}
                />
              ) : (
                <AccountStep
                  accounts={candidates}
                  accountId={accountId}
                  busy={busy}
                  onChange={setAccountId}
                  onBack={() => setStep(file && mappingOk ? "file" : "map")}
                  onContinue={() => void confirmStage(accountId || candidates[0]?.id || "")}
                />
              ))}
            {behind > 0 && (
              <p className="text-xs text-muted-foreground">
                {id === "file"
                  ? (file?.name ?? "Drop a statement")
                  : id === "map"
                    ? "Column map"
                    : onboardingAccount
                      ? "Statement details"
                      : "Pick account"}
              </p>
            )}
          </PipelineCard>
        ))}
    </div>
  );
}

function PipelineCard({
  depth,
  label,
  active,
  children,
}: {
  depth: number;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-sm",
        active ? "relative z-20" : "pointer-events-none absolute inset-x-2 top-0 z-10",
      )}
      style={
        active
          ? undefined
          : {
              transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`,
              opacity: 0.55,
            }
      }
      aria-hidden={!active}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function AccountStep({
  accounts,
  accountId,
  busy,
  onChange,
  onBack,
  onContinue,
}: {
  accounts: Account[];
  accountId: string;
  busy: boolean;
  onChange: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No bank, cash, or card account to import into.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {accounts.length === 1 ? (
        <p className="text-sm text-foreground">
          Import into <span className="font-medium">{accounts[0]!.name}</span>
        </p>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Which account is this statement for?
          </span>
          <select
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
            value={accountId}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="h-9 rounded-lg border border-border px-3 text-sm"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy || (accounts.length > 1 && !accountId)}
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={onContinue}
        >
          {busy ? "Staging…" : "Review rows"}
        </button>
      </div>
    </div>
  );
}

function StatementConfirmStep({
  parsed,
  accountName,
  busy,
  onBack,
  onContinue,
}: {
  parsed: StatementParseResult;
  accountName: string;
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const dates = parsed.rows.map((row) => row.occurred_on).sort();
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{parsed.filename}</p>
      <p className="text-sm text-muted-foreground">
        {parsed.rows.length} rows · {dates[0] ?? "No dates"}
        {dates.length > 1 ? ` to ${dates.at(-1)}` : ""}
        {parsed.skippedRowCount > 0 ? ` · ${parsed.skippedRowCount} rows skipped` : ""}
      </p>
      {parsed.detectedPreset && (
        <p className="text-xs text-muted-foreground">
          Detected {bankPresetLabel(parsed.detectedPreset)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Will be added to {accountName}.</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-11 rounded-md border border-border px-3 text-sm"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy || parsed.rows.length === 0}
          className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={onContinue}
        >
          {busy ? "Preparing statement…" : "Use this statement"}
        </button>
      </div>
    </div>
  );
}

function PasswordStep({
  filename,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  filename: string;
  busy: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (password) onSubmit(password);
      }}
    >
      <p className="text-sm text-foreground">
        <span className="font-medium">{filename}</span> is password protected. The password stays in
        this browser and is never sent anywhere.
      </p>
      <input
        type="password"
        autoFocus
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
        placeholder="Statement password"
        value={password}
        disabled={busy}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="h-9 rounded-lg border border-border px-3 text-sm"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={busy || !password}
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </div>
    </form>
  );
}
