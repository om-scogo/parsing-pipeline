import { Agent } from '@mastra/core/agent';
import { OPENAI_API_KEY, OPENAI_BASE_URL } from '../env';
import { SYSTEM_PROMPT } from './prompts/system';
import { searchDocuments } from './tools/searchDocuments';
import { searchByType } from './tools/searchByType';
import { getDocumentContext } from './tools/getDocumentContext';
import { listDocuments } from './tools/listDocuments';
import { getModel } from '../extraction/ai'
import { memory } from './memory';

export const ragAgent = new Agent({
  id: 'document-research-agent',
  name: 'Document Research Agent',
  instructions: SYSTEM_PROMPT,
  model: getModel() as any,
  memory,
  tools: {
    searchDocuments,
    searchByType,
    getDocumentContext,
    listDocuments,
  }
});
