import type { LlmClient, StructuredGenerationRequest } from '@storyscout/llm-client';
import { describe, expect, it, vi } from 'vitest';

import { LlmEditor } from '../src/editor/editor.js';
import type { EditorPrompt } from '../src/editor/prompt.js';

const prompt: EditorPrompt = {
  id: 'editor',
  version: 1,
  instructions: ['Preserve facts'],
  input: { manuscriptField: 'manuscript' },
  output: { schemaName: 'editor_result', strict: true },
};

describe('LlmEditor', () => {
  it('sends JSON input and validates the exact structured result', async () => {
    const value = {
      sourceLanguage: { code: 'hi', name: 'Hindi' },
      summary: ['A family story.', 'It takes place in Delhi.'],
      originalLanguageSummary: ['एक परिवार की कहानी।', 'यह दिल्ली में घटती है।'],
      refinedManuscript: 'परिष्कृत।',
      englishTranslation: 'Refined.',
    };
    const generateStructured = vi.fn().mockResolvedValue({
      value,
      provider: 'fake',
      model: 'fake',
    });
    const editor = new LlmEditor({ generateStructured } as unknown as LlmClient, prompt, 1000, 500);

    await expect(editor.refine({ manuscript: ' Draft ', model: 'chosen' })).resolves.toEqual(value);
    const request = generateStructured.mock.calls[0]![0] as StructuredGenerationRequest<
      typeof value
    >;
    expect(JSON.parse(request.input)).toEqual({ manuscript: ' Draft ' });
    expect(request).toMatchObject({
      model: 'chosen',
      schemaName: 'editor_result',
      maxOutputTokens: 500,
    });
    expect(request.validate?.(value)).toEqual(value);
    expect(() => request.validate?.({ ...value, extra: true })).toThrow();
  });

  it('enforces conditional English translation', async () => {
    const generateStructured = vi.fn();
    const editor = new LlmEditor({ generateStructured } as unknown as LlmClient, prompt, 1000, 500);
    await editor.refine({ manuscript: 'Draft' }).catch(() => undefined);
    const request = generateStructured.mock.calls[0]![0] as StructuredGenerationRequest<unknown>;

    expect(() =>
      request.validate?.({
        sourceLanguage: { code: 'en', name: 'English' },
        summary: ['One', 'Two'],
        originalLanguageSummary: ['One', 'Two'],
        refinedManuscript: 'Refined',
        englishTranslation: 'Refined',
      }),
    ).toThrow('must not include');
    expect(() =>
      request.validate?.({
        sourceLanguage: { code: 'hi', name: 'Hindi' },
        summary: ['One', 'Two'],
        originalLanguageSummary: ['एक', 'दो'],
        refinedManuscript: 'परिष्कृत',
        englishTranslation: null,
      }),
    ).toThrow('requires');
    expect(
      request.validate?.({
        sourceLanguage: { code: 'EN', name: 'English' },
        summary: ['One', 'Two'],
        originalLanguageSummary: ['One', 'Two'],
        refinedManuscript: 'Refined',
        englishTranslation: null,
      }),
    ).toMatchObject({ sourceLanguage: { code: 'en' }, englishTranslation: null });
  });

  it('rejects empty and oversized manuscripts before calling the LLM', async () => {
    const generateStructured = vi.fn();
    const editor = new LlmEditor({ generateStructured } as unknown as LlmClient, prompt, 4, 500);
    await expect(editor.refine({ manuscript: ' ' })).rejects.toThrow('must not be empty');
    await expect(editor.refine({ manuscript: '12345' })).rejects.toThrow('byte limit');
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
