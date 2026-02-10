import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { MONGODB_URI, MONGODB_DB_NAME } from '../env';
import { Section } from '../extraction/lib';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export interface ExtractedDocument {
  _id?: ObjectId;
  sections: Section[];
  createdAt: Date;
  updatedAt: Date;
  status: 'parsed' | 'enriched' | 'embedded' | 'completed';
  filePath?: string;
}

/**
 * Connect to MongoDB and return the database instance.
 * Reuses connection if already established.
 */
export async function connectToDatabase(): Promise<Db> {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const dbName = MONGODB_DB_NAME || 'document_extraction';
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return db;
}

/**
 * Get the extracted_documents collection
 */
export async function getExtractedDocumentsCollection(): Promise<Collection<ExtractedDocument>> {
  const db = await connectToDatabase();
  return db.collection<ExtractedDocument>('extracted_documents');
}

/**
 * Save parsed sections to MongoDB and return the document ID
 */
export async function saveExtractedDocument(
  sections: Section[],
  filePath?: string,
): Promise<string> {
  const collection = await getExtractedDocumentsCollection();

  const doc: Omit<ExtractedDocument, '_id'> = {
    sections,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'parsed',
    filePath,
  };

  const result = await collection.insertOne(doc);
  return result.insertedId.toString();
}

/**
 * Update sections in an existing document
 */
export async function updateExtractedDocument(
  documentId: string,
  sections: Section[],
  status: ExtractedDocument['status'],
): Promise<void> {
  const collection = await getExtractedDocumentsCollection();

  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: {
        sections,
        updatedAt: new Date(),
        status,
      },
    },
  );
}

/**
 * Fetch sections from MongoDB by document ID
 */
export async function fetchExtractedDocument(documentId: string): Promise<Section[]> {
  const collection = await getExtractedDocumentsCollection();

  const doc = await collection.findOne({ _id: new ObjectId(documentId) });

  if (!doc) {
    throw new Error(`Document with ID ${documentId} not found`);
  }

  return doc.sections;
}

/**
 * Close MongoDB connection (for cleanup)
 */
export async function closeConnection(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}
