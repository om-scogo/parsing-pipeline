// import '../env';
// import { ragAgent } from './index';

// const TEST_QUERIES = [
//   {
//     name: 'Text retrieval',
//     query: 'What are the main topics covered in the documents?',
//   },
//   {
//     name: 'Table-specific retrieval',
//     query: 'Show me any tables with financial data or statistics.',
//   },
//   {
//     name: 'Image reference retrieval',
//     query: 'Are there any charts, diagrams, or images in the documents? Describe them.',
//   },
//   {
//     name: 'Multi-document query',
//     query: 'List all available documents and summarize what each contains.',
//   },
//   {
//     name: 'No results expected',
//     query: 'What is the recipe for chocolate cake mentioned in the documents?',
//   },
// ];

// async function runTest(name: string, query: string) {
//   console.log(`\n${'='.repeat(60)}`);
//   console.log(`TEST: ${name}`);
//   console.log(`QUERY: ${query}`);
//   console.log('='.repeat(60));

//   try {
//     const response = await ragAgent.generate(query, { maxSteps: 10 });

//     console.log(`\nRESPONSE:\n${response.text}`);

//     if (response.steps?.length) {
//       console.log(`\nSTEPS: ${response.steps.length}`);
//       for (const step of response.steps) {
//         if (step.toolCalls?.length) {
//           for (const call of step.toolCalls) {
//             const toolCall = call as { toolName?: string; args?: unknown };
//             console.log(`  -> Tool: ${toolCall.toolName ?? 'unknown'}(${JSON.stringify(toolCall.args ?? {}).slice(0, 100)})`);
//           }
//         }
//       }
//     }

//     console.log(`\nTOKENS: ${JSON.stringify(response.usage)}`);
//   } catch (err) {
//     console.error(`ERROR: ${err instanceof Error ? err.message : err}`);
//   }
// }

// async function main() {
//   console.log('RAG Agent Test Suite');
//   console.log(`Running ${TEST_QUERIES.length} test queries...\n`);

//   for (const { name, query } of TEST_QUERIES) {
//     await runTest(name, query);
//   }

//   console.log('\n\nAll tests completed.');
//   process.exit(0);
// }

// main().catch((err) => {
//   console.error('Fatal error:', err);
//   process.exit(1);
// });


import { ragAgent } from './index';

const main = async () => {
  // const response = await ragAgent.generate("Give me the revenue from operations for half year ended September 30,2022");
  const response = await ragAgent.generate("Give me the consolidated cash flow statement for FY15");
  console.dir(response, { depth: null });
}

main();
