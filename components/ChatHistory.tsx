'use client';

import { Message } from './ChatMessage';

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

interface ChatHistoryProps {
  sessions: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
}

export default function ChatHistory({
  sessions,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
}: ChatHistoryProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header + New Chat */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-md font-semibold text-gray-800 whitespace-nowrap">
          Chat History
        </span>
        <button
          onClick={onNewChat}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="New chat"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            No conversations yet
          </p>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectChat(session.id)}
              className={`group flex w-full items-center gap-2 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-100 ${
                activeChatId === session.id ? 'bg-gray-100' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-700">{session.title}</p>
                <p className="text-xs text-gray-400">
                  {new Date(session.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(session.id);
                }}
                className="flex-shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                title="Delete chat"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
