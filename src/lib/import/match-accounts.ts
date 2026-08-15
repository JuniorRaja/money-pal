import type { Account } from "@/data/schema";
import type { BankPresetId } from "./types";

export function importableAccounts(accounts: Account[]): Account[] {
  return accounts.filter(
    (account) =>
      account.kind === "bank" || account.kind === "cash" || account.kind === "credit_card",
  );
}

const BANK_NEEDLES = [
  "hdfc",
  "dbs",
  "icici",
  "axis",
  "sbi",
  "indusind",
  "idfc",
  "kotak",
  "yes bank",
  "iob",
] as const;

function haystack(account: Account): string {
  return `${account.name} ${account.institution}`.toLowerCase();
}

function needlesFromPreset(preset: BankPresetId | null): string[] {
  if (preset === "hdfc_savings" || preset === "hdfc_cc") return ["hdfc"];
  if (preset === "dbs") return ["dbs"];
  return [];
}

function needlesFromText(filename: string, headers: readonly string[]): string[] {
  const blob = `${filename} ${headers.join(" ")}`.toLowerCase();
  return BANK_NEEDLES.filter((needle) => blob.includes(needle));
}

/** Accounts that look like they belong to the detected bank. Falls back to every importable account. */
export function suggestImportAccounts(
  accounts: Account[],
  input: {
    detectedPreset: BankPresetId | null;
    filename: string;
    headers: readonly string[];
  },
): Account[] {
  const pool = importableAccounts(accounts);
  const needles = [
    ...new Set([...needlesFromPreset(input.detectedPreset), ...needlesFromText(input.filename, input.headers)]),
  ];

  if (input.detectedPreset === "hdfc_cc") {
    const cards = pool.filter(
      (account) => account.kind === "credit_card" && needles.some((needle) => haystack(account).includes(needle)),
    );
    if (cards.length > 0) return cards;
  }

  if (needles.length === 0) return pool;
  const matched = pool.filter((account) => needles.some((needle) => haystack(account).includes(needle)));
  return matched.length > 0 ? matched : pool;
}
