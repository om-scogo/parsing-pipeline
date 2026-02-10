import { NextRequest, NextResponse } from 'next/server';
import { Connection, Client } from '@temporalio/client';
import * as fs from 'fs';
import { getWebDocument, deleteWebDocument } from '@/src/db/webDocuments';
import { getDocumentsCollection } from '@/src/embedding';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const doc = await getWebDocument(documentId);

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Cancel Temporal workflow if still running
    if (doc.status === 'processing') {
      try {
        const connection = await Connection.connect({ address: 'localhost:7233' });
        const client = new Client({ connection });
        const handle = client.workflow.getHandle(doc.workflowId);
        await handle.cancel();
      } catch {
        // Workflow may already be done
      }
    }

    // Delete chunks from ChromaDB if document was ingested
    if (doc.ingestionDocumentId) {
      try {
        const collection = await getDocumentsCollection();
        const results = await collection.get({
          where: { document_id: doc.ingestionDocumentId },
        });
        if (results.ids?.length) {
          await collection.delete({ ids: results.ids });
        }
      } catch {
        // ChromaDB deletion failed — proceed
      }
    }

    // Remove uploaded file
    try {
      if (fs.existsSync(doc.filePath)) {
        fs.unlinkSync(doc.filePath);
      }
    } catch {
      // File deletion failed — proceed
    }

    // Delete tracking record
    await deleteWebDocument(documentId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 },
    );
  }
}
