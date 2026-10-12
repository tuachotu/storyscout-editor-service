import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

import { KeyTemplate } from './storage/key-template.js';

const ConfigSchema = z.strictObject({
  aws: z.strictObject({ region: z.string().min(1) }),
  storage: z.strictObject({
    bucket: z.string().min(3),
    transcriptKeyTemplate: z.string().min(1),
    refinedOutputPrefixTemplate: z.string().min(1),
  }),
  queue: z.strictObject({
    url: z.url(),
    waitTimeSeconds: z.number().int().min(1).max(20),
    visibilityTimeoutSeconds: z.number().int().min(30).max(43_200),
    startPaused: z.boolean(),
  }),
  llm: z.strictObject({
    provider: z.literal('openai'),
    model: z.string().min(1),
    maxOutputTokens: z.number().int().positive(),
  }),
  server: z.strictObject({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65_535),
  }),
  editor: z.strictObject({
    promptFile: z.string().min(1),
    maxTranscriptBytes: z.number().int().positive(),
  }),
});

export interface EditorConfig {
  aws: { region: string };
  storage: {
    bucket: string;
    transcriptKeyTemplate: KeyTemplate;
    refinedOutputPrefixTemplate: KeyTemplate;
  };
  queue: z.infer<typeof ConfigSchema>['queue'];
  llm: z.infer<typeof ConfigSchema>['llm'];
  server: z.infer<typeof ConfigSchema>['server'];
  editor: { promptFile: string; maxTranscriptBytes: number };
}

export async function loadConfig(path: string): Promise<EditorConfig> {
  const absolutePath = resolve(path);
  const raw: unknown = parse(await readFile(absolutePath, 'utf8'));
  const config = ConfigSchema.parse(raw);
  return {
    ...config,
    storage: {
      bucket: config.storage.bucket,
      transcriptKeyTemplate: new KeyTemplate(config.storage.transcriptKeyTemplate),
      refinedOutputPrefixTemplate: new KeyTemplate(config.storage.refinedOutputPrefixTemplate),
    },
    editor: {
      ...config.editor,
      promptFile: resolve(dirname(absolutePath), config.editor.promptFile),
    },
  };
}

export function configPathFromArgs(args: string[]): string {
  const index = args.indexOf('--config');
  if (index === -1) return 'config/editor.config.yaml';
  const path = args[index + 1];
  if (!path) throw new Error('--config requires a path');
  return path;
}
