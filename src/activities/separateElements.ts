import { fetchRawElements, saveSeparatedElements } from '../db/ingestion';
import type { UnstructuredElement } from '../types/ingestion';

const TEXT_TYPES = new Set([
  'narrativetext',
  'title',
  'listitem',
  'uncategorizedtext',
  'figurecaption',
  'codesnippet',
  'address',
  'emailaddress',
  'formula',
]);

const DROP_TYPES = new Set(['header', 'footer', 'pagebreak', 'pagenumber']);

/**
 * Activity 2: Separate raw elements into text, table, and image buckets.
 * Drops headers, footers, page breaks, page numbers, and empty elements.
 */
export async function separateElements(documentId: string): Promise<string> {
  const rawElements = await fetchRawElements(documentId);

  const textElements: UnstructuredElement[] = [];
  const tableElements: UnstructuredElement[] = [];
  const imageElements: UnstructuredElement[] = [];

  for (const el of rawElements) {
    const type = (el.type || '').toLowerCase();

    // Drop entirely
    if (DROP_TYPES.has(type)) continue;

    // Images: keep if they have base64 data or text content
    if (type === 'image') {
      if (el.metadata?.image_base64 || (el.text && el.text.trim())) {
        imageElements.push(el);
      }
      continue;
    }

    // Tables: must have text_as_html
    if (type === 'table') {
      if (el.metadata?.text_as_html) {
        tableElements.push(el);
      }
      continue;
    }

    // Text elements: must be a recognized text type and have non-empty text
    if (TEXT_TYPES.has(type)) {
      if (el.text && el.text.trim()) {
        textElements.push(el);
      }
      continue;
    }

    // Unknown types with non-empty text go to text bucket
    if (el.text && el.text.trim()) {
      textElements.push(el);
    }
  }

  await saveSeparatedElements(documentId, { textElements, tableElements, imageElements });

  return documentId;
}
