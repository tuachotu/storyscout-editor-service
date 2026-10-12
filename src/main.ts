import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { OpenAiLlmClient } from '@storyscout/llm-client';
import pino from 'pino';

import { configPathFromArgs, loadConfig } from './config.js';
import { LlmEditor } from './editor/editor.js';
import { loadPrompt } from './editor/prompt.js';
import { TranscriptProcessor } from './editor/processor.js';
import { SqsConsumer } from './queue/consumer.js';
import { buildServer } from './server.js';
import { S3EditorStorage } from './storage/s3-editor-storage.js';

const logger = pino();
const config = await loadConfig(configPathFromArgs(process.argv.slice(2)));
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is required');

const llm = new OpenAiLlmClient({ apiKey, defaultModel: config.llm.model });
const prompt = await loadPrompt(config.editor.promptFile);
const editor = new LlmEditor(
  llm,
  prompt,
  config.editor.maxTranscriptBytes,
  config.llm.maxOutputTokens,
);
const s3 = new S3Client({ region: config.aws.region });
const storage = new S3EditorStorage(
  s3,
  config.storage.bucket,
  config.storage.transcriptKeyTemplate,
  config.storage.refinedOutputPrefixTemplate,
  config.editor.maxTranscriptBytes,
);
const processor = new TranscriptProcessor(storage, editor, logger);
const consumer = new SqsConsumer(
  new SQSClient({ region: config.aws.region }),
  config.queue.url,
  config.queue.waitTimeSeconds,
  config.queue.visibilityTimeoutSeconds,
  processor,
  logger,
  config.queue.startPaused,
);
const server = buildServer(editor, consumer);

consumer.start();
await server.listen({ host: config.server.host, port: config.server.port });
logger.info({ host: config.server.host, port: config.server.port }, 'Editor service started');

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Editor service stopping');
  await server.close();
  await consumer.stop();
  s3.destroy();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
