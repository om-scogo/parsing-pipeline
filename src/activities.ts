import type { Metadata } from 'chromadb';
import { Section } from './extraction/lib';
import { Processor, enrichSectionsWithAI } from './extraction/process';
import { Unstructured } from './extraction/unstructured';
import * as path from 'path';
import * as fs from 'fs';
import { UNSTRUCTERED_API_KEY } from './env';
import {
  embedTexts,
  addDocuments,
  type DocumentsCollectionPayload,
} from './embedding';
import {
  saveExtractedDocument,
  updateExtractedDocument,
  fetchExtractedDocument,
} from './db/mongodb';

/**
 * Build detailed Chroma metadata from a section (section + elements).
 * Uses only scalar and array-of-scalar values for Chroma compatibility.
 */
function sectionToDetailedMetadata(section: Section): Metadata {
  const elements = section.elements || [];
  const pageNumbers = new Set<number>();
  const elementTypes = new Set<string>();
  const elementIds: string[] = [];
  let filename: string | null = null;
  let filetype: string | null = null;
  const descriptions: string[] = [];

  for (const el of elements) {
    elementTypes.add(el.type);
    elementIds.push(el.element_id);
    if (el.metadata?.filename != null) filename ??= String(el.metadata.filename);
    if (el.metadata?.filetype != null) filetype ??= String(el.metadata.filetype);
    const pn = el.metadata?.page_number ?? el.metadata?.page_numbers;
    if (pn != null) {
      if (Array.isArray(pn)) pn.forEach((p: number) => pageNumbers.add(p));
      else pageNumbers.add(Number(pn));
    }
    if (el.metadata?.description) descriptions.push(String(el.metadata.description));
  }

  const meta: Metadata = {
    section_id: section.section_id,
    title: section.title,
    content_length: section.content?.length ?? 0,
    element_count: elements.length,
    element_types: [...elementTypes].sort().join(','),
  };
  if (filename != null) meta.filename = filename;
  if (filetype != null) meta.filetype = filetype;
  if (elementIds.length > 0) meta.element_ids = elementIds;
  if (pageNumbers.size > 0) meta.page_numbers = [...pageNumbers].sort((a, b) => a - b);
  if (descriptions.length > 0) meta.descriptions = descriptions;
  return meta;
}

/**
 * Build the text to embed for a section: tables use searchable_summary, images use description, others use element text.
 */
function sectionToEmbeddableText(section: Section): string {
  const parts: string[] = [];
  if (section.title?.trim()) parts.push(section.title.trim());
  for (const el of section.elements || []) {
    const type = el.type?.toLowerCase() ?? '';
    if (type === 'table' && el.metadata?.searchable_summary) {
      parts.push(String(el.metadata.searchable_summary).trim());
    } else if (type === 'image' && el.metadata?.description) {
      parts.push(String(el.metadata.description).trim());
    } else if (el.text?.trim()) {
      parts.push(el.text.trim());
    }
  }
  return parts.join('\n\n').trim() || ' ';
}

const PARSE_OPTIONS = {
  strategy: 'hi_res',
  coordinates: 'true',
  extract_image_block_types: '["Image", "Table"]',
} as const;

/**
 * Activity 1: Parse file via Unstructured API and run process step.
 * Saves sections to MongoDB and returns the document ID.
 */
export async function parseDocuments(filePath: string): Promise<string> {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const apiKey = UNSTRUCTERED_API_KEY;
  if (!apiKey) {
    throw new Error('UNSTRUCTERED_API_KEY is not set');
  }
  const unstrd = new Unstructured(apiKey);
  const output = await unstrd.parseFile(resolved, PARSE_OPTIONS);
  const processor = new Processor();
  const sections = processor.process(output);

  // Save to MongoDB and return document ID
  const documentId = await saveExtractedDocument(sections, resolved);
  return documentId;
}

/**
 * Activity 2: Enrich sections with LLM-generated table summaries and image descriptions.
 * Fetches sections from MongoDB, enriches them, updates MongoDB, and returns the document ID.
 */
export async function addAISummary(documentId: string): Promise<string> {
  // Fetch sections from MongoDB
  const sections = await fetchExtractedDocument(documentId);

  // Enrich sections with AI
  const enrichedSections = await enrichSectionsWithAI(sections);

  // Update MongoDB with enriched sections
  await updateExtractedDocument(documentId, enrichedSections, 'enriched');

  return documentId;
}

export async function saveOutput(sections: Section[]): Promise<{ success: boolean }> {
  try {
    const fileName = `${crypto.randomUUID()}.json`;
    const filePath = path.join(process.cwd(), 'processed', fileName);
    fs.writeFileSync(filePath, JSON.stringify(sections, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error saving output:', error);
    return { success: false };
  }
}

/**
 * Activity: Embed section texts and build payload for the documents collection.
 * Fetches sections from MongoDB, embeds them, and returns the payload.
 * Returns both the document ID and the embedding payload.
 */
export async function embedDocuments(documentId: string): Promise<{
  documentId: string;
  payload: DocumentsCollectionPayload;
}> {
  // Fetch sections from MongoDB
  const sections = await fetchExtractedDocument(documentId);

  if (sections.length === 0) {
    return {
      documentId,
      payload: { ids: [], embeddings: [], documents: [], metadatas: [] },
    };
  }

  const documents = sections.map((s) => sectionToEmbeddableText(s));
  const embeddings = await embedTexts(documents);
  const ids = sections.map((s) => s.section_id);
  const metadatas = sections.map((s) => sectionToDetailedMetadata(s));

  // Update status to embedded
  await updateExtractedDocument(documentId, sections, 'embedded');

  return {
    documentId,
    payload: { ids, embeddings, documents, metadatas },
  };
}

/**
 * Activity: Add a pre-computed embed payload to the Chroma "documents" collection.
 * Updates MongoDB status to 'completed' after successful addition.
 */
export async function addDocumentsToVectorDB(
  documentId: string,
  payload: DocumentsCollectionPayload,
): Promise<void> {
  await addDocuments(payload);

  // Update status to completed
  const sections = await fetchExtractedDocument(documentId);
  await updateExtractedDocument(documentId, sections, 'completed');
}
