'use client';

import { useState, useMemo } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

export interface ToolCallInfo {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'calling' | 'completed';
  result?: unknown;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallInfo[];
}

interface Source {
  label: string;
  file?: string;
  page?: string;
  type?: string;
}

function parseSources(text: string): { cleanText: string; sources: Source[] } {
  const sourceRegex = /\[Source:\s*([^\]]+)\]/g;
  const sources: Source[] = [];
  let match;

  while ((match = sourceRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    const parts = raw.split(',').map((s) => s.trim());

    const source: Source = { label: raw };
    for (const part of parts) {
      if (part.toLowerCase().startsWith('page')) {
        source.page = part;
      } else if (part.toLowerCase().startsWith('type')) {
        source.type = part.replace(/^type:\s*/i, '');
      } else if (!source.file) {
        source.file = part;
      }
    }
    sources.push(source);
  }

  // Deduplicate by label
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    if (seen.has(s.label)) return false;
    seen.add(s.label);
    return true;
  });

  const cleanText = text.replace(sourceRegex, '').replace(/\n{3,}/g, '\n\n').trim();
  return { cleanText, sources: unique };
}

function formatToolName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatArgValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

interface ResultItem {
  sourceFile?: string;
  page?: number;
  type?: string;
  score?: number;
  preview?: string;
  totalChunks?: number;
  textChunks?: number;
  tableChunks?: number;
  imageChunks?: number;
}

function resultSummary(result: unknown): string {
  if (!result || typeof result !== 'object') return String(result);
  const obj = result as Record<string, unknown>;
  if ('count' in obj) return `${obj.count} results found`;
  if ('totalDocuments' in obj) return `${obj.totalDocuments} documents`;
  if ('contextCount' in obj) return `${obj.contextCount} context chunks (pages ${obj.pageRange})`;
  if ('_summary' in obj) return 'Result available (truncated)';
  const keys = Object.keys(obj);
  if (keys.length <= 3) {
    return keys.map((k) => `${k}: ${formatArgValue(obj[k])}`).join(', ');
  }
  return `${keys.length} fields`;
}

function getResultItems(result: unknown): ResultItem[] | null {
  if (!result || typeof result !== 'object') return null;
  const obj = result as Record<string, unknown>;
  if (Array.isArray(obj.items) && obj.items.length > 0) return obj.items as ResultItem[];
  return null;
}

function ResultItemCard({ item, index }: { item: ResultItem; index: number }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(item.preview || item.totalChunks != null);

  const label = item.sourceFile
    ? item.sourceFile
    : item.preview
      ? item.preview.slice(0, 50) + (item.preview.length > 50 ? '...' : '')
      : `Item ${index + 1}`;

  return (
    <div className="rounded border border-gray-100 bg-gray-50/80">
      <button
        onClick={() => hasDetail && setOpen(!open)}
        className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs transition-colors ${hasDetail ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'}`}
      >
        <span className="text-gray-400 w-4 text-right flex-shrink-0">{index + 1}.</span>
        <span className="flex-1 truncate text-gray-600">{label}</span>
        {item.type && (
          <span className="rounded bg-gray-200 px-1 py-0.5 text-[10px] uppercase text-gray-500 flex-shrink-0">
            {item.type}
          </span>
        )}
        {item.score != null && (
          <span className="text-gray-400 flex-shrink-0">{item.score}</span>
        )}
        {item.page != null && (
          <span className="text-gray-400 flex-shrink-0">p.{item.page}</span>
        )}
        {hasDetail && (
          <svg
            className={`h-2.5 w-2.5 flex-shrink-0 text-gray-300 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
      {open && item.preview && (
        <div className="border-t border-gray-100 px-2 py-1.5 text-xs text-gray-500 leading-relaxed">
          {item.preview}
        </div>
      )}
      {open && item.totalChunks != null && (
        <div className="border-t border-gray-100 px-2 py-1.5 text-xs text-gray-500 flex gap-2">
          <span>text: {item.textChunks ?? 0}</span>
          <span>table: {item.tableChunks ?? 0}</span>
          <span>image: {item.imageChunks ?? 0}</span>
          <span className="text-gray-400">({item.totalChunks} total)</span>
        </div>
      )}
    </div>
  );
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);

  const displayArgs = Object.entries(toolCall.args).filter(
    ([k]) => !k.startsWith('__'),
  );

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-gray-400 transition-colors hover:text-gray-600"
      >
        {/* Status indicator */}
        {toolCall.status === 'calling' ? (
          <svg className="h-3 w-3 flex-shrink-0 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-3 w-3 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}

        {/* Tool name */}
        <span className="font-medium text-gray-500">{formatToolName(toolCall.toolName)}</span>

        {/* Brief arg hint when collapsed */}
        {!expanded && displayArgs.length > 0 && (
          <span className="truncate text-gray-400">
            — {displayArgs.map(([k, v]) => `${k}: ${formatArgValue(v)}`).join(', ')}
          </span>
        )}

        {/* Expand chevron */}
        <svg
          className={`ml-auto h-3 w-3 flex-shrink-0 text-gray-300 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {expanded && (
        <div className="ml-[18px] mt-0.5 mb-1 rounded border border-gray-100 bg-white px-2.5 py-1.5 text-xs">
          {/* Args */}
          {displayArgs.length > 0 && (
            <div className="space-y-0.5">
              {displayArgs.map(([key, value]) => (
                <div key={key} className="flex gap-1.5">
                  <span className="flex-shrink-0 text-gray-400">{key}:</span>
                  <span className="text-gray-600 break-all">{formatArgValue(value)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Result */}
          {toolCall.result !== undefined && (
            <div className="mt-1.5 border-t border-gray-50 pt-1.5">
              <div className="text-gray-400 mb-1">→ {resultSummary(toolCall.result)}</div>
              {getResultItems(toolCall.result) && (
                <div className="space-y-0.5 mt-1">
                  {getResultItems(toolCall.result)!.map((item, i) => (
                    <ResultItemCard key={i} item={item} index={i} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const { cleanText, sources } = useMemo(() => {
    if (isUser) return { cleanText: message.content, sources: [] };
    return parseSources(message.content);
  }, [message.content, isUser]);

  const toolCalls = message.toolCalls || [];

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? '' : 'w-full max-w-[85%]'}`}>
        {/* Tool calls — shown above the message bubble for assistant messages */}
        {!isUser && toolCalls.length > 0 && (
          <div className="mb-1.5 rounded-md border border-gray-100 bg-gray-50/50 px-2.5 py-1.5">
            <div className="space-y-0.5">
              {toolCalls.map((tc) => (
                <ToolCallItem key={tc.id} toolCall={tc} />
              ))}
            </div>
          </div>
        )}

        {/* Main message bubble */}
        {(isUser || cleanText) && (
          <div
            className={`rounded-lg px-4 py-3 ${
              isUser
                ? 'bg-blue-600 text-white'
                : 'bg-gray-50 border border-gray-200 text-gray-800'
            }`}
          >
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="text-sm">
                <MarkdownRenderer content={cleanText} />
              </div>
            )}
          </div>
        )}

        {/* Source chips below the message */}
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
            {sources.map((source, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500"
              >
                <svg className="h-3 w-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {source.file && <span className="truncate max-w-[120px]">{source.file}</span>}
                {source.page && <span className="text-gray-400">{source.page}</span>}
                {source.type && (
                  <span className="rounded bg-gray-200 px-1 py-0.5 text-[10px] uppercase text-gray-500">
                    {source.type}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
