import { NextRequest, NextResponse } from 'next/server';
import { getWebDocument } from '@/src/db/webDocuments';
import { fetchChunksByIds } from '@/src/db/ingestion';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string; imageRef: string }> },
) {
  try {
    const { documentId, imageRef } = await params;
    const doc = await getWebDocument(documentId);

    if (!doc?.ingestionDocumentId) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Try to find the image chunk by ID in MongoDB
    const chunks = await fetchChunksByIds(doc.ingestionDocumentId, [imageRef]);
    if (!chunks.length) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const chunk = chunks[0];
    // If the chunk has base64 image data in metadata, serve it
    const base64Data = chunk.metadata?.description;
    if (base64Data && base64Data.startsWith('data:image')) {
      const [header, data] = base64Data.split(',');
      const mimeMatch = header.match(/data:(.*);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const buffer = Buffer.from(data, 'base64');
      return new Response(buffer, {
        headers: { 'Content-Type': mime },
      });
    }

    return NextResponse.json({ error: 'Image data not available' }, { status: 404 });
  } catch (err) {
    console.error('Image fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
