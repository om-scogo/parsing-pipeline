import { UNSTRUCTERED_API_KEY } from '../env';
import { Unstructured } from './unstructured';
import { Processor, enrichSectionsWithAI } from './process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function getFileFromArgs(): string | null {
    const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
    if (!fileArg) return null;
    return fileArg.slice('--file='.length).trim() || null;
}

async function main() {
    const inputFile = getFileFromArgs();
    if (!inputFile) {
        console.error('Usage: pnpm run extract -- --file=<path>');
        process.exit(1);
    }

    const resolvedPath = path.isAbsolute(inputFile) ? inputFile : path.resolve(process.cwd(), inputFile);
    if (!fs.existsSync(resolvedPath)) {
        console.error(`File not found: ${resolvedPath}`);
        process.exit(1);
    }
    console.log(`Processing file: ${resolvedPath}`);

    const unstrd = new Unstructured(UNSTRUCTERED_API_KEY || '');
    const processor = new Processor();

    try {
        const output = await unstrd.parseFile(resolvedPath, { strategy: 'hi_res', coordinates: 'true', extract_image_block_types: `["Image", "Table"]` });

        const sections = processor.process(output);
        const sectionsWithAI = await enrichSectionsWithAI(sections);

        const processedDir = path.join(process.cwd(), 'processed');
        if (!fs.existsSync(processedDir)) {
            fs.mkdirSync(processedDir, { recursive: true });
        }

        const fileName = `${crypto.randomUUID()}.json`;
        const filePath = path.join(processedDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(sectionsWithAI, null, 2));
        console.log(`Processed output saved to: ${filePath}`);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();