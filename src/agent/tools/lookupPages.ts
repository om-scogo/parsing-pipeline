import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getChromaChunksByFilter,
  htmlTableToMarkdown,
} from '../utils/queryChroma';
import { fetchChunksByIds } from '../../db/ingestion';

const MAX_TABLE_MARKDOWN_LENGTH = 5000;

export const lookupPages = createTool({
  id: 'lookup-pages',
  description:
    'Retrieve ALL content from specific pages of a document. ' +
    'Use this when a search result references something on a specific page and you need full context, ' +
    'or when you need to see everything on certain pages. Works at the page level.',
  inputSchema: z.object({
    pages: z
      .array(z.number().int().min(1))
      .min(1)
      .max(20)
      .describe('Array of page numbers to retrieve (1-20 pages)'),
    includeTypes: z
      .array(z.enum(['text', 'table', 'image']))
      .optional()
      .describe('Filter to specific chunk types. Default: all types.'),
  }),
  outputSchema: z.object({
    sourceFile: z.string(),
    pages: z.array(
      z.object({
        pageNumber: z.number(),
        chunks: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            type: z.string(),
            metadata: z.record(z.unknown()),
          }),
        ),
      }),
    ),
    totalChunks: z.number(),
  }),
  execute: async ({ pages, includeTypes }) => {
    try {
      console.log('--------------------------------');
      console.log('[lookupPages] Pages:', pages);
      console.log('--------------------------------');

      if (pages.length === 0) {
        return { sourceFile: '', pages: [], totalChunks: 0 };
      }

      const minPage = Math.min(...pages);
      const maxPage = Math.max(...pages);

      // Build filter: page range overlap
      const conditions: Record<string, unknown>[] = [
        { start_page: { $lte: maxPage } },
        { end_page: { $gte: minPage } },
      ];

      if (includeTypes && includeTypes.length > 0) {
        if (includeTypes.length === 1) {
          conditions.push({ type: includeTypes[0] });
        } else {
          conditions.push({ type: { $in: includeTypes } });
        }
      }

      const allChunks = await getChromaChunksByFilter(
        { $and: conditions } as any,
        200,
      );

      // Filter to chunks that actually overlap with requested pages
      const pageSet = new Set(pages);
      const relevantChunks = allChunks.filter((c) => {
        for (let p = c.metadata.startPage; p <= c.metadata.endPage; p++) {
          if (pageSet.has(p)) return true;
        }
        return false;
      });

      // Enrich table chunks with markdown from MongoDB
      const tableChunks = relevantChunks.filter((c) => c.type === 'table');
      const htmlByChunkId = new Map<string, string>();

      if (tableChunks.length > 0) {
        // Group table chunks by their document ID for batch lookup
        const docChunkMap = new Map<string, string[]>();
        for (const c of tableChunks) {
          const docId = c.metadata.documentId;
          if (docId) {
            const ids = docChunkMap.get(docId) ?? [];
            ids.push(c.id);
            docChunkMap.set(docId, ids);
          }
        }
        for (const [docId, chunkIds] of docChunkMap) {
          try {
            const mongoChunks = await fetchChunksByIds(docId, chunkIds);
            for (const chunk of mongoChunks) {
              if (chunk.metadata.htmlContent) {
                htmlByChunkId.set(chunk.id, chunk.metadata.htmlContent);
              }
            }
          } catch {
            // MongoDB lookup failed — continue without HTML
          }
        }
      }

      // Determine source file
      const sourceFile = relevantChunks[0]?.metadata.sourceFile ?? '';

      // Group by page and sort
      const pageMap = new Map<number, typeof relevantChunks>();
      for (const chunk of relevantChunks) {
        // Add chunk to each page it spans
        for (let p = chunk.metadata.startPage; p <= chunk.metadata.endPage; p++) {
          if (!pageSet.has(p)) continue;
          const existing = pageMap.get(p) ?? [];
          existing.push(chunk);
          pageMap.set(p, existing);
        }
      }

      // Build output sorted by page number
      const pageResults = Array.from(pageSet)
        .sort((a, b) => a - b)
        .map((pageNumber) => {
          const chunks = (pageMap.get(pageNumber) ?? [])
            .sort((a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex);

          // Dedupe chunks within a page (a chunk spanning multiple requested pages appears once)
          const seen = new Set<string>();
          const dedupedChunks = chunks.filter((c) => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          });

          return {
            pageNumber,
            chunks: dedupedChunks.map((c) => {
              const html = htmlByChunkId.get(c.id);
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
                id: c.id,
                content: c.content, // Full content — no truncation
                type: c.type,
                metadata: {
                  startPage: c.metadata.startPage,
                  endPage: c.metadata.endPage,
                  ...(c.metadata.summary && { summary: c.metadata.summary }),
                  ...(tableMarkdown && { tableMarkdown }),
                  ...(tableHtml && { tableHtml }),
                  ...(c.type === 'image' && c.metadata.description && {
                    imageDescription: c.metadata.description,
                  }),
                  ...(c.type === 'image' && { imageRef: c.id }),
                },
              };
            }),
          };
        });

      const totalChunks = pageResults.reduce((sum, p) => sum + p.chunks.length, 0);

      return {
        sourceFile,
        pages: pageResults,
        totalChunks,
      };
    } catch (err) {
      console.error('[lookupPages] Error:', err);
      return {
        sourceFile: '',
        pages: [],
        totalChunks: 0,
      };
    }
  },
});
