import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDocumentsCollection } from '../../embedding';

export const listDocuments = createTool({
  id: 'list-documents',
  description:
    'List available documents in the knowledge base with content previews. ' +
    'Returns document IDs, filenames, chunk counts per type, and a brief content preview. ' +
    'Use this to understand what documents are available before searching.',
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe('Maximum number of documents to return (default 50)'),
  }),
  outputSchema: z.object({
    documents: z.array(
      z.object({
        documentId: z.string(),
        sourceFile: z.string(),
        textChunks: z.number(),
        tableChunks: z.number(),
        imageChunks: z.number(),
        totalChunks: z.number(),
        preview: z.string(),
      }),
    ),
    totalDocuments: z.number(),
  }),
  execute: async ({ limit }) => {
    try {
      console.log("--------------------------------");
      console.log("[listDocuments] Listing documents");
      console.log("--------------------------------");
      const collection = await getDocumentsCollection();

      // Fetch all metadatas + documents to aggregate by document
      const results = await collection.get({
        include: ['metadatas', 'documents'],
      });

      if (!results.ids?.length) {
        return { documents: [], totalDocuments: 0 };
      }

      // Aggregate by document_id
      const docMap = new Map<
        string,
        {
          sourceFile: string;
          textChunks: number;
          tableChunks: number;
          imageChunks: number;
          preview: string;
        }
      >();

      const metadatas = results.metadatas ?? [];
      const chromaDocs = results.documents ?? [];

      for (let i = 0; i < metadatas.length; i++) {
        const meta = metadatas[i];
        if (!meta) continue;
        const docId = String(meta.document_id || 'unknown');
        const sourceFile = String(meta.source_file || 'unknown');
        const type = String(meta.type || 'text');

        if (!docMap.has(docId)) {
          docMap.set(docId, { sourceFile, textChunks: 0, tableChunks: 0, imageChunks: 0, preview: '' });
        }

        const doc = docMap.get(docId)!;
        if (type === 'text') {
          doc.textChunks++;
          // Use the first text chunk's content as preview
          if (!doc.preview && chromaDocs[i]) {
            doc.preview = String(chromaDocs[i]).slice(0, 200);
          }
        } else if (type === 'table') doc.tableChunks++;
        else if (type === 'image') doc.imageChunks++;
      }

      // Convert to array and apply limit
      const docList = Array.from(docMap.entries())
        .slice(0, limit ?? 50)
        .map(([documentId, info]) => ({
          documentId,
          sourceFile: info.sourceFile,
          textChunks: info.textChunks,
          tableChunks: info.tableChunks,
          imageChunks: info.imageChunks,
          totalChunks: info.textChunks + info.tableChunks + info.imageChunks,
          preview: info.preview,
        }));

      return {
        documents: docList,
        totalDocuments: docMap.size,
      };
    } catch (err) {
      return { documents: [], totalDocuments: 0 };
    }
  },
});
