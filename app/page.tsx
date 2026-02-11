'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { nanoid } from 'nanoid';
import UploadZone from '@/components/UploadZone';
import DocumentList from '@/components/DocumentList';
import ChatMessage, { Message, ToolCallInfo } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import ChatHistory, { ChatSession } from '@/components/ChatHistory';

const STARTER_QUESTIONS = [
  'Summarize this document',
  'What are the key findings?',
  'Show me any tables with financial data',
];

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  // Chat session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Load chat sessions from backend on mount
  useEffect(() => {
    fetch('/api/chats')
      .then((res) => res.json())
      .then((data) => {
        if (data.chats) {
          setSessions(
            data.chats.map((c: { id: string; title: string; createdAt: string }) => ({
              id: c.id,
              title: c.title,
              messages: [],
              createdAt: new Date(c.createdAt).getTime(),
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setAutoScroll(isNearBottom);
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setActiveChatId(null);
    setAutoScroll(true);
  }, []);

  const selectChat = useCallback(
    async (id: string) => {
      if (isStreaming) return;
      setActiveChatId(id);
      setAutoScroll(true);

      // Load messages from backend
      try {
        const res = await fetch(`/api/chat/${id}`);
        const data = await res.json();
        if (data.messages) {
          setMessages(
            data.messages.map((m: { role: string; content: string }, i: number) => ({
              id: `${id}-${i}`,
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          );
        }
      } catch {
        setMessages([]);
      }
    },
    [isStreaming],
  );

  const deleteChat = useCallback(
    async (id: string) => {
      // Delete from backend
      try {
        await fetch(`/api/chat/${id}`, { method: 'DELETE' });
      } catch {}
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeChatId === id) {
        setMessages([]);
        setActiveChatId(null);
      }
    },
    [activeChatId],
  );

  const sendMessage = async (text: string) => {
    if (isStreaming) return;

    // If no active chat, create a new session with a unique ID
    let chatId = activeChatId;
    if (!chatId) {
      chatId = nanoid();
      const newSession: ChatSession = {
        id: chatId,
        title: text.length > 40 ? text.slice(0, 40) + '...' : text,
        messages: [],
        createdAt: Date.now(),
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveChatId(chatId);
    }

    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setAutoScroll(true);

    const assistantId = nanoid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatId,
        }),
      });

      if (!res.ok) throw new Error('Chat request failed');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + data.content }
                    : m,
                ),
              );
            } else if (data.type === 'tool-call') {
              const tc: ToolCallInfo = {
                id: data.toolCallId,
                toolName: data.toolName,
                args: data.args ?? {},
                status: 'calling',
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolCalls: [...(m.toolCalls || []), tc] }
                    : m,
                ),
              );
            } else if (data.type === 'tool-result') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls || []).map((tc) =>
                          tc.id === data.toolCallId
                            ? { ...tc, status: 'completed' as const, result: data.result }
                            : tc,
                        ),
                      }
                    : m,
                ),
              );
            } else if (data.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content || 'Sorry, an error occurred. Please try again.' }
                    : m,
                ),
              );
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left Sidebar — Documents */}
      <aside
        className={`flex flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 transition-[width] duration-300 overflow-hidden ${
          sidebarOpen ? 'w-80' : 'w-0 border-r-0'
        }`}
      >
        <div className="w-80">
          {/* Sidebar header */}
          <div className="border-b border-gray-200 px-4 py-3">
            <span className="text-md font-semibold text-gray-800 whitespace-nowrap">Uploaded Documents</span>
          </div>

          {/* Upload */}
          <div className="border-b border-gray-200 p-4">
            <UploadZone onUploadComplete={() => setRefreshKey((k) => k + 1)} />
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto p-4">
            <DocumentList
              refreshKey={refreshKey}
            />
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <button
            onClick={() => setHistoryOpen((prev) => !prev)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title={historyOpen ? 'Hide chat history' : 'Show chat history'}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        {/* Chat messages */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center">
                <p className="mb-2 text-4xl font-medium text-gray-700">Nice RAG</p>
                <p className="mb-8 text-sm text-gray-400">
                  Ask a question about your documents
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTER_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500 transition-colors hover:border-blue-400 hover:text-gray-700"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) =>
                  msg.role === 'assistant' && msg.content === '' && !(msg.toolCalls?.length) ? null : (
                    <ChatMessage key={msg.id} message={msg} />
                  ),
                )}

                {isStreaming && messages[messages.length - 1]?.content === '' && !(messages[messages.length - 1]?.toolCalls?.length) && (
                  <div className="flex justify-start">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Input */}
        <ChatInput onSend={sendMessage} disabled={isStreaming} />
      </div>

      {/* Right Sidebar — Chat History */}
      <aside
        className={`flex flex-shrink-0 flex-col border-l border-gray-200 bg-gray-50 transition-[width] duration-300 overflow-hidden ${
          historyOpen ? 'w-72' : 'w-0 border-l-0'
        }`}
      >
        <div className="w-72">
          <ChatHistory
            sessions={sessions}
            activeChatId={activeChatId}
            onSelectChat={selectChat}
            onNewChat={startNewChat}
            onDeleteChat={deleteChat}
          />
        </div>
      </aside>
    </div>
  );
}
