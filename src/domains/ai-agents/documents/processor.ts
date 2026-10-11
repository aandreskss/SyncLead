import "server-only"
import type { ExtractionResult, ExtractedChunk } from "./types"
import { splitIntoChunks, mergeSmallChunks } from "./chunker"

// Minimum text length for a PDF page to be considered non-scanned.
// A scanned page has virtually no selectable text after extraction.
const SCANNED_PDF_MIN_CHARS_PER_PAGE = 50

// ─── PDF extraction ───────────────────────────────────────────────────────────

export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  // Lazy import — pdf-parse is a CommonJS module; the callable export varies by bundler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfModule = await import("pdf-parse") as any
  const pdfParse: (buf: Buffer) => Promise<{ numpages: number; text: string; text_per_page?: string[] }> =
    pdfModule.default ?? pdfModule

  let parsed: { numpages: number; text: string; text_per_page?: string[] }
  try {
    parsed = await pdfParse(buffer)
  } catch {
    throw new Error("PDF_PARSE_FAILED: archivo PDF malformado o corrupto")
  }

  const totalPages = parsed.numpages ?? 0
  const fullText = parsed.text ?? ""

  // Heuristic: if the entire document yields very little text per page it's
  // likely a scanned (image-only) PDF. We never perform OCR; surface this
  // explicitly so the user knows chunks will be empty.
  const avgCharsPerPage = totalPages > 0 ? fullText.length / totalPages : fullText.length
  if (avgCharsPerPage < SCANNED_PDF_MIN_CHARS_PER_PAGE && totalPages > 0) {
    return {
      chunks: [],
      pageCount: totalPages,
      mimeType: "application/pdf",
      scannedPdfDetected: true,
    }
  }

  // Best-effort page-level chunking using form-feed characters (pdfjs convention).
  // If the parser doesn't emit per-page text, fall back to splitting the full text.
  const pageTexts: string[] = parsed.text_per_page ?? fullText.split("\f")
  const allChunks: ExtractedChunk[] = []
  let globalIndex = 0

  for (let pageIdx = 0; pageIdx < pageTexts.length; pageIdx++) {
    const pageText = (pageTexts[pageIdx] ?? "").trim()
    if (!pageText) continue

    const pageChunks = splitIntoChunks(
      pageText,
      { page: pageIdx + 1 },
      globalIndex,
    )
    allChunks.push(...pageChunks)
    globalIndex += pageChunks.length
  }

  return {
    chunks: mergeSmallChunks(allChunks).map((c, i) => ({ ...c, chunkIndex: i })),
    pageCount: totalPages,
    mimeType: "application/pdf",
  }
}

// ─── CSV / XLSX extraction ────────────────────────────────────────────────────

const ROWS_PER_CHUNK = 50

export async function extractSpreadsheet(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  const XLSX = await import("xlsx")

  let workbook: ReturnType<typeof XLSX.read>
  try {
    workbook = XLSX.read(buffer, { type: "buffer" })
  } catch {
    throw new Error("SPREADSHEET_PARSE_FAILED: archivo CSV/XLSX malformado o corrupto")
  }

  const allChunks: ExtractedChunk[] = []
  let totalRows = 0
  let globalIndex = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    // Convert sheet to array of arrays (headers included)
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
    if (rows.length === 0) continue

    const headers = (rows[0] as unknown[]).map(String)

    // Process in batches of ROWS_PER_CHUNK data rows
    for (let batchStart = 1; batchStart < rows.length; batchStart += ROWS_PER_CHUNK) {
      const batchEnd = Math.min(batchStart + ROWS_PER_CHUNK, rows.length)
      const batchRows = rows.slice(batchStart, batchEnd)

      // Format each row as "header: value" pairs, one row per line
      const lines = batchRows
        .map((row) =>
          headers
            .map((h, j) => `${h}: ${row[j] ?? ""}`)
            .join(" | ")
        )
        .join("\n")

      if (lines.trim().length === 0) continue

      allChunks.push({
        chunkIndex: globalIndex++,
        content: lines,
        locationRef: {
          sheet: sheetName,
          row_start: batchStart,
          row_end: batchEnd - 1,
        },
      })

      totalRows += batchRows.length
    }
  }

  return {
    chunks: allChunks,
    rowCount: totalRows,
    mimeType,
  }
}

// ─── Dispatch by MIME type ────────────────────────────────────────────────────

export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  if (mimeType === "application/pdf") {
    return extractPdf(buffer)
  }

  if (
    mimeType === "text/csv" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return extractSpreadsheet(buffer, mimeType)
  }

  if (mimeType === "text/plain") {
    const text = buffer.toString("utf-8")
    const chunks = splitIntoChunks(text, {})
    return { chunks: mergeSmallChunks(chunks).map((c, i) => ({ ...c, chunkIndex: i })), mimeType }
  }

  throw new Error(`UNSUPPORTED_MIME: ${mimeType}`)
}
