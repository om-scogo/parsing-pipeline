import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Where } from 'chromadb';
import { queryChroma, htmlTableToMarkdown } from '../utils/queryChroma';
import { fetchChunksByIds } from '../../db/ingestion';

const MAX_CONTENT_LENGTH = 1500;

export const searchByType = createTool({
  id: 'search-by-type',
  description:
    'Targeted vector search filtered to a specific chunk type. ' +
    'Use "text" for narrative content, "table" for structured data/tables (returns both summary and table data), ' +
    'or "image" for visual content descriptions. More focused than searchDocuments.',
  inputSchema: z.object({
    query: z.string().describe('The search query in natural language'),
    chunkType: z
      .enum(['text', 'table', 'image'])
      .describe('The type of content to search for'),
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
        tableMarkdown: z.string().optional(),
        tableHtml: z.string().optional(),
        imageDescription: z.string().optional(),
      }),
    ),
    count: z.number(),
  }),
  execute: async ({ query, chunkType, topK, documentId }) => {
    try {
      console.log("--------------------------------");
      console.log("[searchByType] Searching by type:", chunkType);
      console.log("--------------------------------");
      const where: Where = documentId
        ? { $and: [{ type: chunkType }, { document_id: documentId }] }
        : { type: chunkType };

      const results = await queryChroma(query, topK ?? 10, where);

      // For table chunks, enrich with HTML content from MongoDB
      let htmlByChunkId: Map<string, string> = new Map();
      if (chunkType === 'table' && results.length > 0) {
        // Group chunk IDs by document to batch MongoDB lookups
        const docChunkMap = new Map<string, string[]>();
        for (const r of results) {
          const docId = r.metadata.documentId;
          if (docId) {
            const ids = docChunkMap.get(docId) ?? [];
            ids.push(r.id);
            docChunkMap.set(docId, ids);
          }
        }

        // Fetch full chunks from MongoDB to get htmlContent
        for (const [docId, chunkIds] of docChunkMap) {
          try {
            const chunks = await fetchChunksByIds(docId, chunkIds);
            for (const chunk of chunks) {
              if (chunk.metadata.htmlContent) {
                htmlByChunkId.set(chunk.id, chunk.metadata.htmlContent);
              }
            }
          } catch {
            // MongoDB lookup failed — continue without HTML enrichment
          }
        }
      }

      return {
        results: results.map((r) => {
          const html = htmlByChunkId.get(r.id);
          return {
            id: r.id,
            content:
              r.content.length > MAX_CONTENT_LENGTH
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
            ...(html && {
              tableMarkdown: htmlTableToMarkdown(html),
              tableHtml: html.length > 3000 ? html.slice(0, 3000) + '...' : html,
            }),
            ...(chunkType === 'image' &&
              r.metadata.description && {
                imageDescription: r.metadata.description,
              }),
          };
        }),
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
