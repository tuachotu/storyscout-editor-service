import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { configPathFromArgs, loadConfig } from '../src/config.js';

describe('configuration', () => {
  it('loads YAML and resolves templates and prompt path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'editor-config-'));
    const path = join(directory, 'config.yaml');
    await writeFile(
      path,
      `aws: { region: us-east-1 }
storage:
  bucket: bucket-name
  transcriptKeyTemplate: input/{participantGuid}/{recordingId}/transcription.txt
  refinedOutputPrefixTemplate: output/{participantGuid}/{recordingId}/refined
queue:
  url: https://sqs.us-east-1.amazonaws.com/123/editor
  waitTimeSeconds: 20
  visibilityTimeoutSeconds: 60
  startPaused: false
llm: { provider: openai, model: test-model, maxOutputTokens: 100 }
server: { host: 127.0.0.1, port: 3003 }
editor: { promptFile: prompt.json, maxTranscriptBytes: 1000 }
`,
    );
    const config = await loadConfig(path);
    expect(config.storage.transcriptKeyTemplate.match('input/p/r/transcription.txt')).toEqual({
      participantGuid: 'p',
      recordingId: 'r',
    });
    expect(config.editor.promptFile).toBe(join(directory, 'prompt.json'));
  });

  it('selects a config path from arguments', () => {
    expect(configPathFromArgs([])).toBe('config/editor.config.yaml');
    expect(configPathFromArgs(['--config', 'custom.yaml'])).toBe('custom.yaml');
    expect(() => configPathFromArgs(['--config'])).toThrow();
  });
});
