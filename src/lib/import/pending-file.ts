let pending: File | null = null;

export function setPendingImportFile(file: File): void {
  pending = file;
}

export function takePendingImportFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}
