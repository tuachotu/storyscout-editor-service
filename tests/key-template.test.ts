import { describe, expect, it } from 'vitest';

import { KeyTemplate } from '../src/storage/key-template.js';

describe('KeyTemplate', () => {
  it('matches and renders the default templates', () => {
    const input = new KeyTemplate('recordings/{participantGuid}/{recordingId}/transcription.txt');
    const identity = input.match('recordings/person-1/recording-1/transcription.txt');
    expect(identity).toEqual({ participantGuid: 'person-1', recordingId: 'recording-1' });
    expect(
      new KeyTemplate('archive/{recordingId}/{participantGuid}/refined').render(identity!),
    ).toBe('archive/recording-1/person-1/refined');
  });

  it.each([
    '/recordings/{participantGuid}/{recordingId}',
    'recordings/../{participantGuid}/{recordingId}',
    'recordings/{participantGuid}/{unknown}/{recordingId}',
    'recordings/{participantGuid}/missing',
  ])('rejects unsafe or invalid template %s', (value) => {
    expect(() => new KeyTemplate(value)).toThrow();
  });
});
