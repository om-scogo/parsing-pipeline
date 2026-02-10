import { Collection, ObjectId } from 'mongodb';
import { connectToDatabase } from './mongodb';

export interface WebDocument {
  _id?: ObjectId;
  fileName: string;
  filePath: string;
  workflowId: string;
  ingestionDocumentId?: string;
  status: 'processing' | 'ready' | 'failed';
  error?: string;
  chunkCounts?: {
    text: number;
    table: number;
    image: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

async function getWebDocumentsCollection(): Promise<Collection<WebDocument>> {
  const db = await connectToDatabase();
  return db.collection<WebDocument>('web_documents');
}

export async function createWebDocument(data: {
  fileName: string;
  filePath: string;
  workflowId: string;
}): Promise<string> {
  const collection = await getWebDocumentsCollection();
  const result = await collection.insertOne({
    ...data,
    status: 'processing',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return result.insertedId.toString();
}

export async function getWebDocument(id: string): Promise<WebDocument | null> {
  const collection = await getWebDocumentsCollection();
  return collection.findOne({ _id: new ObjectId(id) });
}

export async function getAllWebDocuments(): Promise<WebDocument[]> {
  const collection = await getWebDocumentsCollection();
  return collection.find().sort({ createdAt: -1 }).toArray();
}

export async function updateWebDocument(
  id: string,
  update: Partial<Pick<WebDocument, 'status' | 'error' | 'ingestionDocumentId' | 'chunkCounts'>>,
): Promise<void> {
  const collection = await getWebDocumentsCollection();
  await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } },
  );
}

export async function deleteWebDocument(id: string): Promise<void> {
  const collection = await getWebDocumentsCollection();
  await collection.deleteOne({ _id: new ObjectId(id) });
}
