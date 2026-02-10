import { Agent } from '@mastra/core/agent';
import { OPENAI_API_KEY, OPENAI_BASE_URL } from '../env';
import { SYSTEM_PROMPT } from './prompts/system';
import { searchDocuments } from './tools/searchDocuments';
import { searchByType } from './tools/searchByType';
import { getDocumentContext } from './tools/getDocumentContext';
import { listDocuments } from './tools/listDocuments';

/**
 * RAG agent for querying processed PDF documents.
 *
 * Uses GPT-4o-mini (via existing LiteLLM proxy) for reasoning and
 * four tools for comprehensive document retrieval:
 *   - searchDocuments: broad vector search across all chunk types
 *   - searchByType: targeted search for text, tables, or images
 *   - getDocumentContext: fetch surrounding chunks for more context
 *   - listDocuments: list available documents and their stats
 */
export const ragAgent = new Agent({
  id: 'document-research-agent',
  name: 'Document Research Agent',
  instructions: SYSTEM_PROMPT,
  model: {
    id: 'openai/azure-gpt-4o-mini',
    apiKey: OPENAI_API_KEY!,
    url: OPENAI_BASE_URL!,
  },
  tools: {
    searchDocuments,
    searchByType,
    getDocumentContext,
    listDocuments,
  },
});
