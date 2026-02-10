import { Connection, Client } from '@temporalio/client';
import { loadClientConnectConfig } from '@temporalio/envconfig';
import { documentExtraction } from './workflows';
import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Project root (parent of temporal/) — paths are relative to this
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function getFileFromArgs(): string | null {
  const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
  if (!fileArg) return null;
  return fileArg.slice('--file='.length).trim() || null;
}

async function run() {
  const inputFile = getFileFromArgs();
  if (!inputFile) {
    console.error('Usage: pnpm run workflow -- --file=<path>');
    process.exit(1);
  }

  const resolvedPath = path.isAbsolute(inputFile)
    ? inputFile
    : path.resolve(PROJECT_ROOT, inputFile);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const config = loadClientConnectConfig();
  const connection = await Connection.connect(config.connectionOptions);
  const client = new Client({ connection });

  const workflowId = 'extraction_' + nanoid();
  const handle = await client.workflow.start(documentExtraction, {
    taskQueue: 'extraction-flow',
    args: [resolvedPath],
    workflowId,
  });
  console.log(`Started workflow ${workflowId}`);
  const result = await handle.result();

  const fileName = `${crypto.randomUUID()}.json`;
  const filePath = path.join(process.cwd(), 'processed', fileName);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  console.log(`Processed output saved to ${filePath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
