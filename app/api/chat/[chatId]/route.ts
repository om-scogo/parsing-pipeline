import { NextRequest, NextResponse } from 'next/server';
import '../../../../src/env';
import { storage } from '@/src/agent/memory';

/** GET /api/chat/:chatId — load chat messages from Mastra memory */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;
    const memoryStore = await storage.getStore('memory');
    if (!memoryStore) {
      return NextResponse.json({ chatId, messages: [] });
    }

    const { messages } = await memoryStore.listMessages({ threadId: chatId });

    const result = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p: any) => p.text || '').join('')
          : '',
    }));

    return NextResponse.json({ chatId, messages: result });
  } catch (err) {
    console.error('Failed to load chat:', err);
    return NextResponse.json({ error: 'Failed to load chat' }, { status: 500 });
  }
}

/** DELETE /api/chat/:chatId — delete a chat thread and its messages */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;
    const memoryStore = await storage.getStore('memory');
    if (memoryStore) {
      await memoryStore.deleteThread({ threadId: chatId });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete chat:', err);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}
