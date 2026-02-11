import { NextRequest, NextResponse } from 'next/server';
import '../../../../src/env';
import { getMessages, deleteChat } from '@/src/db/chatMemory';

/** GET /api/chat/:chatId — load chat messages from DB */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;
    const messages = await getMessages(chatId);
    return NextResponse.json({ chatId, messages });
  } catch (err) {
    console.error('Failed to load chat:', err);
    return NextResponse.json({ error: 'Failed to load chat' }, { status: 500 });
  }
}

/** DELETE /api/chat/:chatId — delete a chat and its messages */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;
    await deleteChat(chatId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete chat:', err);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}
