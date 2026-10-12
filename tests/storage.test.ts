import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { KeyTemplate } from '../src/storage/key-template.js';
import { S3EditorStorage } from '../src/storage/s3-editor-storage.js';

const nonEnglishResult = {
  sourceLanguage: { code: 'hi', name: 'Hindi' },
  summary: ['One', 'Two'],
  originalLanguageSummary: ['एक', 'दो'],
  refinedManuscript: 'परिष्कृत',
  englishTranslation: 'English',
};

const englishResult = {
  sourceLanguage: { code: 'en', name: 'English' },
  summary: ['One', 'Two'],
  originalLanguageSummary: ['One', 'Two'],
  refinedManuscript: 'Refined',
  englishTranslation: null,
};

function createStorage(send: ReturnType<typeof vi.fn>): S3EditorStorage {
  return new S3EditorStorage(
    { send } as never,
    'bucket',
    new KeyTemplate('recordings/{participantGuid}/{recordingId}/transcription.txt'),
    new KeyTemplate('recordings/{participantGuid}/{recordingId}/refined'),
    1000,
  );
}

describe('S3EditorStorage', () => {
  it('reads strict UTF-8 and enforces the configured event template', async () => {
    const send = vi.fn((command: unknown) => {
      if (command instanceof HeadObjectCommand) return Promise.resolve({ ContentLength: 5 });
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({
          Body: {
            transformToByteArray: () => Promise.resolve(new TextEncoder().encode('Draft')),
          },
        });
      }
      return Promise.reject(new Error('Unexpected command'));
    });
    const storage = createStorage(send);
    expect(
      storage.identifyEvent('bucket', 'recordings/person/recording/transcription.txt'),
    ).toEqual({
      participantGuid: 'person',
      recordingId: 'recording',
    });
    expect(() =>
      storage.identifyEvent('other', 'recordings/person/recording/transcription.txt'),
    ).toThrow('Unexpected S3 bucket');
    await expect(storage.readTranscript('key')).resolves.toBe('Draft');
  });

  it('writes each JSON field to its exact output destination', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = createStorage(send);
    await storage.saveOutputs(
      { participantGuid: 'person', recordingId: 'recording' },
      nonEnglishResult,
    );
    const puts = send.mock.calls
      .map((call): unknown => call[0] as unknown)
      .filter((value) => value instanceof PutObjectCommand);
    expect(puts.map((put) => put.input.Key)).toEqual([
      'recordings/person/recording/refined/summary.txt',
      'recordings/person/recording/refined/summary.original.txt',
      'recordings/person/recording/refined/manuscript.txt',
      'recordings/person/recording/refined/manuscript.en.txt',
      'recordings/person/recording/refined/editor-result.json',
    ]);
    expect(puts.map((put) => put.input.Body as unknown)).toEqual([
      'One\nTwo\n',
      'एक\nदो\n',
      'परिष्कृत\n',
      'English\n',
      `${JSON.stringify(nonEnglishResult, null, 2)}\n`,
    ]);
    expect(puts.every((put) => put.input.ServerSideEncryption === 'AES256')).toBe(true);
  });

  it('does not write a translation object for English source content', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = createStorage(send);
    await storage.saveOutputs(
      { participantGuid: 'person', recordingId: 'recording' },
      englishResult,
    );
    const puts = send.mock.calls
      .map((call): unknown => call[0] as unknown)
      .filter((value) => value instanceof PutObjectCommand);
    expect(puts.map((put) => put.input.Key)).toEqual([
      'recordings/person/recording/refined/summary.txt',
      'recordings/person/recording/refined/summary.original.txt',
      'recordings/person/recording/refined/manuscript.txt',
      'recordings/person/recording/refined/editor-result.json',
    ]);
  });

  it.each([
    ['English', englishResult, 3],
    ['non-English', nonEnglishResult, 4],
  ])(
    'uses the manifest to validate a complete %s output set',
    async (_name, manifest, headCount) => {
      const send = vi.fn((command: unknown) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: { transformToString: () => Promise.resolve(JSON.stringify(manifest)) },
          });
        }
        if (command instanceof HeadObjectCommand) return Promise.resolve({});
        return Promise.reject(new Error('Unexpected command'));
      });
      const storage = createStorage(send);
      await expect(
        storage.outputsExist({ participantGuid: 'person', recordingId: 'recording' }),
      ).resolves.toBe(true);
      expect(
        send.mock.calls.filter(([command]) => command instanceof HeadObjectCommand),
      ).toHaveLength(headCount);
    },
  );

  it('treats a legacy output set without a manifest as incomplete', async () => {
    const send = vi.fn((command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return Promise.reject(Object.assign(new Error('missing'), { name: 'NotFound' }));
      }
      return Promise.resolve({});
    });
    const storage = createStorage(send);
    await expect(
      storage.outputsExist({ participantGuid: 'person', recordingId: 'recording' }),
    ).resolves.toBe(false);
  });
});
