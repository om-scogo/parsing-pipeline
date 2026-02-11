'use client';

import { useState, useEffect, useCallback } from 'react';
import DocumentCard, { DocumentData } from './DocumentCard';

interface DocumentListProps {
  refreshKey: number;
}

export default function DocumentList({ refreshKey }: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDocuments(data);
      setError(null);

    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshKey]);

  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      const processingDocs = documents.filter((d) => d.status === 'processing');

      for (const doc of processingDocs) {
        try {
          const res = await fetch(`/api/documents/${doc.id}/status`);
          if (!res.ok) continue;
          const status = await res.json();

          if (status.status !== 'processing') {
            setDocuments((prev) =>
              prev.map((d) =>
                d.id === doc.id
                  ? { ...d, status: status.status, chunkCounts: status.chunkCounts, error: status.error }
                  : d,
              ),
            );
          }
        } catch {
          // skip
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [documents]);

  const handleDelete = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs text-red-500">{error}</p>
        <button
          onClick={fetchDocuments}
          className="mt-2 text-xs text-blue-500 hover:text-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-gray-400">No documents yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
