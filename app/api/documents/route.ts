import { NextResponse } from 'next/server';
import { getAllWebDocuments } from '@/src/db/webDocuments';

export async function GET() {
  try {
    const documents = await getAllWebDocuments();

    return NextResponse.json(
      documents.map((doc) => ({
        id: doc._id!.toString(),
        fileName: doc.fileName,
        status: doc.status,
        error: doc.error,
        chunkCounts: doc.chunkCounts,
        createdAt: doc.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    console.error('List documents error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 },
    );
  }
}
