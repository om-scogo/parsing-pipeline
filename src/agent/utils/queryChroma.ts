import type { Metadata, Where } from 'chromadb';
import { embedTexts, getDocumentsCollection } from '../../embedding';

export interface ChromaSearchResult {
  id: string;
  content: string;
  type: string;
  score: number;
  metadata: {
    documentId: string;
    sourceFile: string;
    startPage: number;
    endPage: number;
    pageNumber?: number;
    chunkIndex: number;
    tokenCount: number;
    summary?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Convert ChromaDB distance to a 0-1 similarity score (higher = more similar).
 */
function distanceToScore(distance: number): number {
  return 1 / (1 + distance);
}

/**
 * Format raw ChromaDB metadata into a clean result object.
 */
function formatResult(
  id: string,
  document: string,
  metadata: Metadata,
  distance: number,
): ChromaSearchResult {
  return {
    id,
    content: document,
    type: String(metadata.type || 'text'),
    score: Math.round(distanceToScore(distance) * 1000) / 1000,
    metadata: {
      documentId: String(metadata.document_id || ''),
      sourceFile: String(metadata.source_file || ''),
      startPage: Number(metadata.start_page ?? 0),
      endPage: Number(metadata.end_page ?? 0),
      pageNumber: metadata.page_number != null ? Number(metadata.page_number) : undefined,
      chunkIndex: Number(metadata.chunk_index ?? 0),
      tokenCount: Number(metadata.token_count ?? 0),
      summary: metadata.summary ? String(metadata.summary) : undefined,
      description: metadata.description ? String(metadata.description) : undefined,
    },
  };
}

/**
 * Embed a query and search ChromaDB with optional metadata filters.
 * Returns formatted results sorted by relevance.
 */
export async function queryChroma(
  query: string,
  topK: number,
  where?: Where,
): Promise<ChromaSearchResult[]> {
  const [embedding] = await embedTexts([query]);
  const collection = await getDocumentsCollection();

  const queryParams: {
    queryEmbeddings: number[][];
    nResults: number;
    include: ('documents' | 'metadatas' | 'distances')[];
    where?: Where;
  } = {
    queryEmbeddings: [embedding],
    nResults: topK,
    include: ['documents', 'metadatas', 'distances'],
  };

  if (where && Object.keys(where).length > 0) {
    queryParams.where = where;
  }

  const results = await collection.query(queryParams);

  if (!results.ids?.[0]?.length) return [];

  const ids = results.ids[0];
  const documents = results.documents?.[0] ?? [];
  const metadatas = results.metadatas?.[0] ?? [];
  const distances = results.distances?.[0] ?? [];

  return ids.map((id, i) =>
    formatResult(
      id,
      documents[i] ?? '',
      (metadatas[i] ?? {}) as Metadata,
      distances[i] ?? 0,
    ),
  );
}

/**
 * Fetch chunks from ChromaDB by their IDs (no vector search).
 */
export async function getChromaChunksByIds(
  ids: string[],
): Promise<ChromaSearchResult[]> {
  if (ids.length === 0) return [];

  const collection = await getDocumentsCollection();
  const results = await collection.get({
    ids,
    include: ['documents', 'metadatas'],
  });

  if (!results.ids?.length) return [];

  return results.ids.map((id, i) =>
    formatResult(
      id,
      results.documents?.[i] ?? '',
      (results.metadatas?.[i] ?? {}) as Metadata,
      0,
    ),
  );
}

/**
 * Fetch chunks from ChromaDB by metadata filter (no vector search).
 */
export async function getChromaChunksByFilter(
  where: Where,
  limit?: number,
): Promise<ChromaSearchResult[]> {
  const collection = await getDocumentsCollection();
  const results = await collection.get({
    where,
    include: ['documents', 'metadatas'],
    limit,
  });

  if (!results.ids?.length) return [];

  return results.ids.map((id, i) =>
    formatResult(
      id,
      results.documents?.[i] ?? '',
      (results.metadatas?.[i] ?? {}) as Metadata,
      0,
    ),
  );
}

/**
 * Simple HTML table to markdown converter.
 * Handles basic <table> with <tr>, <th>, <td>.
 */
export function htmlTableToMarkdown(html: string): string {
  const rows: string[][] = [];

  // Extract rows
  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rowMatches) return html;

  for (const rowHtml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
    if (cellMatches) {
      for (const cellHtml of cellMatches) {
        // Strip HTML tags and clean up whitespace
        const text = cellHtml
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(text);
      }
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return html;

  // Normalize column count
  const maxCols = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    while (r.length < maxCols) r.push('');
    return r;
  });

  // Build markdown table
  const lines: string[] = [];
  lines.push('| ' + normalized[0].join(' | ') + ' |');
  lines.push('| ' + normalized[0].map(() => '---').join(' | ') + ' |');
  for (let i = 1; i < normalized.length; i++) {
    lines.push('| ' + normalized[i].join(' | ') + ' |');
  }

  return lines.join('\n');
}
