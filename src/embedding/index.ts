import { CloudClient } from "chromadb";
import type { Metadata } from "chromadb";
import { embedMany } from "ai";
import { getEmbeddingModel } from "../extraction/ai";
import { CHROMA_API_KEY } from "../env";

export const client = new CloudClient({
  apiKey: CHROMA_API_KEY,
});

const DOCUMENTS_COLLECTION_NAME = "documents";

/**
 * Payload to add records to the documents collection (ids, embeddings, documents, metadatas).
 */
export interface DocumentsCollectionPayload {
  ids: string[];
  embeddings: number[][];
  documents: string[];
  metadatas: Metadata[];
}

/**
 * Embed a batch of texts using the AI SDK embedding model from extraction/ai (same provider/config as LLM).
 * Returns one embedding vector per input text.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = getEmbeddingModel();
  const { embeddings } = await embedMany({
    model,
    values: texts,
  });
  return embeddings;
}

/**
 * Get or create the Chroma collection named "documents".
 * No embedding function is attached; callers must pass pre-computed embeddings when adding.
 */
export async function getDocumentsCollection() {
  return client.getOrCreateCollection({
    name: DOCUMENTS_COLLECTION_NAME,
    embeddingFunction: null,
  });
}

/**
 * Add records to the "documents" collection.
 */
export async function addDocuments(payload: DocumentsCollectionPayload): Promise<void> {
  const collection = await getDocumentsCollection();
  await collection.add({
    ids: payload.ids,
    embeddings: payload.embeddings,
    documents: payload.documents,
    metadatas: payload.metadatas,
  });
}
