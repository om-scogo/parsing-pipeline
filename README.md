# Extraction Workflow using Unstructured.io & Temporal.io

### How to run extraction workflow:

1. `temporal server start-dev` to start local [Temporal Server](https://github.com/temporalio/cli/#installation).
1. Add `UNSTRUCTURED_API_KEY`, `UNSTRUCTURED_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CHROMA_API_KEY` to .env
1. `npm install` to install dependencies.
1. `npm run start.watch` to start the Worker.
1. In another shell, `npm run workflow -- --file=<file_path>` to run the extraction Workflow Client.


### How to start UI interface

1. Make sure the Temporal worker is running (`npm run start.watch`).
1. `npm run dev` to start the Next.js dev server.
1. Open [http://localhost:3000](http://localhost:3000) in your browser.