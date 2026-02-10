'use client';

import { useState, useRef, useCallback } from 'react';

interface UploadZoneProps {
  onUploadComplete: () => void;
}

interface UploadItem {
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processQueue = useCallback(async (items: UploadItem[]) => {
    setIsProcessing(true);

    for (let i = 0; i < items.length; i++) {
      setUploads((prev) =>
        prev.map((u, idx) => (idx === i ? { ...u, status: 'uploading' } : u)),
      );

      try {
        const formData = new FormData();
        formData.append('file', items[i].file);

        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: 'done' } : u)),
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((u, idx) =>
            idx === i
              ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
              : u,
          ),
        );
      }
    }

    setIsProcessing(false);
    onUploadComplete();

    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.status === 'error'));
    }, 3000);
  }, [onUploadComplete]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const validFiles: UploadItem[] = [];

      for (const file of Array.from(files)) {
        const ext = file.name.toLowerCase().split('.').pop();
        if (!ext || !['pdf', 'xlsx', 'csv', 'docx', 'doc'].includes(ext)) {
          validFiles.push({ file, status: 'error', error: 'Unsupported file type' });
          continue;
        }
        if (file.size > 50 * 1024 * 1024) {
          validFiles.push({ file, status: 'error', error: 'File exceeds 50MB limit' });
          continue;
        }
        validFiles.push({ file, status: 'queued' });
      }

      setUploads(validFiles);

      const toUpload = validFiles.filter((f) => f.status === 'queued');
      if (toUpload.length > 0 && !isProcessing) {
        processQueue(validFiles);
      }
    },
    [isProcessing, processQueue],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx,.csv,.docx,.doc"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <svg
          className="mx-auto h-8 w-8 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="mt-2 text-xs font-medium text-gray-600">Drop files here</p>
        <p className="mt-0.5 text-xs text-gray-400">PDF, XLSX, CSV, DOCX, DOC</p>
      </div>

      {uploads.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {uploads.map((upload, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded border border-gray-200 px-3 py-1.5"
            >
              <span className="truncate text-xs text-gray-600">{upload.file.name}</span>
              <span className="ml-2 flex-shrink-0">
                {upload.status === 'queued' && (
                  <span className="text-xs text-gray-400">Queued</span>
                )}
                {upload.status === 'uploading' && (
                  <span className="text-xs text-blue-500">Uploading...</span>
                )}
                {upload.status === 'done' && (
                  <span className="text-xs text-green-600">Processing</span>
                )}
                {upload.status === 'error' && (
                  <span className="text-xs text-red-500">{upload.error}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
