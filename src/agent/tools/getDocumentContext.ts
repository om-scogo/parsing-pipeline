import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getChromaChunksByIds,
  getChromaChunksByFilter,
  type ChromaSearchResult,
} from '../utils/queryChroma';

const MAX_CONTENT_LENGTH = 1500;

export const getDocumentContext = createTool({
  id: 'get-document-context',
  description:
    'Retrieve surrounding chunks for a given chunk to get broader context. ' +
    'Given a chunk ID from a previous search result, fetches neighboring chunks ' +
    'by page range from the same document. Useful for understanding the full context ' +
    'around a specific finding.',
  inputSchema: z.object({
    chunkId: z.string().describe('The ID of the chunk to get context around'),
    windowSize: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(2)
      .describe('Number of pages to expand around the chunk (default 2)'),
  }),
  outputSchema: z.object({
    targetChunk: z
      .object({
        id: z.string(),
        content: z.string(),
        type: z.string(),
        metadata: z.record(z.unknown()),
      })
      .nullable(),
    context: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        type: z.string(),
        metadata: z.record(z.unknown()),
      }),
    ),
    pageRange: z.string(),
  }),
  execute: async ({ chunkId, windowSize }) => {
    try {
      // Fetch the target chunk
      console.log("--------------------------------");
      console.log("[getDocumentContext] Fetching target chunk for chunkId:", chunkId);
      console.log("--------------------------------");
      const [targetChunk] = await getChromaChunksByIds([chunkId]);
      if (!targetChunk) {
        return {
          targetChunk: null,
          context: [],
          pageRange: '',
        };
      }

      const { documentId, startPage, endPage } = targetChunk.metadata;
      if (!documentId) {
        return {
          targetChunk: formatChunk(targetChunk),
          context: [],
          pageRange: `${startPage}-${endPage}`,
        };
      }

      // Expand page range by windowSize
      const expandedStart = Math.max(1, startPage - (windowSize ?? 2));
      const expandedEnd = endPage + (windowSize ?? 2);

      // Fetch neighboring chunks from the same document within the page range
      const neighbors = await getChromaChunksByFilter(
        {
          $and: [
            { document_id: documentId },
            { start_page: { $gte: expandedStart } },
            { end_page: { $lte: expandedEnd } },
          ],
        },
        50,
      );

      // Sort by start_page then chunk_index, exclude the target chunk
      const contextChunks = neighbors
        .filter((c) => c.id !== chunkId)
        .sort(
          (a, b) =>
            a.metadata.startPage - b.metadata.startPage ||
            a.metadata.chunkIndex - b.metadata.chunkIndex,
        );

      return {
        targetChunk: formatChunk(targetChunk),
        context: contextChunks.map(formatChunk),
        pageRange: `${expandedStart}-${expandedEnd}`,
      };
    } catch (err) {
      return {
        targetChunk: null,
        context: [],
        pageRange: '',
      };
    }
  },
});

function formatChunk(r: ChromaSearchResult) {
  return {
    id: r.id,
    content:
      r.content.length > MAX_CONTENT_LENGTH
        ? r.content.slice(0, MAX_CONTENT_LENGTH) + '...'
        : r.content,
    type: r.type,
    metadata: {
      documentId: r.metadata.documentId,
      sourceFile: r.metadata.sourceFile,
      startPage: r.metadata.startPage,
      endPage: r.metadata.endPage,
      ...(r.metadata.summary && { summary: r.metadata.summary }),
      ...(r.metadata.description && { description: r.metadata.description }),
    },
  };
}
