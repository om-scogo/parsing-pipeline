import { embedTexts } from '../embedding';
import { fetchAllChunks, saveEmbeddedChunks, updateIngestionStatus } from '../db/ingestion';
import type { ProcessedChunk } from '../types/ingestion';

/**
 * Activity 7: Embed all chunks (text, table, image) in batches.
 * Uses the existing text-embedding-3-small model via AI SDK.
 */
export async function embedChunks(documentId: string, batchSize: number = 100): Promise<string> {
  const chunks = await fetchAllChunks(documentId);

  if (chunks.length === 0) {
    await updateIngestionStatus(documentId, 'embedded');
    return documentId;
  }

  // Embed in batches
  const embeddedChunks: ProcessedChunk[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.text);
    const embeddings = await embedTexts(texts);

    for (let j = 0; j < batch.length; j++) {
      embeddedChunks.push({
        ...batch[j],
        embedding: embeddings[j],
      });
    }
  }

  await saveEmbeddedChunks(documentId, embeddedChunks);

  return documentId;
}
