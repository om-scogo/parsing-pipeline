/**
 * Shared types for the PDF ingestion pipeline.
 */

export interface UnstructuredElement {
  type: string;
  element_id: string;
  text: string;
  metadata: {
    page_number?: number;
    coordinates?: any;
    text_as_html?: string;
    image_base64?: string;
    detection_method?: string;
    filetype?: string;
    filename?: string;
    [key: string]: any;
  };
}

export interface SeparatedElements {
  textElements: UnstructuredElement[];
  tableElements: UnstructuredElement[];
  imageElements: UnstructuredElement[];
}

export interface CleanedPage {
  pageNumber: number;
  cleanedText: string;
}

export interface ChunkMetadata {
  chunkIndex: number;
  startPage: number;
  endPage: number;
  tokenCount: number;
  type: 'text' | 'table' | 'image';
  htmlContent?: string;
  summary?: string;
  description?: string;
  pageNumber?: number;
  documentId?: string;
  sourceFile?: string;
}

export interface ProcessedChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  embedding?: number[];
}

export interface PdfIngestionInput {
  filePath: string;
  documentId: string;
  chunkSize?: number;
  chunkOverlap?: number;
  processImages?: boolean;
  concurrencyLimit?: number;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  modelName: string;
  dimensions: number;
}

export interface VectorStore {
  upsert(documents: ProcessedChunk[]): Promise<void>;
  search(query: number[], topK: number, filter?: Record<string, any>): Promise<SearchResult[]>;
}

export interface SearchResult {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * MongoDB document shape for ingestion pipeline state.
 * Each activity reads/writes specific fields, using the documentId to pass data.
 */
export interface IngestionDocument {
  filePath: string;
  status: string;
  rawElements?: UnstructuredElement[];
  textElements?: UnstructuredElement[];
  tableElements?: UnstructuredElement[];
  imageElements?: UnstructuredElement[];
  cleanedPages?: CleanedPage[];
  textChunks?: ProcessedChunk[];
  tableChunks?: ProcessedChunk[];
  imageChunks?: ProcessedChunk[];
  createdAt: Date;
  updatedAt: Date;
}
