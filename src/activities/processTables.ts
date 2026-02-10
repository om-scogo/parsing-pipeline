import * as crypto from 'crypto';
import { generateText } from 'ai';
import { getModel } from '../extraction/ai';
import { fetchTableElements, saveTableChunks } from '../db/ingestion';
import type { UnstructuredElement, ProcessedChunk } from '../types/ingestion';

const TABLE_SUMMARY_PROMPT = `You receive an HTML table extracted from a document. Describe this table in natural language.

Include:
- What the table represents (its purpose/topic)
- Column headers and what they measure
- Key data points, trends, or notable values
- Number of rows/columns if relevant

Write 2-4 sentences. Be specific about the data — mention actual numbers, names, and categories from the table. This description will be used for search retrieval, so include the key terms someone might search for.`;

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
 * Summarize a single table element.
 */
async function summarizeTable(el: UnstructuredElement): Promise<ProcessedChunk> {
  const htmlContent = el.metadata.text_as_html || '';
  let summary: string;

  try {
    const { text } = await generateText({
      model: getModel(),
      prompt: `${TABLE_SUMMARY_PROMPT}\n\n--- TABLE HTML ---\n${htmlContent.slice(0, 8000)}`,
    });
    summary = text.trim();
  } catch (err) {
    console.warn(`Failed to summarize table ${el.element_id}:`, err);
    // Fallback: use raw text from the table element
    summary = el.text || 'Table content unavailable';
  }

  const pageNumber = typeof el.metadata.page_number === 'number' ? el.metadata.page_number : 0;

  return {
    id: crypto.randomUUID(),
    text: summary,
    metadata: {
      chunkIndex: 0,
      startPage: pageNumber,
      endPage: pageNumber,
      tokenCount: Math.ceil(summary.split(/\s+/).filter(Boolean).length * 1.3),
      type: 'table',
      htmlContent,
      summary,
      pageNumber,
    },
  };
}

/**
 * Activity 5: Process table elements — summarize each table via LLM.
 * Stores both the summary (for embedding) and original HTML (for display).
 */
export async function processTables(documentId: string, concurrencyLimit: number = 5): Promise<string> {
  const tableElements = await fetchTableElements(documentId);

  if (tableElements.length === 0) {
    await saveTableChunks(documentId, []);
    return documentId;
  }

  const chunks = await withConcurrency(tableElements, concurrencyLimit, summarizeTable);

  // Assign sequential chunk indices
  chunks.forEach((chunk, i) => {
    chunk.metadata.chunkIndex = i;
  });

  await saveTableChunks(documentId, chunks);

  return documentId;
}
