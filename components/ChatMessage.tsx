'use client';

import { useMemo } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const { cleanText, sources } = useMemo(() => {
    if (isUser) return { cleanText: message.content, sources: [] };
    return parseSources(message.content);
  }, [message.content, isUser]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? '' : 'w-full max-w-[85%]'}`}>
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
