import { NextRequest, NextResponse } from 'next/server';
import '../../../src/env';
import { ragAgent } from '@/src/agent';
import { getWebDocument } from '@/src/db/webDocuments';
import { ensureChat, updateChatTitle, saveMessage, getMessages } from '@/src/db/chatMemory';

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

    // Ensure chat exists in DB
    await ensureChat(chatId, message.length > 40 ? message.slice(0, 40) + '...' : message);

    // Save user message to DB
    await saveMessage(chatId, 'user', message);

    // Load conversation history from DB (includes the message we just saved)
    const history = await getMessages(chatId);
    // Exclude the last message (current one) — we'll add it separately
    const priorMessages = history.slice(0, -1);

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
    let prompt = `You are Nice RAG, a document research assistant with access to a knowledge base of processed documents. Your job is to find accurate, complete answers to user questions by searching through text content, tables, and images from these documents.

## How to Search

- Start with a broad search using 'searchDocuments' to understand what's available
- If the initial results suggest table data would help, follow up with 'searchByType' filtered to "table"
- If the user asks about charts, diagrams, or visual content, search with type "image"
- If a result looks promising but needs more context, use 'getDocumentContext' to see surrounding content
- Reformulate your search query if initial results aren't relevant — try synonyms, related terms, or more specific phrasing
- Do multiple searches when the question is complex or spans multiple topics
- Use 'listDocuments' to see what documents are available when the user asks about the collection or a specific document

## How to Respond
- If you cannot find sufficient information to answer the question, say so clearly. Do not make up information.
- If results are ambiguous or conflicting across documents, present both perspectives with their sources.`;


    // Add document scope context if specific documents selected
    if (ingestionIds.length > 0) {
      prompt += `[Context: The user has selected specific documents. When using search tools, filter results to these document IDs: ${ingestionIds.join(', ')}. Always use the documentId parameter in your tool calls.]\n\n`;
    }

    // Add conversation history from DB
    if (priorMessages.length > 0) {
      for (const msg of priorMessages) {
        const prefix = msg.role === 'user' ? 'User' : 'Assistant';
        prompt += `${prefix}: ${msg.content}\n\n`;
      }
    }

    // Add current message
    prompt += message;

    console.log("--------------------------------");
    console.log("[prompt] Prompt:", prompt);
    console.log("--------------------------------");

    // Stream the response
    const stream = await ragAgent.stream(prompt, { maxSteps: 10 });

    let fullAssistantText = '';
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream.fullStream) {
            if (chunk.type === 'text-delta') {
              fullAssistantText += chunk.payload.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk.payload.text })}\n\n`),
              );
            } else if (chunk.type === 'tool-call') {
              const { toolCallId, toolName, args } = chunk.payload;
              // Strip internal metadata from args before sending to client
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

          // Save assistant response to DB after streaming completes
          if (fullAssistantText.trim()) {
            await saveMessage(chatId, 'assistant', fullAssistantText);
            // Update chat title from first user message if this is the first exchange
            if (priorMessages.length === 0) {
              await updateChatTitle(chatId, message.length > 40 ? message.slice(0, 40) + '...' : message);
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
