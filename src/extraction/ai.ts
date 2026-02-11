import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';
import { createAzure, AzureOpenAIProvider } from '@ai-sdk/azure';
import { generateText, LanguageModel } from 'ai';
import { OPENAI_API_KEY, OPENAI_BASE_URL, AZURE_OPENAI_CHAT_API_KEY, AZURE_OPENAI_CHAT_ENDPOINT } from "./../env";

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

export function getAzureProvider(): AzureOpenAIProvider {
    if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set");
    }
    return createAzure({
        apiKey: AZURE_OPENAI_CHAT_API_KEY,
        baseURL: AZURE_OPENAI_CHAT_ENDPOINT,
    });
}

export function getModel(): LanguageModel {
    return getProvider()(AZURE_MODEL_ID);
}

export function getReasoningModel(): LanguageModel {
    return getAzureProvider()('gpt-5-mini');
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
    console.log("Generating table summary for content:", tableContent.slice(0, 8000));
    const prompt = `You are a data analyst summarizing a table for a search index.

## Input
The following is an HTML representation of a table extracted from a spreadsheet (CSV/XLSX).

## Task
Write a concise summary (4-6 sentences) that covers:
1. **Subject**: What is this table about? (e.g., "Monthly sales by region", "Student enrollment data")
2. **Structure**: How many rows/columns, and what are the key column headers?
3. **Key columns & data types**: Name the most important columns and what kind of data they hold (dates, currency, categories, metrics, etc.)
4. **Context clues**: If the table contains units, currency symbols, country names, or domain-specific terms, mention them explicitly.

## Rules
- Write in plain natural language — no HTML, no markdown tables, no bullet points.
- Prefer specific names, numbers, and terms from the data over generic descriptions.
- If the table is truncated, say so and summarize only what is visible.
- Do NOT fabricate data that isn't present in the table.

## Table content:
${tableContent.slice(0, 8000)}`;
    const { text } = await generateText({
        model: getModel(),
        prompt: prompt,
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
