import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { TranscriptProcessor } from '../src/editor/processor.js';
import type { S3EditorStorage } from '../src/storage/s3-editor-storage.js';

const identity = { participantGuid: 'person', recordingId: 'recording' };

function storage(outputsExist = false): {
  store: S3EditorStorage;
  readTranscript: ReturnType<typeof vi.fn>;
  saveOutputs: ReturnType<typeof vi.fn>;
} {
  const readTranscript = vi.fn(() => Promise.resolve('Draft'));
  const saveOutputs = vi.fn(() => Promise.resolve());
  const store = {
    identifyEvent: vi.fn(() => identity),
    outputsExist: vi.fn(() => Promise.resolve(outputsExist)),
    readTranscript,
    saveOutputs,
    outputKeys: vi.fn(() => ({
      summary: 'refined/summary.txt',
      originalLanguageSummary: 'refined/summary.original.txt',
      refinedManuscript: 'refined/manuscript.txt',
      englishTranslation: 'refined/manuscript.en.txt',
      manifest: 'refined/editor-result.json',
    })),
  } as unknown as S3EditorStorage;
  return { store, readTranscript, saveOutputs };
}

describe('TranscriptProcessor', () => {
  it('skips complete duplicate output sets', async () => {
    const { store, readTranscript } = storage(true);
    const refine = vi.fn();
    await new TranscriptProcessor(store, { refine }, pino({ enabled: false })).process(
      'bucket',
      'key',
    );
    expect(refine).not.toHaveBeenCalled();
    expect(readTranscript).not.toHaveBeenCalled();
  });

  it('regenerates and saves an incomplete output set', async () => {
    const { store, saveOutputs } = storage();
    const result = {
      sourceLanguage: { code: 'hi', name: 'Hindi' },
      summary: ['One', 'Two'],
      originalLanguageSummary: ['एक', 'दो'],
      refinedManuscript: 'Refined',
      englishTranslation: 'English',
    };
    const refine = vi.fn(() => Promise.resolve(result));
    await new TranscriptProcessor(store, { refine }, pino({ enabled: false })).process(
      'bucket',
      'key',
    );
    expect(refine).toHaveBeenCalledWith({ manuscript: 'Draft' });
    expect(saveOutputs).toHaveBeenCalledWith(identity, result);
  });
});
