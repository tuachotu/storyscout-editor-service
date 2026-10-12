import { LlmError } from '@storyscout/llm-client';
import { describe, expect, it, vi } from 'vitest';

import { buildServer } from '../src/server.js';

const consumer = {
  status: vi.fn(() => ({ state: 'running' as const, inFlight: false })),
  pause: vi.fn(() => ({ state: 'paused' as const, inFlight: false })),
  resume: vi.fn(() => ({ state: 'running' as const, inFlight: false })),
};

describe('editor HTTP API', () => {
  it('returns the shared editor JSON result', async () => {
    const result = {
      sourceLanguage: { code: 'en', name: 'English' },
      summary: ['One.', 'Two.'],
      originalLanguageSummary: ['One.', 'Two.'],
      refinedManuscript: 'Refined.',
      englishTranslation: null,
    };
    const refine = vi.fn().mockResolvedValue(result);
    const app = buildServer({ refine }, consumer);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/editor/refine',
      payload: { manuscript: 'Draft', model: 'selected-model' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(result);
    expect(refine).toHaveBeenCalledWith({ manuscript: 'Draft', model: 'selected-model' });
    await app.close();
  });

  it('returns controlled validation and provider errors', async () => {
    const app = buildServer(
      {
        refine: vi
          .fn()
          .mockRejectedValue(new LlmError('RATE_LIMITED', 'Try later', { retryable: true })),
      },
      consumer,
    );
    expect(
      (await app.inject({ method: 'POST', url: '/v1/editor/refine', payload: {} })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/editor/refine',
          payload: { manuscript: 'Draft' },
        })
      ).statusCode,
    ).toBe(429);
    await app.close();
  });
});
