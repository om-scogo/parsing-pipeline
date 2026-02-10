import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nice RAG',
  description: 'Nice RAG is a RAG agent that can chat with your documents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
