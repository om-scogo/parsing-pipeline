import { Agent } from '@mastra/core/agent';
import { OPENAI_API_KEY, OPENAI_BASE_URL } from '../env';
import { SYSTEM_PROMPT } from './prompts/system';
import { search } from './tools/search';
import { lookupPages } from './tools/lookupPages';
import { getTableData } from './tools/getTableData';
import { listDocuments } from './tools/listDocuments';
import { getModel } from '../extraction/ai'
import { memory } from './memory';

/**
 * RAG agent for querying processed PDF documents.
 *
 * Uses GPT-4o-mini (via existing LiteLLM proxy) for reasoning and
 * four tools for comprehensive document retrieval:
 *   - search: multi-query hybrid search across all chunk types
 *   - lookupPages: retrieve all content from specific document pages
 *   - getTableData: direct access to structured table data
 *   - listDocuments: list available documents and their stats
 */
export const ragAgent = new Agent({
  id: 'document-research-agent',
  name: 'Document Research Agent',
  instructions: SYSTEM_PROMPT,
  model: getModel() as any,
  memory,
  tools: {
    search,
    lookupPages,
    getTableData,
    listDocuments,
  }
});
