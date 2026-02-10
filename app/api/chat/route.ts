import { NextRequest, NextResponse } from 'next/server';
import '../../../src/env';
import { ragAgent } from '@/src/agent';
import { getWebDocument } from '@/src/db/webDocuments';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, documentIds, conversationHistory } = body as {
      message: string;
      documentIds?: string[];
      conversationHistory?: { role: string; content: string }[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Resolve frontend document IDs to ingestion document IDs
    const ingestionIds: string[] = [];
    if (documentIds?.length) {
      for (const id of documentIds) {
        const doc = await getWebDocument(id);
        if (doc?.ingestionDocumentId) {
          ingestionIds.push(doc.ingestionDocumentId);
        }
      }
    }

    // Build prompt with context
    let prompt = '';

    // Add document scope context if specific documents selected
    if (ingestionIds.length > 0) {
      prompt += `[Context: The user has selected specific documents. When using search tools, filter results to these document IDs: ${ingestionIds.join(', ')}. Always use the documentId parameter in your tool calls.]\n\n`;
    }

    // Add conversation history
    if (conversationHistory?.length) {
      for (const msg of conversationHistory) {
        const prefix = msg.role === 'user' ? 'User' : 'Assistant';
        prompt += `${prefix}: ${msg.content}\n\n`;
      }
    }

    // Add current message
    prompt += message;

    // Stream the response
    const stream = await ragAgent.stream(prompt, { maxSteps: 10 });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream.fullStream) {
            if (chunk.type === 'text-delta') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk.payload.text })}\n\n`),
              );
            } else if (chunk.type === 'finish') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            } else if (chunk.type === 'error') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'An error occurred' })}\n\n`),
              );
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'Stream error' })}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat error:', err);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 },
    );
  }
}
