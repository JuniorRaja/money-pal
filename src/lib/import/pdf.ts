import { GlobalWorkerOptions, PasswordException, PasswordResponses, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { gridFromItems, type PositionedItem } from "./pdf-grid";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export class PdfPasswordError extends Error {
  constructor(public readonly incorrect: boolean) {
    super(incorrect ? "Incorrect password." : "This PDF is password protected.");
    this.name = "PdfPasswordError";
  }
}

export class PdfNoTextLayerError extends Error {
  constructor() {
    super(
      "This PDF has no text layer, so it looks scanned. OCR isn't supported — export a " +
        "text-based statement (or the bank's CSV/Excel export) instead.",
    );
    this.name = "PdfNoTextLayerError";
  }
}

function isRawTextItem<T>(item: T): item is T & { str: string; transform: number[] } {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as { str?: unknown }).str === "string" &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

/**
 * Extract a `string[][]` grid from a PDF's text layer, in the same shape
 * `parseFileToGrid` produces for CSV/Excel. The file never leaves the browser.
 */
export async function pdfToGrid(bytes: ArrayBuffer, password?: string): Promise<string[][]> {
  let doc;
  try {
    doc = await getDocument({ data: bytes, password }).promise;
  } catch (error) {
    if (error instanceof PasswordException) {
      throw new PdfPasswordError(error.code === PasswordResponses.INCORRECT_PASSWORD);
    }
    throw error;
  }

  const grid: string[][] = [];
  let hadAnyText = false;
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PositionedItem[] = content.items
      .filter(isRawTextItem)
      .filter((item) => item.str.trim() !== "")
      .map((item) => ({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 }));
    if (items.length === 0) continue;
    hadAnyText = true;
    grid.push(...gridFromItems(items));
  }

  // A page with zero text spans is a scan, not a layout quirk — declining
  // beats silently importing nothing or garbage.
  if (!hadAnyText) throw new PdfNoTextLayerError();
  return grid;
}
