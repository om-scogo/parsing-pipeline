import { NextRequest, NextResponse } from 'next/server';
import { Connection, Client } from '@temporalio/client';
import { getWebDocument, updateWebDocument } from '@/src/db/webDocuments';
import { getDocumentsCollection } from '@/src/embedding';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const doc = await getWebDocument(documentId);

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // If already terminal, return cached status
    if (doc.status === 'ready' || doc.status === 'failed') {
      return NextResponse.json({
        documentId,
        status: doc.status,
        chunkCounts: doc.chunkCounts,
        error: doc.error,
      });
    }

    // Check Temporal workflow status
    try {
      const connection = await Connection.connect({ address: 'localhost:7233' });
      const client = new Client({ connection });
      const handle = client.workflow.getHandle(doc.workflowId);
      const description = await handle.describe();

      if (description.status.name === 'COMPLETED') {
        // Get the result to find the ingestion document ID
        const result = await handle.result() as { documentId: string; status: string };

        // Query ChromaDB for chunk counts
        let chunkCounts = { text: 0, table: 0, image: 0 };
        try {
          const collection = await getDocumentsCollection();
          const chromaResults = await collection.get({
            where: { document_id: result.documentId },
            include: ['metadatas'],
          });

          for (const meta of chromaResults.metadatas ?? []) {
            if (!meta) continue;
            const type = String(meta.type || 'text');
            if (type === 'text') chunkCounts.text++;
            else if (type === 'table') chunkCounts.table++;
            else if (type === 'image') chunkCounts.image++;
          }
        } catch {
          // ChromaDB query failed — proceed without counts
        }

        await updateWebDocument(documentId, {
          status: 'ready',
          ingestionDocumentId: result.documentId,
          chunkCounts,
        });

        return NextResponse.json({
          documentId,
          status: 'ready',
          chunkCounts,
        });
      }

      if (description.status.name === 'FAILED' || description.status.name === 'TERMINATED') {
        const errorMsg = description.status.name === 'FAILED' ? 'Ingestion workflow failed' : 'Workflow was terminated';
        await updateWebDocument(documentId, { status: 'failed', error: errorMsg });
        return NextResponse.json({
          documentId,
          status: 'failed',
          error: errorMsg,
        });
      }

      // Still running
      return NextResponse.json({ documentId, status: 'processing' });
    } catch {
      // Temporal query failed — return current DB status
      return NextResponse.json({ documentId, status: doc.status });
    }
  } catch (err) {
    console.error('Status check error:', err);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 },
    );
  }
}
