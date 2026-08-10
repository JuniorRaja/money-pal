import type { ImportJob, ImportReviewItem, ImportSource, UserSettings } from "@/data/schema";

export const importSources: ImportSource[] = [
  { id: "src_gmail", kind: "gmail", name: "Gmail", status: "Connected \u00b7 synced 20 minutes ago" },
  { id: "src_pdf", kind: "pdf", name: "PDF statement", status: "Last import 07 Aug \u00b7 62 rows" },
  { id: "src_csv", kind: "csv", name: "CSV", status: "Column mapping saved" },
  { id: "src_manual", kind: "manual", name: "Manual entry", status: "Always available" },
];

export const importJobs: ImportJob[] = [
  {
    id: "job_icici_jul",
    source_id: "src_pdf",
    title: "Parsing ICICI statement \u00b7 July 2026",
    rows_done: 38,
    rows_total: 61,
    finished_at: null,
    imported: 0,
    duplicates: 0,
  },
  {
    id: "job_gmail_aug",
    source_id: "src_gmail",
    title: "Gmail \u00b7 statements and receipts",
    rows_done: 10,
    rows_total: 10,
    finished_at: "2026-08-07T13:10:00+05:30",
    imported: 9,
    duplicates: 1,
  },
  {
    id: "job_csv_hdfc",
    source_id: "src_csv",
    title: "HDFC export \u00b7 Q2 FY27",
    rows_done: 148,
    rows_total: 148,
    finished_at: "2026-08-05T09:45:00+05:30",
    imported: 145,
    duplicates: 3,
  },
  {
    id: "job_manual_cash",
    source_id: "src_manual",
    title: "Cash entries \u00b7 first week",
    rows_done: 6,
    rows_total: 6,
    finished_at: "2026-08-02T21:00:00+05:30",
    imported: 6,
    duplicates: 0,
  },
];

export const importReviewItems: ImportReviewItem[] = [
  {
    id: "rev_dup_amazon",
    kind: "duplicate",
    title: "Duplicate \u00b7 \u20B92,450 Amazon",
    detail: "Present in both the Gmail import and the ICICI statement for 07 August.",
    action_label: "Resolve",
  },
  {
    id: "rev_unknown_rzp",
    kind: "unknown_merchant",
    title: "Unknown merchant \u00b7 \u20B91,180 RZP*TVLGO",
    detail: "No category could be inferred. Assigning one teaches the rule for next time.",
    action_label: "Categorise",
  },
  {
    id: "rev_large_mom",
    kind: "large_transfer",
    title: "Large transfer \u00b7 \u20B95,000 to Mom",
    detail: "Money Mate suggests allocating this to the Mom label rather than Personal.",
    action_label: "Accept",
  },
];

export const userSettings: UserSettings = {
  user_id: "usr_pr",
  display_name: "PR",
  email: "pr@finos.local",
  currency: "INR",
  week_starts_on: "Monday",
  number_format: "indian",
  round_to_nearest: true,
  theme: "light",
  accent: "Antique gold",
  sidebar: "expanded",
  reduce_motion: false,
  assistant_tone: "concise",
  assistant_context: true,
};
