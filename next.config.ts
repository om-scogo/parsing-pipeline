import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@temporalio/client',
    '@temporalio/workflow',
    'mongodb',
    'chromadb',
    '@mastra/core',
    '@ai-sdk/openai',
    'ai',
  ],
};

export default nextConfig;
