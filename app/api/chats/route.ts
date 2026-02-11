import { NextResponse } from 'next/server';
import '../../../src/env';
import { listChats } from '@/src/db/chatMemory';

/** GET /api/chats — list all chats */
export async function GET() {
  try {
    const chats = await listChats();
    return NextResponse.json({ chats });
  } catch (err) {
    console.error('Failed to list chats:', err);
    return NextResponse.json({ error: 'Failed to list chats' }, { status: 500 });
  }
}
