/** Unwrap TanStack server-fn / PostgREST failures into a toast-safe string. */
export function mutationErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return friendlyImportMessage(error);
  if (error instanceof Error && error.message.trim()) {
    return friendlyImportMessage(error.message);
  }
  if (error && typeof error === "object") {
    const row = error as Record<string, unknown>;
    const message = row["message"];
    if (typeof message === "string" && message.trim()) {
      return friendlyImportMessage(message);
    }
    const data = row["data"];
    if (typeof data === "string" && data.trim()) return friendlyImportMessage(data);
    if (data && typeof data === "object") {
      const nested = data as Record<string, unknown>;
      const nestedMessage = nested["message"];
      if (typeof nestedMessage === "string" && nestedMessage.trim()) {
        return friendlyImportMessage(nestedMessage);
      }
    }
  }
  return fallback;
}

function friendlyImportMessage(message: string): string {
  if (
    /import_job_rows|import_profiles|import_rules/i.test(message) &&
    /schema cache|does not exist/i.test(message)
  ) {
    return "Import tables are missing. Apply migration 20260814080138_csv_import_center.sql, then try again.";
  }
  return message;
}
