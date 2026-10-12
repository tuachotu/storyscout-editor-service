import { describe, expect, it } from 'vitest';

import { loadPrompt, promptInstructions } from '../src/editor/prompt.js';

describe('editor v2 prompt', () => {
  it('defines language-aware summaries and conditional translation', async () => {
    const prompt = await loadPrompt('prompts/editor.v2.json');
    const instructions = promptInstructions(prompt);
    expect(prompt.version).toBe(2);
    expect(instructions).toContain('dominant narrative language');
    expect(instructions).toContain('summary lines in English');
    expect(instructions).toContain('summary lines in the original');
    expect(instructions).toContain('set englishTranslation to null');
  });
});
