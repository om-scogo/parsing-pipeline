import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Where } from 'chromadb';
import {
  getChromaChunksByIds,
  queryChroma,
  htmlTableToMarkdown,
  parseHtmlTable,
} from '../utils/queryChroma';
import { fetchChunksByIds } from '../../db/ingestion';

const MAX_TABLE_MARKDOWN_LENGTH = 5000;

export const getTableData = createTool({
  id: 'get-table-data',
  description:
    'Get the actual structured data from a table chunk. ' +
    'Use this when you need specific values, numbers, or rows from a table — not just the summary. ' +
    'Two modes: (1) pass a chunkId from a previous search result, or ' +
    '(2) pass a query to find the most relevant table across all documents.',
  inputSchema: z.object({
    chunkId: z
      .string()
      .optional()
      .describe('Direct lookup by chunk ID from a previous search result'),
    query: z
      .string()
      .optional()
      .describe('Find the most relevant table matching this query'),
  }),
  outputSchema: z.object({
    chunkId: z.string(),
    documentId: z.string(),
    sourceFile: z.string(),
    pageNumber: z.number(),
    summary: z.string(),
    tableMarkdown: z.string(),
    tableHtml: z.string(),
    columns: z.array(z.string()),
    rowCount: z.number(),
    truncated: z.boolean().optional(),
    data: z.array(z.record(z.string())),
    error: z.string().optional(),
  }),
  execute: async ({ chunkId, query }) => {
    const emptyResult = {
      chunkId: '',
      documentId: '',
      sourceFile: '',
      pageNumber: 0,
      summary: '',
      tableMarkdown: '',
      tableHtml: '',
      columns: [],
      rowCount: 0,
      data: [],
    };

    try {
      console.log('--------------------------------');
      console.log('[getTableData] chunkId:', chunkId, 'query:', query);
      console.log('--------------------------------');

      // Validate input — need either chunkId or query
      if (!chunkId && !query) {
        return { ...emptyResult, error: 'Provide either chunkId or query.' };
      }

      let targetChunkId: string;
      let targetDocumentId: string;

      if (chunkId) {
        // Mode 1: Direct chunk lookup
        const [chunk] = await getChromaChunksByIds([chunkId]);
        if (!chunk) {
          return { ...emptyResult, error: `Chunk ${chunkId} not found.` };
        }
        if (chunk.type !== 'table') {
          return { ...emptyResult, error: `Chunk ${chunkId} is type "${chunk.type}", not a table.` };
        }
        targetChunkId = chunk.id;
        targetDocumentId = chunk.metadata.documentId;
      } else {
        // Mode 2: Search for best table across all documents
        const where: Where = { type: 'table' };
        const results = await queryChroma(query!, 1, where);
        if (results.length === 0) {
          return { ...emptyResult, error: `No table found matching "${query}".` };
        }
        targetChunkId = results[0].id;
        targetDocumentId = results[0].metadata.documentId;
      }

      // Fetch chunk metadata from ChromaDB
      const [chromaChunk] = await getChromaChunksByIds([targetChunkId]);
      if (!chromaChunk) {
        return { ...emptyResult, error: `Could not retrieve chunk ${targetChunkId}.` };
      }

      // Fetch HTML from MongoDB
      let htmlContent = '';
      try {
        const mongoChunks = await fetchChunksByIds(targetDocumentId, [targetChunkId]);
        const matchedChunk = mongoChunks.find((c) => c.id === targetChunkId);
        if (matchedChunk?.metadata.htmlContent) {
          htmlContent = matchedChunk.metadata.htmlContent;
        }
      } catch {
        // MongoDB fetch failed
      }

      if (!htmlContent) {
        return {
          chunkId: targetChunkId,
          documentId: targetDocumentId,
          sourceFile: chromaChunk.metadata.sourceFile,
          pageNumber: chromaChunk.metadata.startPage,
          summary: chromaChunk.metadata.summary ?? chromaChunk.content,
          tableMarkdown: '',
          tableHtml: '',
          columns: [],
          rowCount: 0,
          data: [],
          error: 'Table HTML not available in database. The summary is available above.',
        };
      }

      // Convert HTML to markdown
      const markdown = htmlTableToMarkdown(htmlContent);
      const cappedMarkdown = markdown.length > MAX_TABLE_MARKDOWN_LENGTH
        ? markdown.slice(0, MAX_TABLE_MARKDOWN_LENGTH) + '...'
        : markdown;

      // Parse HTML into structured data
      const { columns, data, rowCount, truncated } = parseHtmlTable(htmlContent);

      return {
        chunkId: targetChunkId,
        documentId: targetDocumentId,
        sourceFile: chromaChunk.metadata.sourceFile,
        pageNumber: chromaChunk.metadata.startPage,
        summary: chromaChunk.metadata.summary ?? chromaChunk.content,
        tableMarkdown: cappedMarkdown,
        tableHtml: htmlContent.length > 5000 ? htmlContent.slice(0, 5000) + '...' : htmlContent,
        columns,
        rowCount,
        ...(truncated && { truncated }),
        data,
      };
    } catch (err) {
      console.error('[getTableData] Error:', err);
      return { ...emptyResult, error: 'Failed to retrieve table data.' };
    }
  },
});
