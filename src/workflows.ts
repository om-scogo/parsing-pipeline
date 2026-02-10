import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';

const { parseDocuments, addAISummary, embedDocuments, addDocumentsToVectorDB } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10 minutes',
    retry: {
      maximumAttempts: 2,
    },
  });

/** Document extraction: parse+process then enrich with AI, embed, and store in vector DB. */
export async function documentExtraction(filePath: string) {
  // Step 1: Parse and process the file, save to MongoDB
  console.log('Step 1: Parsing and processing the file');
  const documentId = await parseDocuments(filePath);
  if (!documentId) {
    console.error('Failed to parse and save document');
    throw new Error('Failed to parse and save document');
  }
  console.log(`Document saved with ID: ${documentId}`);

  // Step 2: Enrich the sections with AI
  console.log('Step 2: Enriching the sections with AI');
  await addAISummary(documentId);
  console.log('AI enrichment completed');

  // Step 3: Embed sections
  console.log('Step 3: Embedding documents');
  const { documentId: embeddedDocId, payload: embedPayload } = await embedDocuments(documentId);

  // Step 4: Add to vector DB
  if (embedPayload.ids.length > 0) {
    console.log('Step 4: Adding to documents collection');
    await addDocumentsToVectorDB(embeddedDocId, embedPayload);
    console.log('Successfully added to vector DB');
  }

  return { documentId, status: 'completed' };
}

