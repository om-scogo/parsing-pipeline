import { Collection, ObjectId } from 'mongodb';
import { connectToDatabase } from './mongodb';
import type {
  IngestionDocument,
  UnstructuredElement,
  SeparatedElements,
  CleanedPage,
  ProcessedChunk,
} from '../types/ingestion';

/**
 * Get the ingestion_documents collection.
 */
async function getIngestionCollection(): Promise<Collection<IngestionDocument & { _id?: ObjectId }>> {
  const db = await connectToDatabase();
  return db.collection('ingestion_documents');
}

/**
 * Create a new ingestion document and return its ID.
 */
export async function createIngestionDocument(filePath: string): Promise<string> {
  const collection = await getIngestionCollection();
  const result = await collection.insertOne({
    filePath,
    status: 'extracting',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return result.insertedId.toString();
}

/**
 * Save raw elements from unstructured.io extraction.
 */
export async function saveRawElements(documentId: string, elements: UnstructuredElement[]): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    { $set: { rawElements: elements, status: 'extracted', updatedAt: new Date() } },
  );
}

/**
 * Fetch raw elements for a document.
 */
export async function fetchRawElements(documentId: string): Promise<UnstructuredElement[]> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne({ _id: new ObjectId(documentId) }, { projection: { rawElements: 1 } });
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);
  return doc.rawElements || [];
}

/**
 * Save separated elements and clear raw elements to save space.
 */
export async function saveSeparatedElements(documentId: string, separated: SeparatedElements): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: {
        textElements: separated.textElements,
        tableElements: separated.tableElements,
        imageElements: separated.imageElements,
        status: 'separated',
        updatedAt: new Date(),
      },
      $unset: { rawElements: '' },
    },
  );
}

/**
 * Fetch text elements for a document.
 */
export async function fetchTextElements(documentId: string): Promise<UnstructuredElement[]> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne({ _id: new ObjectId(documentId) }, { projection: { textElements: 1 } });
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);
  return doc.textElements || [];
}

/**
 * Fetch table elements for a document.
 */
export async function fetchTableElements(documentId: string): Promise<UnstructuredElement[]> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne({ _id: new ObjectId(documentId) }, { projection: { tableElements: 1 } });
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);
  return doc.tableElements || [];
}

/**
 * Fetch image elements for a document.
 */
export async function fetchImageElements(documentId: string): Promise<UnstructuredElement[]> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne({ _id: new ObjectId(documentId) }, { projection: { imageElements: 1 } });
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);
  return doc.imageElements || [];
}

/**
 * Save cleaned pages and optionally clear text elements.
 */
export async function saveCleanedPages(documentId: string, pages: CleanedPage[]): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: { cleanedPages: pages, status: 'cleaned', updatedAt: new Date() },
    },
  );
}

/**
 * Fetch cleaned pages for a document.
 */
export async function fetchCleanedPages(documentId: string): Promise<CleanedPage[]> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne({ _id: new ObjectId(documentId) }, { projection: { cleanedPages: 1 } });
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);
  return doc.cleanedPages || [];
}

/**
 * Save text chunks.
 */
export async function saveTextChunks(documentId: string, chunks: ProcessedChunk[]): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: { textChunks: chunks, status: 'chunked', updatedAt: new Date() },
      $unset: { cleanedPages: '', textElements: '' },
    },
  );
}

/**
 * Save table chunks.
 */
export async function saveTableChunks(documentId: string, chunks: ProcessedChunk[]): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: { tableChunks: chunks, updatedAt: new Date() },
      $unset: { tableElements: '' },
    },
  );
}

/**
 * Save image chunks.
 */
export async function saveImageChunks(documentId: string, chunks: ProcessedChunk[]): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: { imageChunks: chunks, updatedAt: new Date() },
      $unset: { imageElements: '' },
    },
  );
}

/**
 * Fetch all chunks (text + table + image) for embedding.
 */
export async function fetchAllChunks(documentId: string): Promise<ProcessedChunk[]> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne(
    { _id: new ObjectId(documentId) },
    { projection: { textChunks: 1, tableChunks: 1, imageChunks: 1 } },
  );
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);
  return [...(doc.textChunks || []), ...(doc.tableChunks || []), ...(doc.imageChunks || [])];
}

/**
 * Save all embedded chunks (replaces text/table/image chunk fields with embedded versions).
 */
export async function saveEmbeddedChunks(documentId: string, chunks: ProcessedChunk[]): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: {
        textChunks: chunks.filter((c) => c.metadata.type === 'text'),
        tableChunks: chunks.filter((c) => c.metadata.type === 'table'),
        imageChunks: chunks.filter((c) => c.metadata.type === 'image'),
        status: 'embedded',
        updatedAt: new Date(),
      },
    },
  );
}

/**
 * Update ingestion document status.
 */
export async function updateIngestionStatus(documentId: string, status: string): Promise<void> {
  const collection = await getIngestionCollection();
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    { $set: { status, updatedAt: new Date() } },
  );
}

/**
 * Fetch specific chunks by their IDs from a given ingestion document.
 * Useful for retrieving full chunk data (including htmlContent for tables)
 * after a ChromaDB search returns chunk IDs and document_id from metadata.
 */
export async function fetchChunksByIds(
  documentId: string,
  chunkIds: string[],
): Promise<ProcessedChunk[]> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne(
    { _id: new ObjectId(documentId) },
    { projection: { textChunks: 1, tableChunks: 1, imageChunks: 1 } },
  );
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);

  const allChunks = [...(doc.textChunks || []), ...(doc.tableChunks || []), ...(doc.imageChunks || [])];
  const idSet = new Set(chunkIds);
  return allChunks.filter((c) => idSet.has(c.id));
}

/**
 * Fetch the file path for a document.
 */
export async function fetchIngestionFilePath(documentId: string): Promise<string> {
  const collection = await getIngestionCollection();
  const doc = await collection.findOne({ _id: new ObjectId(documentId) }, { projection: { filePath: 1 } });
  if (!doc) throw new Error(`Ingestion document ${documentId} not found`);
  return doc.filePath;
}
