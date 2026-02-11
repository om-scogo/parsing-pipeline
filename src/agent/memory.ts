import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';

const DB_URL = 'file:./data/mastra-chat-memory.db';

export const storage = new LibSQLStore({
  id: 'chat-storage',
  url: DB_URL,
});

export const memory = new Memory({
  storage,
  options: {
    lastMessages: 40,
    semanticRecall: false,
  },
});
