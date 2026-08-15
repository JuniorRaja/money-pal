import type { ColumnMapping } from "./types";
import { parseAmountToPaise, parseStatementDate } from "./normalize";

export function validateMapping(mapping: ColumnMapping, headers: readonly string[]): string[] {
  const errors: string[] = [];
  const headerSet = new Set(headers);

  if (!mapping.dateColumn) errors.push("Date column is required.");
  else if (!headerSet.has(mapping.dateColumn))
    errors.push(`Date column "${mapping.dateColumn}" is not in the file.`);

  if (!mapping.descriptionColumn) errors.push("Description column is required.");
  else if (!headerSet.has(mapping.descriptionColumn)) {
    errors.push(`Description column "${mapping.descriptionColumn}" is not in the file.`);
  }

  const hasDebitCredit = Boolean(mapping.debitColumn && mapping.creditColumn);
  const hasAmount = Boolean(mapping.amountColumn);
  if (!hasDebitCredit && !hasAmount) {
    errors.push(
      "Amount direction is required: map debit+credit columns, or a single amount column.",
    );
  }

  if (mapping.debitColumn && !headerSet.has(mapping.debitColumn)) {
    errors.push(`Debit column "${mapping.debitColumn}" is not in the file.`);
  }
  if (mapping.creditColumn && !headerSet.has(mapping.creditColumn)) {
    errors.push(`Credit column "${mapping.creditColumn}" is not in the file.`);
  }
  if (mapping.amountColumn && !headerSet.has(mapping.amountColumn)) {
    errors.push(`Amount column "${mapping.amountColumn}" is not in the file.`);
  }
  if (mapping.crDrColumn && !headerSet.has(mapping.crDrColumn)) {
    errors.push(`Credit/Debit column "${mapping.crDrColumn}" is not in the file.`);
  }

  return errors;
}

export type DirectedAmount = {
  amount_paise: number;
  type: "income" | "expense";
};

export function resolveDirectedAmount(
  record: Record<string, string>,
  mapping: ColumnMapping,
): DirectedAmount | null {
  if (mapping.debitColumn && mapping.creditColumn) {
    const debitRaw = record[mapping.debitColumn] ?? "";
    const creditRaw = record[mapping.creditColumn] ?? "";
    const debit = parseAmountToPaise(debitRaw);
    const credit = parseAmountToPaise(creditRaw);
    if (debit == null || credit == null) return null;
    const debitAbs = Math.abs(debit);
    const creditAbs = Math.abs(credit);
    if (debitAbs === 0 && creditAbs === 0) return null;
    if (creditAbs > 0 && debitAbs === 0) {
      return { amount_paise: creditAbs, type: "income" };
    }
    if (debitAbs > 0 && creditAbs === 0) {
      return { amount_paise: -debitAbs, type: "expense" };
    }
    const net = creditAbs - debitAbs;
    if (net === 0) return null;
    return net > 0 ? { amount_paise: net, type: "income" } : { amount_paise: net, type: "expense" };
  }

  if (!mapping.amountColumn) return null;
  const parsed = parseAmountToPaise(record[mapping.amountColumn] ?? "");
  if (parsed == null || parsed === 0) return null;

  const crDr = classifyCrDr(record[mapping.crDrColumn ?? ""] ?? "");
  if (crDr === "credit") {
    return { amount_paise: Math.abs(parsed), type: "income" };
  }
  if (crDr === "debit") {
    return { amount_paise: -Math.abs(parsed), type: "expense" };
  }

  if (mapping.unsignedAmountMeans === "signed") {
    if (parsed < 0) return { amount_paise: parsed, type: "expense" };
    return { amount_paise: parsed, type: "income" };
  }
  if (mapping.unsignedAmountMeans === "expense") {
    const abs = Math.abs(parsed);
    return parsed < 0
      ? { amount_paise: abs, type: "income" }
      : { amount_paise: -abs, type: "expense" };
  }
  const abs = Math.abs(parsed);
  return parsed < 0
    ? { amount_paise: -abs, type: "expense" }
    : { amount_paise: abs, type: "income" };
}

function classifyCrDr(raw: string): "credit" | "debit" | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^(cr|c|credit|crd)$/.test(s) || s.includes("credit")) return "credit";
  if (/^(dr|d|debit|dbt)$/.test(s) || s.includes("debit")) return "debit";
  return null;
}

export function recordFromRow(
  headers: readonly string[],
  cells: readonly string[],
): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const key = headers[i];
    if (!key) continue;
    record[key] = cells[i] ?? "";
  }
  return record;
}

export function mapRawRecord(
  record: Record<string, string>,
  mapping: ColumnMapping,
): { date: string; narration: string; amount: DirectedAmount } | null {
  const date = parseStatementDate(record[mapping.dateColumn] ?? "", mapping.dateFormat);
  if (!date) return null;
  const narration = (record[mapping.descriptionColumn] ?? "").trim();
  if (!narration) return null;
  const amount = resolveDirectedAmount(record, mapping);
  if (!amount) return null;
  return { date, narration, amount };
}
