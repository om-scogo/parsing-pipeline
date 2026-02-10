import * as crypto from 'crypto';
import { generateText } from 'ai';
import { getModel } from '../extraction/ai';
import { fetchImageElements, saveImageChunks } from '../db/ingestion';
import type { UnstructuredElement, ProcessedChunk } from '../types/ingestion';

const IMAGE_DESCRIPTION_PROMPT = `Describe this image extracted from a document. Focus on:
- What the image shows (chart, diagram, photo, screenshot, etc.)
- Key information conveyed (data points, labels, relationships)
- Any text visible in the image

Write 2-3 sentences. Be specific — this description will be used for search retrieval.`;

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
 * Describe a single image element via LLM vision or fallback to caption.
 */
async function describeImage(el: UnstructuredElement): Promise<ProcessedChunk> {
  const pageNumber = typeof el.metadata.page_number === 'number' ? el.metadata.page_number : 0;
  let description: string;

  if (el.metadata.image_base64) {
    try {
      const { text } = await generateText({
        model: getModel(),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: IMAGE_DESCRIPTION_PROMPT },
              { type: 'image', image: el.metadata.image_base64, mediaType: 'image/png' },
            ],
          },
        ],
      });
      description = text.trim();
    } catch (err) {
      console.warn(`Failed to describe image ${el.element_id}:`, err);
      description = el.text?.trim() || 'Image content unavailable';
    }
  } else {
    // No base64 data — use the text caption
    description = el.text?.trim() || 'Image content unavailable';
  }

  return {
    id: crypto.randomUUID(),
    text: description,
    metadata: {
      chunkIndex: 0,
      startPage: pageNumber,
      endPage: pageNumber,
      tokenCount: Math.ceil(description.split(/\s+/).filter(Boolean).length * 1.3),
      type: 'image',
      description,
      pageNumber,
    },
  };
}

/**
 * Activity 6: Process image elements — describe each via LLM vision.
 * Skippable via config (processImages flag in workflow input).
 */
export async function processImages(documentId: string, concurrencyLimit: number = 5): Promise<string> {
  const imageElements = await fetchImageElements(documentId);

  if (imageElements.length === 0) {
    await saveImageChunks(documentId, []);
    return documentId;
  }

  const chunks = await withConcurrency(imageElements, concurrencyLimit, describeImage);

  chunks.forEach((chunk, i) => {
    chunk.metadata.chunkIndex = i;
  });

  await saveImageChunks(documentId, chunks);

  return documentId;
}
