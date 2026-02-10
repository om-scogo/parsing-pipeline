import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import { UNSTRUCTERED_BASE_URL } from '../env';

export interface CreateJobOptions {
   strategy?: string;
   coordinates?: string;
   extract_image_block_types?: string;
}

export class Unstructured {
    private client: AxiosInstance;
    private formData: FormData;

    constructor(apiKey: string, baseURL?: string) {
        if (!apiKey) {
            throw new Error("unstructured-api-key is required");
        }

        this.client = axios.create({
            baseURL: baseURL || UNSTRUCTERED_BASE_URL,
            headers: {
                'accept': 'application/json',
                'content-type': 'multipart/form-data',
                'unstructured-api-key': apiKey,
            },
        });
        this.formData = new FormData();
    }

    /**
     * Parse a file using the Unstructured API.
     */
    async parseFile(filePath: string, options: CreateJobOptions) {
        this.formData.append('files', fs.createReadStream(filePath));
        for (const [key, value] of Object.entries(options)) {
            this.formData.append(key, value);
        }

        const response = await this.client.post('/general', this.formData, {
            headers: {
                ...this.formData.getHeaders(),
            },
        });
        return response.data;
    }
}