import { generateText } from 'ai';
import { getModel } from '../extraction/ai';
import { fetchTextElements, saveCleanedPages } from '../db/ingestion';
import type { UnstructuredElement, CleanedPage } from '../types/ingestion';

const CLEANUP_PROMPT = `You are a document text cleaner. You receive raw extracted text from a PDF page. Your job is to clean it up and return only meaningful, readable content.

Rules:
- Fix obvious OCR errors (0/O confusion, l/1 confusion, broken words)
- Merge sentence fragments that were incorrectly split
- Remove garbled or nonsensical text that doesn't form readable content
- Remove table-of-contents entries (lines with dots/dashes leading to page numbers)
- Remove repeated header/footer text that appears on every page
- Remove page numbers, watermarks, and formatting artifacts
- Preserve ALL meaningful content exactly as written — do not summarize, paraphrase, or condense
- Maintain the original paragraph structure where possible
- If the entire input is garbage or contains no meaningful text, return exactly: EMPTY_PAGE

Return only the cleaned text. No explanations, no markdown formatting, no wrapper text.`;

/**
 * Run tasks with a concurrency limit.
 */
async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Group text elements by page number.
 */
function groupByPage(elements: UnstructuredElement[]): Map<number, string[]> {
  const pages = new Map<number, string[]>();
  for (const el of elements) {
    const pageNum = el.metadata?.page_number ?? 0;
    if (!pages.has(pageNum)) pages.set(pageNum, []);
    pages.get(pageNum)!.push(el.text);
  }
  return pages;
}

/**
 * Clean a single page's concatenated text via LLM.
 */
async function cleanPage(pageNumber: number, rawText: string): Promise<CleanedPage | null> {
  try {
    const { text } = await generateText({
      model: getModel(),
      prompt: `${CLEANUP_PROMPT}\n\n--- PAGE TEXT ---\n${rawText}`,
    });

    const cleaned = text.trim();
    if (!cleaned || cleaned === 'EMPTY_PAGE') return null;

    return { pageNumber, cleanedText: cleaned };
  } catch (err) {
    console.warn(`Failed to clean page ${pageNumber}:`, err);
    return null;
  }
}

/**
 * Activity 3: Clean text elements using LLM.
 * Groups text elements by page, sends each page to GPT-4o-mini for cleanup,
 * and stores the cleaned pages in MongoDB.
 */
export async function cleanText(documentId: string, concurrencyLimit: number = 5): Promise<string> {
  const textElements = await fetchTextElements(documentId);

  if (textElements.length === 0) {
    await saveCleanedPages(documentId, []);
    return documentId;
  }

  // Group by page number
  const pageGroups = groupByPage(textElements);

  // Build page entries for concurrent processing
  const pageEntries = Array.from(pageGroups.entries())
    .map(([pageNumber, texts]) => ({ pageNumber, rawText: texts.join('\n') }))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  // Process pages concurrently with limit
  const results = await withConcurrency(pageEntries, concurrencyLimit, (entry) =>
    cleanPage(entry.pageNumber, entry.rawText),
  );

  // Filter out null (empty/failed pages) and sort by page number
  const cleanedPages = results.filter((p): p is CleanedPage => p !== null).sort((a, b) => a.pageNumber - b.pageNumber);

  await saveCleanedPages(documentId, cleanedPages);

  return documentId;
}
