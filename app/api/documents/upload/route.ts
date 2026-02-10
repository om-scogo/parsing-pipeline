import { NextRequest, NextResponse } from 'next/server';
import { Connection, Client } from '@temporalio/client';
import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs';
import { createWebDocument } from '@/src/db/webDocuments';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = file.name.toLowerCase().split('.').pop();
    if (!ext || !['pdf', 'xlsx', 'csv', 'docx', 'doc'].includes(ext)) {
      return NextResponse.json({ error: 'Unsupported file type. Accepted: PDF, XLSX, CSV, DOCX, DOC' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 });
    }

    // Save file to uploads directory
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const fileId = nanoid();
    const fileName = file.name;
    const savedFileName = `${fileId}_${fileName}`;
    const filePath = path.join(UPLOADS_DIR, savedFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Start Temporal workflow
    const workflowId = `ingestion_${fileId}`;

    const connection = await Connection.connect({ address: 'localhost:7233' });
    const client = new Client({ connection });

    await client.workflow.start('pdfIngestion', {
      taskQueue: 'extraction-flow',
      args: [{ filePath, documentId: fileId }],
      workflowId,
    });

    // Create tracking record
    const documentId = await createWebDocument({
      fileName,
      filePath,
      workflowId,
    });

    return NextResponse.json({ documentId, status: 'processing' });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 },
    );
  }
}
