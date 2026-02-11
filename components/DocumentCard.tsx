'use client';

import { useState } from 'react';

export interface DocumentData {
  id: string;
  fileName: string;
  status: 'processing' | 'ready' | 'failed';
  error?: string;
  chunkCounts?: { text: number; table: number; image: number };
  createdAt: string;
}

interface DocumentCardProps {
  document: DocumentData;
  onDelete: (id: string) => void;
}

export default function DocumentCard({ document, onDelete }: DocumentCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(document.id);
      }
    } catch {
      // Silently fail
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const isReady = document.status === 'ready';

  const date = new Date(document.createdAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-800">{document.fileName}</p>
            <p className="mt-0.5 text-xs text-gray-400">{formattedDate}</p>
          </div>
        </div>

        <div className="ml-2 flex items-center gap-1.5">
          {document.status === 'processing' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              Processing
            </span>
          )}
          {document.status === 'ready' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Ready
            </span>
          )}
          {document.status === 'failed' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Failed
            </span>
          )}

          {!showConfirm ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirm(true);
              }}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="Delete"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isDeleting ? '...' : 'Delete'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {document.status === 'ready' && document.chunkCounts && (
        <div className="mt-1.5 flex gap-2 pl-6 text-xs text-gray-400">
          <span>{document.chunkCounts.text} text</span>
          <span>{document.chunkCounts.table} tables</span>
          <span>{document.chunkCounts.image} images</span>
        </div>
      )}

      {document.status === 'failed' && document.error && (
        <p className="mt-1.5 text-xs text-red-400">{document.error}</p>
      )}
    </div>
  );
}
