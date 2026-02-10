import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Where } from 'chromadb';
import { queryChroma } from '../utils/queryChroma';

const MAX_CONTENT_LENGTH = 1500;

export const searchDocuments = createTool({
  id: 'search-documents',
  description:
    'General-purpose vector search across all chunk types (text, table, image). ' +
    'Use this for broad searches when you are unsure what type of content is relevant. ' +
    'Returns results ranked by semantic similarity to the query.',
  inputSchema: z.object({
    query: z.string().describe('The search query in natural language'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .default(10)
      .describe('Number of results to return (default 10)'),
    documentId: z
      .string()
      .optional()
      .describe('Filter results to a specific document by its ID'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        type: z.string(),
        score: z.number(),
        metadata: z.record(z.unknown()),
      }),
    ),
    count: z.number(),
  }),
  execute: async ({ query, topK, documentId }) => {
    try {
      const where: Where | undefined = documentId
        ? { document_id: documentId }
        : undefined;

      const results = await queryChroma(query, topK ?? 10, where);

      return {
        results: results.map((r) => ({
          id: r.id,
          content: r.content.length > MAX_CONTENT_LENGTH
            ? r.content.slice(0, MAX_CONTENT_LENGTH) + '...'
            : r.content,
          type: r.type,
          score: r.score,
          metadata: {
            documentId: r.metadata.documentId,
            sourceFile: r.metadata.sourceFile,
            startPage: r.metadata.startPage,
            endPage: r.metadata.endPage,
            ...(r.metadata.summary && { summary: r.metadata.summary }),
            ...(r.metadata.description && { description: r.metadata.description }),
          },
        })),
        count: results.length,
      };
    } catch (err) {
      return {
        results: [],
        count: 0,
      };
    }
  },
});
