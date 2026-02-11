import { NextRequest, NextResponse } from 'next/server';
import '../../../src/env';
import { ragAgent } from '@/src/agent';
import { getWebDocument } from '@/src/db/webDocuments';

const PREVIEW_LENGTH = 120;

/** Build a compact summary of tool results so the client can render individual items */
function summarizeToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const obj = result as Record<string, unknown>;

  // searchDocuments / searchByType — { results: [...], count }
  if (Array.isArray(obj.results)) {
    return {
      count: obj.count ?? obj.results.length,
      items: (obj.results as Record<string, unknown>[]).map((r) => ({
        sourceFile: (r.metadata as Record<string, unknown>)?.sourceFile ?? null,
        page: (r.metadata as Record<string, unknown>)?.startPage ?? null,
        type: r.type ?? null,
        score: typeof r.score === 'number' ? Math.round(r.score * 100) / 100 : null,
        preview: typeof r.content === 'string'
          ? r.content.slice(0, PREVIEW_LENGTH) + (r.content.length > PREVIEW_LENGTH ? '...' : '')
          : null,
      })),
    };
  }

  // listDocuments — { documents: [...], totalDocuments }
  if (Array.isArray(obj.documents)) {
    return {
      totalDocuments: obj.totalDocuments ?? obj.documents.length,
      items: (obj.documents as Record<string, unknown>[]).map((d) => ({
        sourceFile: d.sourceFile,
        totalChunks: d.totalChunks,
        textChunks: d.textChunks,
        tableChunks: d.tableChunks,
        imageChunks: d.imageChunks,
      })),
    };
  }

  // getDocumentContext — { targetChunk, context: [...], pageRange }
  if ('targetChunk' in obj && Array.isArray(obj.context)) {
    const target = obj.targetChunk as Record<string, unknown> | null;
    return {
      pageRange: obj.pageRange,
      targetFile: target ? (target.metadata as Record<string, unknown>)?.sourceFile : null,
      contextCount: (obj.context as unknown[]).length,
    };
  }

  // Fallback — return as-is if small, otherwise truncate
  const str = JSON.stringify(result);
  if (str.length <= 2000) return result;
  return { _summary: str.slice(0, 500) + '…', _truncated: true };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, chatId, documentIds } = body as {
      message: string;
      chatId: string;
      documentIds?: string[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (!chatId?.trim()) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
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

    // Build the user message — add document scope if needed
    let prompt = message;
    if (ingestionIds.length > 0) {
      prompt += `\n\n[Context: The user has selected specific documents. When using search tools, filter results to these document IDs: ${ingestionIds.join(', ')}. Always use the documentId parameter in your tool calls.]`;
    }

    // Stream the response — Mastra memory handles history via thread/resource
    const stream = await ragAgent.stream(prompt, {
      maxSteps: 10,
      memory: {
        thread: chatId,
        resource: 'default',
      },
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream.fullStream) {
            if (chunk.type === 'text-delta') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk.payload.text })}\n\n`),
              );
            } else if (chunk.type === 'tool-call') {
              const { toolCallId, toolName, args } = chunk.payload;
              const cleanArgs = args
                ? Object.fromEntries(Object.entries(args).filter(([k]) => !k.startsWith('__')))
                : {};
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'tool-call', toolCallId, toolName, args: cleanArgs })}\n\n`),
              );
            } else if (chunk.type === 'tool-result') {
              const { toolCallId, toolName, result } = chunk.payload;
              const clientResult = summarizeToolResult(result);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'tool-result', toolCallId, toolName, result: clientResult })}\n\n`),
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
