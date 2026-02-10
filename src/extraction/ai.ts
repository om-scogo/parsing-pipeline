import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';
import { generateText, LanguageModel } from 'ai';
import { OPENAI_API_KEY, OPENAI_BASE_URL } from "./../env";

const AZURE_MODEL_ID = 'azure-gpt-4o-mini';
const EMBEDDING_MODEL_ID = 'text-embedding-3-small';

export function getProvider(): OpenAIProvider {
    if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set");
    }
    return createOpenAI({
        apiKey: OPENAI_API_KEY,
        baseURL: OPENAI_BASE_URL,
    });
}

export function getModel(): LanguageModel {
    return getProvider()(AZURE_MODEL_ID);
}

/**
 * Embedding model for document embeddings (same provider/config as getModel).
 * Uses EMBEDDING_MODEL env var, default 'text-embedding-3-small'.
 * For Azure, set EMBEDDING_MODEL to your embedding deployment name.
 */
export function getEmbeddingModel(): any {
    return getProvider().embedding(EMBEDDING_MODEL_ID);
}

/**
 * Generates a short searchable summary of a table (from text or HTML) for indexing/search.
 */
export async function generateTableSummary(tableContent: string): Promise<string> {
    const { text } = await generateText({
        model: getModel(),
        prompt: `You are given the content of a table in HTML format. Write a concise, searchable summary in 4-5 sentences that captures the main subject, key columns, and notable values. Use natural language so the summary can be used for search. Do not include HTML.\n\nTable content:\n${tableContent.slice(0, 8000)}`,
    });
    return text.trim();
}

/**
 * Generates an alt-text style description of an image from base64 data.
 */
export async function generateImageDescription(imageBase64: string, mimeType: string = 'image/png'): Promise<string> {
    const { text } = await generateText({
        model: getModel(),
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Describe this image in 4-5 sentences for accessibility and search. Focus on the main subject, layout, and any text or data visible.',
                    },
                    {
                        type: 'image',
                        image: imageBase64,
                        mediaType: mimeType,
                    },
                ],
            },
        ],
    });
    return text.trim();
}
