# Document RAG: Extraction Workflow & RAG Agent

This project provides **PDF ingestion** (via Temporal workflows and Unstructured.io) and a **RAG (Retrieval-Augmented Generation) agent** that answers questions over the ingested documents using vector search and an LLM.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [PDF Ingestion: Temporal Activities](#pdf-ingestion-temporal-activities)
- [RAG Agent](#rag-agent)
- [RAG Agent Tools (in Detail)](#rag-agent-tools-in-detail)
- [How to Run](#how-to-run)

---

## Overview

1. **Ingestion pipeline**: Upload a PDF → Temporal workflow runs **8 activities** that extract, clean, chunk, embed, and store content in **ChromaDB** and **MongoDB**.
2. **RAG agent**: Users ask questions in the UI → the **Document Research Agent** (Nice RAG) uses **4 tools** to search the knowledge base and streams an answer via the chat API.

The agent does **not** guess: it uses tools to retrieve text, tables, and image descriptions, then synthesizes answers from that context.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PDF Ingestion (Temporal Worker)                                             │
│  PDF file → extractPdf → separateElements → cleanText → chunkText             │
│           → processTables / processImages (parallel) → embedChunks → storeChunks│
│  Output: MongoDB (raw/cleaned/chunks) + ChromaDB (vectors + metadata)         │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  RAG Agent (Next.js API)                                                     │
│  User message → Agent (GPT-4o-mini) → tools: searchDocuments, searchByType, │
│                getDocumentContext, listDocuments → ChromaDB + MongoDB         │
│  Output: Streamed answer with citations                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PDF Ingestion: Temporal Activities

The **PDF Ingestion Workflow** (`pdfIngestion`) runs the following activities in order. They prepare the data that the RAG agent later searches.

| # | Activity | Purpose | Key behavior |
|---|----------|---------|--------------|
| 1 | **extractPdf** | Extract content from PDF | Creates an ingestion document in MongoDB, calls Unstructured.io API (hi-res, with coordinates, image/table blocks), stores raw elements in MongoDB. Returns `documentId`. |
| 2 | **separateElements** | Bucket elements by type | Reads raw elements; classifies into **text** (narrative, title, list, etc.), **table** (with `text_as_html`), **image** (with base64 or caption). Drops headers, footers, page breaks, page numbers. Saves separated buckets to MongoDB. |
| 3 | **cleanText** | Clean narrative text with LLM | Groups text elements by page, sends each page to GPT-4o-mini with a cleanup prompt (fix OCR, remove TOC/headers/footers, preserve meaning). Saves cleaned pages to MongoDB. Configurable concurrency. |
| 4 | **chunkText** | Chunk cleaned text | Splits cleaned text into sentences, builds fixed-size chunks (default 600 tokens, 80 overlap) with page-range metadata. Saves text chunks to MongoDB. |
| 5 | **processTables** | Summarize tables with LLM | For each table element, sends HTML to GPT-4o-mini to produce a 2–4 sentence summary (purpose, headers, key data). Stores summary (for embedding) and original HTML (in MongoDB for display). Runs with configurable concurrency. |
| 6 | **processImages** | Describe images with LLM | For each image with base64 data, uses vision model to describe content (charts, diagrams, text in image). Without base64, uses caption. Saves description as chunk text. Optional (can be disabled via workflow input). |
| 7 | **embedChunks** | Embed all chunks | Fetches all chunks (text, table, image) from MongoDB, embeds in batches (e.g. 100) with text-embedding-3-small, saves embeddings back to MongoDB. |
| 8 | **storeChunks** | Persist to vector DB | Reads embedded chunks from MongoDB, builds ChromaDB payload (ids, embeddings, documents, metadatas with type, page, document_id, etc.), upserts into ChromaDB. Marks ingestion as completed. |

**Timeouts & retries**: Extract/separate use ~5 min timeout; clean/processTables/processImages use ~10 min and more retries; embedChunks ~5 min; storeChunks ~2 min.

---

## RAG Agent

- **ID**: `document-research-agent`
- **Name**: Document Research Agent (“Nice RAG”)
- **Model**: `openai/azure-gpt-4o-mini` (via `OPENAI_API_KEY` and `OPENAI_BASE_URL`).
- **Role**: Answer user questions by **searching** the knowledge base with tools and synthesizing from retrieved chunks. It is instructed not to invent information and to cite sources.

**System prompt (summary)**:

- Start with a broad **searchDocuments** search.
- Use **searchByType** for tables (“table”) or visual content (“image”) when needed.
- Use **getDocumentContext** when a result needs surrounding chunks.
- Use **listDocuments** when the user asks what documents exist.
- Reformulate queries and do multiple searches for complex questions.
- If information is insufficient, say so; if sources conflict, present both with sources.

**Invocation**: The Next.js chat API (`/api/chat`) builds a prompt (optional document scope + conversation history + current message), then calls `ragAgent.stream(prompt, { maxSteps: 10 })` and streams text-delta and finish events to the client.

---

## RAG Agent Tools (in Detail)

The agent has four tools. All vector search is done via ChromaDB using the same embedding model as ingestion; optional filters (e.g. `documentId`) narrow results.

---

### 1. `searchDocuments` (id: `search-documents`)

**Purpose**: General-purpose vector search across **all** chunk types (text, table, image). Use for broad exploration when the relevant content type is unknown.

**Input schema**:

| Parameter   | Type   | Required | Description |
|------------|--------|----------|-------------|
| `query`    | string | yes      | Natural-language search query. |
| `topK`     | number | no       | Number of results (1–30, default 10). |
| `documentId` | string | no     | If set, only chunks from this document are returned. |

**Output**: `{ results: Array<{ id, content, type, score, metadata }>, count }`. Content is truncated to 1500 characters. Metadata includes `documentId`, `sourceFile`, `startPage`, `endPage`, and optionally `summary` or `description`.

**Behavior**: Embeds `query`, runs ChromaDB `query()` with optional `where: { document_id: documentId }`, returns results sorted by similarity (distance converted to 0–1 score). On error returns `{ results: [], count: 0 }`.

---

### 2. `searchByType` (id: `search-by-type`)

**Purpose**: Vector search restricted to a **single chunk type**: `"text"`, `"table"`, or `"image"`. More focused than `searchDocuments` when the user asks for narrative, tabular data, or visual content.

**Input schema**:

| Parameter   | Type   | Required | Description |
|------------|--------|----------|-------------|
| `query`    | string | yes      | Natural-language search query. |
| `chunkType`| enum   | yes      | `"text"` \| `"table"` \| `"image"`. |
| `topK`     | number | no       | Number of results (1–30, default 10). |
| `documentId` | string | no     | Restrict to this document. |

**Output**: Same as `searchDocuments`, plus type-specific fields:

- **Table chunks**: `tableMarkdown` (HTML converted to markdown) and `tableHtml` (truncated to 3000 chars). Table HTML is loaded from MongoDB when `chunkType === "table"`.
- **Image chunks**: `imageDescription` (from chunk metadata) when present.

**Behavior**: Builds `where` with `type: chunkType` and optionally `document_id: documentId`. For tables, after ChromaDB search it batches `fetchChunksByIds` by document to attach `htmlContent` from MongoDB, then converts HTML to markdown for `tableMarkdown`.

---

### 3. `getDocumentContext` (id: `get-document-context`)

**Purpose**: Get **surrounding chunks** for a given chunk (by ID) to provide broader context—e.g. the paragraph or section around a specific search hit.

**Input schema**:

| Parameter   | Type   | Required | Description |
|------------|--------|----------|-------------|
| `chunkId`  | string | yes      | Chunk ID from a previous search result. |
| `windowSize` | number | no     | Number of pages to expand above/below (1–10, default 2). |

**Output**: `{ targetChunk, context, pageRange }`.

- `targetChunk`: The requested chunk (or null if not found). Same shape as search result (id, content, type, metadata).
- `context`: Array of neighboring chunks in page order (excluding the target), same shape.
- `pageRange`: String like `"1-5"` for the expanded page range.

**Behavior**: Fetches the chunk by ID from ChromaDB (`getChromaChunksByIds`). Reads `documentId`, `startPage`, `endPage` from metadata, then expands the range by `windowSize` and fetches all chunks in that document and page range (`getChromaChunksByFilter`), sorted by `start_page` and `chunk_index`. Content is truncated to 1500 characters per chunk.

---

### 4. `listDocuments` (id: `list-documents`)

**Purpose**: List **available documents** in the knowledge base with per-document chunk counts by type. Use when the user asks what documents exist or about the collection.

**Input schema**:

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `limit`   | number | no       | Max documents to return (1–100, default 50). |

**Output**: `{ documents: Array<{ documentId, sourceFile, textChunks, tableChunks, imageChunks, totalChunks }>, totalDocuments }`.

**Behavior**: Gets the ChromaDB collection, calls `get({ include: ['metadatas'] })`, then aggregates by `document_id`: counts chunks per type (`text` / `table` / `image`) and builds the list. Total document count is the size of the aggregated map; array is sliced by `limit`.

---

## How to Run

### Extraction workflow (Temporal)

1. Start local Temporal: `temporal server start-dev`
2. Add to `.env`: `UNSTRUCTURED_API_KEY`, `UNSTRUCTURED_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CHROMA_API_KEY` (and MongoDB if used).
3. Install dependencies: `npm install`
4. Start the worker: `npm run start.watch`
5. In another shell, run the workflow: `npm run workflow -- --file=<path_to_pdf>`

### UI and RAG chat

1. Ensure the Temporal worker is running: `npm run start.watch`
2. Start Next.js: `npm run dev`
3. Open [http://localhost:3000](http://localhost:3000), upload documents (which trigger the ingestion workflow), then use the chat to ask questions. The RAG agent will use the four tools above to search and answer.

---

## Summary

- **Activities** = the 8 Temporal steps that turn a PDF into vectorized, searchable chunks in ChromaDB and MongoDB.
- **RAG Agent** = the Document Research Agent that uses **searchDocuments**, **searchByType**, **getDocumentContext**, and **listDocuments** to retrieve relevant chunks and generate accurate, sourced answers.
