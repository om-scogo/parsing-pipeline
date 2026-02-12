import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { PdfIngestionInput } from '../types/ingestion';

// Extract & separate: moderate timeout
const { extractPdf, separateElements } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 2,
  },
});

// Pure computation activities: fast
const { chunkText } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 2,
  },
});

// LLM-dependent activities: longer timeout, more retries
const { cleanText, processTables, processImages } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

// Embedding activity
const { embedChunks } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

// Store activity
const { storeChunks } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 2,
  },
});

/**
 * PDF Ingestion Workflow: orchestrates the full pipeline from PDF extraction to vector DB storage.
 *
 * Pipeline:
 *   1. Extract PDF via unstructured.io
 *   2. Separate elements into text/table/image buckets
 *   3. Clean text via LLM
 *   4. Chunk cleaned text
 *   5. Process tables (LLM summarization) \  in parallel
 *   6. Process images (LLM description)   /
 *   7. Embed all chunks
 *   8. Store in ChromaDB
 */
export async function pdfIngestion(input: PdfIngestionInput) {
  const { filePath, chunkSize, chunkOverlap, processImages: shouldProcessImages = true, concurrencyLimit } = input;

  // Step 1: Extract PDF via unstructured.io → MongoDB
  console.log('Step 1: Extracting PDF');
  const documentId = await extractPdf(filePath);
  console.log(`Document created with ID: ${documentId}`);

  // Step 2: Separate elements into text/table/image buckets
  console.log('Step 2: Separating elements');
  await separateElements(documentId);

  // Step 3: Clean text via LLM
  console.log('Step 3: Cleaning text');
  await cleanText(documentId, concurrencyLimit ?? 5);

  // Step 4: Chunk cleaned text
  console.log('Step 4: Chunking text');
  await chunkText(documentId);

  // Step 5 & 6: Process tables and images in parallel
  console.log('Step 5/6: Processing tables and images');
  const parallelTasks: Promise<string>[] = [processTables(documentId, concurrencyLimit ?? 5)];

  if (shouldProcessImages) {
    parallelTasks.push(processImages(documentId, concurrencyLimit ?? 5));
  }

  await Promise.all(parallelTasks);

  // Step 7: Embed all chunks
  console.log('Step 7: Embedding chunks');
  await embedChunks(documentId);

  // Step 8: Store in ChromaDB
  console.log('Step 8: Storing in vector DB');
  await storeChunks(documentId);

  console.log('PDF ingestion completed');
  return { documentId, status: 'completed' };
}
