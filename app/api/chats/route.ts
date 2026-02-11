import { NextResponse } from 'next/server';
import '../../../src/env';
import { storage } from '@/src/agent/memory';

/** GET /api/chats — list all chat threads */
export async function GET() {
  try {
    const memoryStore = await storage.getStore('memory');
    if (!memoryStore) {
      return NextResponse.json({ chats: [] });
    }

    const { threads } = await memoryStore.listThreads({
      filter: { resourceId: 'default' },
    });

    const chats = threads.map((t) => ({
      id: t.id,
      title: t.title || 'New Chat',
      createdAt: t.createdAt,
    }));

    return NextResponse.json({ chats });
  } catch (err) {
    console.error('Failed to list chats:', err);
    return NextResponse.json({ error: 'Failed to list chats' }, { status: 500 });
  }
}
