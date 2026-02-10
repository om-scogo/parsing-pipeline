import * as crypto from 'crypto';
import type { Metadata } from 'chromadb';
import { addDocuments, type DocumentsCollectionPayload } from '../embedding';
import { fetchAllChunks, fetchIngestionFilePath, updateIngestionStatus } from '../db/ingestion';
import type { ProcessedChunk } from '../types/ingestion';

// ChromaDB enforces a 4096-byte limit per metadata value.
// Set to true to include html_content in metadata (will fail for large tables).
const INCLUDE_HTML_IN_METADATA = false;
const METADATA_VALUE_MAX_BYTES = 4000; // leave headroom under 4096

function truncateToByteLimit(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf-8') <= maxBytes) return value;
  // Binary search for safe truncation point
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Buffer.byteLength(value.slice(0, mid), 'utf-8') <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return value.slice(0, lo);
}

/**
 * Build Chroma-compatible metadata from a ProcessedChunk.
 *
 * html_content is excluded by default because table HTML often exceeds
 * ChromaDB's 4096-byte metadata value limit. The full HTML is preserved
 * in MongoDB (tableChunks). Set INCLUDE_HTML_IN_METADATA = true to revert.
 */
function chunkToMetadata(chunk: ProcessedChunk, documentId: string, sourceFile: string): Metadata {
  const meta: Metadata = {
    type: chunk.metadata.type,
    chunk_index: chunk.metadata.chunkIndex,
    start_page: chunk.metadata.startPage,
    end_page: chunk.metadata.endPage,
    token_count: chunk.metadata.tokenCount,
    document_id: documentId,
    source_file: sourceFile,
  };
  if (chunk.metadata.pageNumber != null) meta.page_number = chunk.metadata.pageNumber;
  if (INCLUDE_HTML_IN_METADATA && chunk.metadata.htmlContent) {
    meta.html_content = truncateToByteLimit(chunk.metadata.htmlContent, METADATA_VALUE_MAX_BYTES);
  }
  if (chunk.metadata.summary) {
    meta.summary = truncateToByteLimit(chunk.metadata.summary, METADATA_VALUE_MAX_BYTES);
  }
  if (chunk.metadata.description) {
    meta.description = truncateToByteLimit(chunk.metadata.description, METADATA_VALUE_MAX_BYTES);
  }
  return meta;
}

/**
 * Activity 8: Store embedded chunks in ChromaDB vector store.
 * Reads embedded chunks from MongoDB and upserts them into ChromaDB.
 */
export async function storeChunks(documentId: string): Promise<string> {
  const chunks = await fetchAllChunks(documentId);
  const sourceFile = await fetchIngestionFilePath(documentId);

  if (chunks.length === 0) {
    await updateIngestionStatus(documentId, 'completed');
    return documentId;
  }

  // Filter chunks that have embeddings
  const embeddedChunks = chunks.filter((c) => c.embedding && c.embedding.length > 0);

  if (embeddedChunks.length === 0) {
    await updateIngestionStatus(documentId, 'completed');
    return documentId;
  }

  const payload: DocumentsCollectionPayload = {
    ids: embeddedChunks.map((c) => c.id || crypto.randomUUID()),
    embeddings: embeddedChunks.map((c) => c.embedding!),
    documents: embeddedChunks.map((c) => c.text),
    metadatas: embeddedChunks.map((c) => chunkToMetadata(c, documentId, sourceFile)),
  };

  await addDocuments(payload);
  await updateIngestionStatus(documentId, 'completed');

  return documentId;
}
