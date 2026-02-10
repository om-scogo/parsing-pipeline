'use client';

import { useState, useEffect } from 'react';
import type { DocumentData } from './DocumentCard';

interface DocumentSelectorProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function DocumentSelector({ selectedIds, onSelectionChange }: DocumentSelectorProps) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDocs() {
      try {
        const res = await fetch('/api/documents');
        if (!res.ok) return;
        const data = await res.json();
        setDocuments(data.filter((d: DocumentData) => d.status === 'ready'));
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchDocs();
  }, []);

  const toggleDocument = (id: string) => {
    if (id === 'all') {
      onSelectionChange([]);
      return;
    }
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((s) => s !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />;
  }

  if (documents.length === 0) {
    return <p className="text-xs text-gray-600">No documents available</p>;
  }

  const isAllSelected = selectedIds.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-500 mr-1">Scope:</span>
      <button
        onClick={() => toggleDocument('all')}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          isAllSelected
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
        }`}
      >
        All
      </button>
      {documents.map((doc) => (
        <button
          key={doc.id}
          onClick={() => toggleDocument(doc.id)}
          title={doc.fileName}
          className={`max-w-[180px] truncate rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            selectedIds.includes(doc.id)
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          {doc.fileName}
        </button>
      ))}
    </div>
  );
}
