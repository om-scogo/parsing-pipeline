import * as dotenv from 'dotenv';
dotenv.config();

export const UNSTRUCTERED_API_KEY = process.env.UNSTRUCTERED_API_KEY;
export const UNSTRUCTERED_BASE_URL = process.env.UNSTRUCTERED_BASE_URL;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
export const AZURE_OPENAI_CHAT_API_KEY = process.env.AZURE_OPENAI_CHAT_API_KEY;
export const AZURE_OPENAI_CHAT_ENDPOINT = process.env.AZURE_OPENAI_CHAT_ENDPOINT;
export const CHROMA_API_KEY = process.env.CHROMA_API_KEY;
export const CHROMA_BASE_URL = process.env.CHROMA_BASE_URL;
export const MONGODB_URI = process.env.MONGODB_URI;
export const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;