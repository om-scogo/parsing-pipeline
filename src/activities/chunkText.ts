import * as crypto from 'crypto';
import { fetchCleanedPages, saveTextChunks } from '../db/ingestion';
import type { ProcessedChunk, CleanedPage } from '../types/ingestion';

/**
 * Approximate token count: wordCount * 1.3
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

/**
 * Build one chunk per page from cleaned pages.
 */
function buildChunks(pages: CleanedPage[]): ProcessedChunk[] {
  return pages.map((page, index) => ({
    id: crypto.randomUUID(),
    text: page.cleanedText,
    metadata: {
      chunkIndex: index,
      startPage: page.pageNumber,
      endPage: page.pageNumber,
      tokenCount: estimateTokens(page.cleanedText),
      type: 'text' as const,
    },
  }));
}

/**
 * Activity 4: Chunk cleaned text by page — each page becomes one chunk.
 */
export async function chunkText(documentId: string): Promise<string> {
  const cleanedPages = await fetchCleanedPages(documentId);

  const nonEmpty = cleanedPages.filter((p) => p.cleanedText.trim());
  const chunks = buildChunks(nonEmpty);

  await saveTextChunks(documentId, chunks);

  return documentId;
}
