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
 * Split text into sentences (on ". " or ".\n").
 */
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  const parts = text.split(/(?<=\.)\s+/);
  for (const part of parts) {
    if (part.trim()) sentences.push(part.trim());
  }
  return sentences;
}

/**
 * Build fixed-size chunks with overlap from cleaned pages.
 */
function buildChunks(
  pages: CleanedPage[],
  chunkSize: number,
  overlapSize: number,
): ProcessedChunk[] {
  if (pages.length === 0) return [];

  // Concatenate all pages with double newlines, tracking page boundaries
  const pageBreaks: { offset: number; pageNumber: number }[] = [];
  let fullText = '';
  for (const page of pages) {
    pageBreaks.push({ offset: fullText.length, pageNumber: page.pageNumber });
    if (fullText) fullText += '\n\n';
    fullText += page.cleanedText;
  }

  // Split into sentences
  const sentences = splitSentences(fullText);
  if (sentences.length === 0) return [];

  const chunks: ProcessedChunk[] = [];
  let chunkIndex = 0;
  let sentenceIndex = 0;

  while (sentenceIndex < sentences.length) {
    // Build a chunk up to chunkSize tokens
    const chunkSentences: string[] = [];
    let tokenCount = 0;

    while (sentenceIndex < sentences.length) {
      const sentenceTokens = estimateTokens(sentences[sentenceIndex]);
      if (tokenCount > 0 && tokenCount + sentenceTokens > chunkSize) break;
      chunkSentences.push(sentences[sentenceIndex]);
      tokenCount += sentenceTokens;
      sentenceIndex++;
    }

    const chunkText = chunkSentences.join(' ');
    if (!chunkText.trim()) continue;

    // Find page range for this chunk by matching text position in fullText
    const chunkStart = fullText.indexOf(chunkSentences[0]);
    const chunkEnd = chunkStart + chunkText.length;
    let startPage = pages[0].pageNumber;
    let endPage = pages[pages.length - 1].pageNumber;

    for (let i = pageBreaks.length - 1; i >= 0; i--) {
      if (pageBreaks[i].offset <= chunkStart) {
        startPage = pageBreaks[i].pageNumber;
        break;
      }
    }
    for (let i = pageBreaks.length - 1; i >= 0; i--) {
      if (pageBreaks[i].offset <= chunkEnd) {
        endPage = pageBreaks[i].pageNumber;
        break;
      }
    }

    chunks.push({
      id: crypto.randomUUID(),
      text: chunkText,
      metadata: {
        chunkIndex,
        startPage,
        endPage,
        tokenCount: estimateTokens(chunkText),
        type: 'text',
      },
    });

    chunkIndex++;

    // Back up by overlap amount of tokens for the next chunk
    if (sentenceIndex < sentences.length && overlapSize > 0) {
      let overlapTokens = 0;
      let backtrack = sentenceIndex - 1;
      while (backtrack >= 0 && overlapTokens < overlapSize) {
        overlapTokens += estimateTokens(sentences[backtrack]);
        backtrack--;
      }
      sentenceIndex = Math.max(backtrack + 1, sentenceIndex - 1);
    }
  }

  return chunks;
}

/**
 * Activity 4: Chunk cleaned text into fixed-size overlapping chunks.
 * Default: 600 tokens per chunk, 80 token overlap.
 */
export async function chunkText(
  documentId: string,
  chunkSize: number = 600,
  overlapSize: number = 80,
): Promise<string> {
  const cleanedPages = await fetchCleanedPages(documentId);

  const nonEmpty = cleanedPages.filter((p) => p.cleanedText.trim());
  const chunks = buildChunks(nonEmpty, chunkSize, overlapSize);

  await saveTextChunks(documentId, chunks);

  return documentId;
}
