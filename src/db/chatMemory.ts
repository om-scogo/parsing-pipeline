import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;
let initialized = false;

function getClient(): Client {
  if (!client) {
    client = createClient({ url: 'file:./data/chat.db' });
  }
  return client;
}

async function ensureSchema() {
  if (initialized) return;
  const db = getClient();

  await db.batch([
    `CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id)`,
  ]);

  initialized = true;
}

/** Create or ensure a chat exists. Returns the chatId. */
export async function ensureChat(chatId: string, title?: string): Promise<string> {
  await ensureSchema();
  const db = getClient();

  await db.execute({
    sql: `INSERT OR IGNORE INTO chats (id, title) VALUES (?, ?)`,
    args: [chatId, title ?? 'New Chat'],
  });

  return chatId;
}

/** Update chat title */
export async function updateChatTitle(chatId: string, title: string) {
  await ensureSchema();
  const db = getClient();

  await db.execute({
    sql: `UPDATE chats SET title = ? WHERE id = ?`,
    args: [title, chatId],
  });
}

/** Save a message to the chat history */
export async function saveMessage(chatId: string, role: 'user' | 'assistant', content: string) {
  await ensureSchema();
  const db = getClient();

  await db.execute({
    sql: `INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`,
    args: [chatId, role, content],
  });
}

/** Load all messages for a chat, ordered chronologically */
export async function getMessages(chatId: string): Promise<{ role: string; content: string }[]> {
  await ensureSchema();
  const db = getClient();

  const result = await db.execute({
    sql: `SELECT role, content FROM chat_messages WHERE chat_id = ? ORDER BY id ASC`,
    args: [chatId],
  });

  return result.rows.map((row) => ({
    role: row.role as string,
    content: row.content as string,
  }));
}

/** List all chats, most recent first */
export async function listChats(): Promise<{ id: string; title: string; createdAt: string }[]> {
  await ensureSchema();
  const db = getClient();

  const result = await db.execute(
    `SELECT id, title, created_at FROM chats ORDER BY created_at DESC`,
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    createdAt: row.created_at as string,
  }));
}

/** Delete a chat and its messages */
export async function deleteChat(chatId: string) {
  await ensureSchema();
  const db = getClient();

  await db.batch([
    { sql: `DELETE FROM chat_messages WHERE chat_id = ?`, args: [chatId] },
    { sql: `DELETE FROM chats WHERE id = ?`, args: [chatId] },
  ]);
}
