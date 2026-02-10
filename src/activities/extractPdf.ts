import * as path from 'path';
import * as fs from 'fs';
import { UNSTRUCTERED_API_KEY } from '../env';
import { Unstructured } from '../extraction/unstructured';
import { createIngestionDocument, saveRawElements } from '../db/ingestion';

const PARSE_OPTIONS = {
  strategy: 'hi_res',
  coordinates: 'true',
  extract_image_block_types: '["Image", "Table"]',
} as const;

/**
 * Activity 1: Extract PDF via Unstructured API.
 * Creates an ingestion document in MongoDB, calls unstructured.io, and stores raw elements.
 * Returns the document ID for downstream activities.
 */
export async function extractPdf(filePath: string): Promise<string> {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const apiKey = UNSTRUCTERED_API_KEY;
  if (!apiKey) {
    throw new Error('UNSTRUCTERED_API_KEY is not set');
  }

  // Create ingestion document in MongoDB
  const documentId = await createIngestionDocument(resolved);

  // Parse via unstructured.io
  const unstrd = new Unstructured(apiKey);
  const rawElements = await unstrd.parseFile(resolved, PARSE_OPTIONS);

  // Store raw elements in MongoDB (can be 5MB+, too large for Temporal payloads)
  await saveRawElements(documentId, rawElements);

  return documentId;
}
