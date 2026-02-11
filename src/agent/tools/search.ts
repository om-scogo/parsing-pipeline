import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Where } from 'chromadb';
import {
  expandQuery,
  extractKeyTerms,
  queryChromaMulti,
  keywordSearch,
  dedupeAndRerank,
  htmlTableToMarkdown,
} from '../utils/queryChroma';
import { fetchChunksByIds } from '../../db/ingestion';

const MAX_CONTENT_LENGTH = 1500;
const MAX_TABLE_MARKDOWN_LENGTH = 5000;
const TOP_FULL_CONTENT = 5;

export const search = createTool({
  id: 'search',
  description:
    'Search the knowledge base using multi-query expansion and hybrid search. ' +
    'Handles synonym variation, keyword matching, and cross-type search internally. ' +
    'Use this as the primary search tool — one call covers far more ground than a single-shot search. ' +
    'Optionally filter by chunk types (text, table, image).',
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
    types: z
      .array(z.enum(['text', 'table', 'image']))
      .optional()
      .describe('Filter to specific chunk types. If omitted, search all types.'),
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
    queriesUsed: z.array(z.string()),
  }),
  execute: async ({ query, topK, types }) => {
    try {
      console.log('--------------------------------');
      console.log('[search] Multi-query hybrid search:', query);
      console.log('--------------------------------');

      // 1. Query expansion — generate variations via LLM
      const variations = await expandQuery(query);
      const allQueries = [query, ...variations];

      // 2. Build where filter
      const conditions: Where[] = [];
      if (types && types.length > 0) {
        if (types.length === 1) {
          conditions.push({ type: types[0] });
        } else {
          conditions.push({ type: { $in: types } });
        }
      }

      let where: Where | undefined;
      if (conditions.length === 1) {
        where = conditions[0];
      } else if (conditions.length > 1) {
        where = { $and: conditions };
      }

      // 3. Vector search with all query variations
      const vectorResults = await queryChromaMulti(allQueries, topK ?? 10, where);

      // 4. Keyword search
      const keyTerms = extractKeyTerms(query);
      let kwResults: Awaited<ReturnType<typeof keywordSearch>> = [];
      if (keyTerms.length > 0) {
        try {
          kwResults = await keywordSearch(keyTerms, where);
        } catch {
          // Keyword search failed — continue with vector results only
        }
      }

      // 5. Deduplicate and re-rank
      const ranked = dedupeAndRerank(vectorResults, kwResults, allQueries.length);
      const finalResults = ranked.slice(0, topK ?? 10);

      // 6. Enrich table chunks with markdown from MongoDB
      const tableChunks = finalResults.filter((r) => r.type === 'table');
      const htmlByChunkId = new Map<string, string>();

      if (tableChunks.length > 0) {
        const docChunkMap = new Map<string, string[]>();
        for (const r of tableChunks) {
          const docId = r.metadata.documentId;
          if (docId) {
            const ids = docChunkMap.get(docId) ?? [];
            ids.push(r.id);
            docChunkMap.set(docId, ids);
          }
        }

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

      // 7. Format results — full content for top 5, truncated for rest
      const results = finalResults.map((r, idx) => {
        const html = htmlByChunkId.get(r.id);
        const isTopResult = idx < TOP_FULL_CONTENT;
        const content = isTopResult
          ? r.content
          : r.content.length > MAX_CONTENT_LENGTH
            ? r.content.slice(0, MAX_CONTENT_LENGTH) + '...'
            : r.content;

        let tableMarkdown: string | undefined;
        let tableHtml: string | undefined;
        if (html) {
          const md = htmlTableToMarkdown(html);
          tableMarkdown = md.length > MAX_TABLE_MARKDOWN_LENGTH
            ? md.slice(0, MAX_TABLE_MARKDOWN_LENGTH) + '...'
            : md;
          tableHtml = html.length > 5000 ? html.slice(0, 5000) + '...' : html;
        }

        return {
          id: r.id,
          content,
          type: r.type,
          score: r.score,
          metadata: {
            documentId: r.metadata.documentId,
            sourceFile: r.metadata.sourceFile,
            startPage: r.metadata.startPage,
            endPage: r.metadata.endPage,
            ...(r.metadata.summary && { summary: r.metadata.summary }),
            ...(tableMarkdown && { tableMarkdown }),
            ...(tableHtml && { tableHtml }),
            ...(r.type === 'image' && r.metadata.description && {
              imageDescription: r.metadata.description,
            }),
            ...(r.type === 'image' && {
              imageRef: r.id,
            }),
          },
        };
      });

      return {
        results,
        count: results.length,
        queriesUsed: allQueries,
      };
    } catch (err) {
      console.error('[search] Error:', err);
      return {
        results: [],
        count: 0,
        queriesUsed: [query],
      };
    }
  },
});
