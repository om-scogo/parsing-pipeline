import type { Metadata, Where, WhereDocument } from 'chromadb';
import { embedTexts, getDocumentsCollection } from '../../embedding';
import { generateText } from 'ai';
import { getModel } from '../../extraction/ai';

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

// ── Stop words for keyword extraction ──────────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can','could',
  'i','me','my','we','our','you','your','he','him','his','she','her','it','its','they','them','their',
  'this','that','these','those','what','which','who','whom','how','when','where','why',
  'and','or','but','if','then','else','so','not','no','nor','of','at','by','for','with',
  'about','against','between','through','during','before','after','above','below','to','from',
  'in','on','into','out','up','down','all','each','every','both','few','more','most',
  'other','some','such','any','only','same','than','too','very','just','also',
]);

/**
 * Extract 2-3 key terms from a query for keyword search.
 * Simple approach: split, filter stop words, take longest/most distinctive words.
 */
export function extractKeyTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Sort by length descending (longer words are more distinctive), take top 3
  const sorted = [...new Set(words)].sort((a, b) => b.length - a.length);
  return sorted.slice(0, 3);
}

/**
 * Generate 3-4 query variations using LLM for multi-query expansion.
 * Falls back to just the original query if the LLM call fails.
 */
export async function expandQuery(query: string): Promise<string[]> {
  try {
    const { text } = await generateText({
      model: getModel(),
      prompt: `Generate 3-4 search query variations for finding relevant content in a document knowledge base.

Original query: "${query}"

Return a JSON array of strings. Each variation should:
- Use different terminology or synonyms
- Cover different phrasings someone might use for the same concept
- Include one more specific and one more general version

Return ONLY a JSON array, no explanation. Example: ["variation 1", "variation 2", "variation 3"]`,
    });

    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed.slice(0, 4);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Multi-vector search: embed multiple queries and run ChromaDB query for each.
 * Returns all results with their best scores (not deduped yet).
 */
export async function queryChromaMulti(
  queries: string[],
  topK: number,
  where?: Where,
): Promise<{ results: ChromaSearchResult[]; queryIndex: number }[]> {
  if (queries.length === 0) return [];

  const allEmbeddings = await embedTexts(queries);
  const collection = await getDocumentsCollection();

  const queryResults = await Promise.all(
    allEmbeddings.map(async (embedding, idx) => {
      const params: {
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
        params.where = where;
      }

      const results = await collection.query(params);
      if (!results.ids?.[0]?.length) return { results: [], queryIndex: idx };

      const ids = results.ids[0];
      const documents = results.documents?.[0] ?? [];
      const metadatas = results.metadatas?.[0] ?? [];
      const distances = results.distances?.[0] ?? [];

      return {
        results: ids.map((id, i) =>
          formatResult(id, documents[i] ?? '', (metadatas[i] ?? {}) as Metadata, distances[i] ?? 0),
        ),
        queryIndex: idx,
      };
    }),
  );

  return queryResults;
}

/**
 * Keyword search: use ChromaDB get() with $contains on document text.
 * Returns chunks whose text contains the given term.
 */
export async function keywordSearch(
  terms: string[],
  where?: Where,
  limit: number = 20,
): Promise<ChromaSearchResult[]> {
  if (terms.length === 0) return [];

  const collection = await getDocumentsCollection();
  const allResults: ChromaSearchResult[] = [];

  for (const term of terms) {
    try {
      const whereDoc: WhereDocument = { $contains: term };
      const params: {
        include: ('documents' | 'metadatas')[];
        limit: number;
        where?: Where;
        whereDocument: WhereDocument;
      } = {
        include: ['documents', 'metadatas'],
        limit,
        whereDocument: whereDoc,
      };
      if (where && Object.keys(where).length > 0) {
        params.where = where;
      }

      const results = await collection.get(params);
      if (!results.ids?.length) continue;

      for (let i = 0; i < results.ids.length; i++) {
        allResults.push(
          formatResult(
            results.ids[i],
            results.documents?.[i] ?? '',
            (results.metadatas?.[i] ?? {}) as Metadata,
            0, // No distance for keyword search — score will be set to 1.0
          ),
        );
      }
    } catch {
      // Individual keyword search failed — continue with others
    }
  }

  return allResults;
}

/**
 * Deduplicate and re-rank results from multi-query + keyword search.
 *
 * Score formula:
 *   combined = best_similarity * 0.7 + (frequency / total_queries) * 0.2 + keyword_bonus * 0.1
 */
export function dedupeAndRerank(
  vectorResults: { results: ChromaSearchResult[]; queryIndex: number }[],
  keywordResults: ChromaSearchResult[],
  totalQueries: number,
): ChromaSearchResult[] {
  const chunkMap = new Map<
    string,
    {
      chunk: ChromaSearchResult;
      bestScore: number;
      frequency: number;
      keywordMatch: boolean;
    }
  >();

  // Process vector results
  for (const { results } of vectorResults) {
    for (const chunk of results) {
      const existing = chunkMap.get(chunk.id);
      if (existing) {
        existing.bestScore = Math.max(existing.bestScore, chunk.score);
        existing.frequency += 1;
      } else {
        chunkMap.set(chunk.id, {
          chunk,
          bestScore: chunk.score,
          frequency: 1,
          keywordMatch: false,
        });
      }
    }
  }

  // Process keyword results
  for (const chunk of keywordResults) {
    const existing = chunkMap.get(chunk.id);
    if (existing) {
      existing.keywordMatch = true;
    } else {
      chunkMap.set(chunk.id, {
        chunk,
        bestScore: 0.5, // Default similarity for keyword-only matches
        frequency: 0,
        keywordMatch: true,
      });
    }
  }

  // Compute combined scores and sort
  const ranked = Array.from(chunkMap.values()).map((entry) => {
    const freqScore = totalQueries > 0 ? entry.frequency / totalQueries : 0;
    const keywordBonus = entry.keywordMatch ? 1.0 : 0.0;
    const combinedScore = entry.bestScore * 0.7 + freqScore * 0.2 + keywordBonus * 0.1;

    return {
      ...entry.chunk,
      score: Math.round(combinedScore * 1000) / 1000,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Parse an HTML table into column headers and rows of data.
 * Returns at most maxRows rows.
 */
export function parseHtmlTable(html: string, maxRows: number = 50): {
  columns: string[];
  data: Record<string, string>[];
  rowCount: number;
  truncated: boolean;
} {
  const rows: string[][] = [];

  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rowMatches) return { columns: [], data: [], rowCount: 0, truncated: false };

  let headerRow: string[] | null = null;

  for (const rowHtml of rowMatches) {
    const cells: string[] = [];
    // Check if this row has <th> elements (header row)
    const isHeader = /<th[^>]*>/i.test(rowHtml);
    const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
    if (cellMatches) {
      for (const cellHtml of cellMatches) {
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
    if (cells.length === 0) continue;

    if (isHeader && !headerRow) {
      headerRow = cells;
    } else {
      rows.push(cells);
    }
  }

  // If no explicit header row, use the first row
  if (!headerRow && rows.length > 0) {
    headerRow = rows.shift()!;
  }

  const columns = headerRow ?? [];
  const totalRows = rows.length;
  const truncated = totalRows > maxRows;
  const dataRows = rows.slice(0, maxRows);

  const data = dataRows.map((row) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) {
      record[columns[i] || `col_${i}`] = row[i] ?? '';
    }
    return record;
  });

  return { columns, data, rowCount: totalRows, truncated };
}
