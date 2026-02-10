'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import UploadZone from '@/components/UploadZone';
import DocumentList from '@/components/DocumentList';
import ChatMessage, { Message } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import ChatHistory, { ChatSession } from '@/components/ChatHistory';

const STARTER_QUESTIONS = [
  'Summarize this document',
  'What are the key findings?',
  'Show me any tables with financial data',
];

const STORAGE_KEY = 'nicerag-chat-sessions';

function loadSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // storage full or unavailable
  }
}

function titleFromMessages(messages: Message[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New Chat';
  return first.content.length > 40
    ? first.content.slice(0, 40) + '...'
    : first.content;
}

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  // Chat session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
  }, []);

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      saveSessions(sessions);
    }
  }, [sessions]);

  // Save current messages into the active session whenever messages change
  useEffect(() => {
    if (!activeChatId || messages.length === 0) return;
    // Only save messages that have content (skip empty assistant placeholders)
    const nonEmpty = messages.filter(
      (m) => !(m.role === 'assistant' && m.content === ''),
    );
    if (nonEmpty.length === 0) return;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeChatId
          ? { ...s, messages: nonEmpty, title: titleFromMessages(nonEmpty) }
          : s,
      ),
    );
  }, [messages, activeChatId]);

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

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }, []);

  const handleDocumentsLoaded = useCallback((readyIds: string[]) => {
    setSelectedDocIds(readyIds);
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setActiveChatId(null);
    setAutoScroll(true);
  }, []);

  const selectChat = useCallback(
    (id: string) => {
      if (isStreaming) return;
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      setActiveChatId(id);
      setMessages(session.messages);
      setAutoScroll(true);
    },
    [sessions, isStreaming],
  );

  const deleteChat = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== id);
        saveSessions(updated);
        return updated;
      });
      if (activeChatId === id) {
        setMessages([]);
        setActiveChatId(null);
      }
    },
    [activeChatId],
  );

  const sendMessage = async (text: string) => {
    if (isStreaming) return;

    // If no active chat, create a new session
    let chatId = activeChatId;
    if (!chatId) {
      chatId = Date.now().toString();
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
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setAutoScroll(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          conversationHistory: history.length > 0 ? history : undefined,
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
              selectedDocIds={selectedDocIds}
              onToggleSelect={handleToggleSelect}
              onDocumentsLoaded={handleDocumentsLoaded}
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
                  msg.role === 'assistant' && msg.content === '' ? null : (
                    <ChatMessage key={msg.id} message={msg} />
                  ),
                )}

                {isStreaming && messages[messages.length - 1]?.content === '' && (
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
