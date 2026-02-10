'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

const components: Components = {
  table: ({ children, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-200 text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-gray-100" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600" {...props}>
      {children}
    </td>
  ),
  p: ({ children, ...props }) => (
    <p className="my-2 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="mb-2 mt-4 text-lg font-bold text-gray-900" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mb-2 mt-3 text-base font-bold text-gray-900" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-1 mt-3 text-sm font-bold text-gray-800" {...props}>{children}</h3>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-2 ml-5 list-disc space-y-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-2 ml-5 list-decimal space-y-1" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm" {...props}>{children}</li>
  ),
  code: ({ children, className, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono text-gray-700" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={`block overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs font-mono text-gray-100 ${className || ''}`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="my-3" {...props}>{children}</pre>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-gray-800" {...props}>{children}</strong>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-2 border-l-2 border-gray-300 pl-3 italic text-gray-500" {...props}>
      {children}
    </blockquote>
  ),
};

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
