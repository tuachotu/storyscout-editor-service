import { LlmError } from '@storyscout/llm-client';
import Fastify, { type FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';

import type { Editor } from './editor/editor.js';
import type { SqsConsumer } from './queue/consumer.js';

const RequestSchema = z.strictObject({
  manuscript: z.string().min(1),
  model: z.string().min(1).optional(),
});

export function buildServer(
  editor: Editor,
  consumer: Pick<SqsConsumer, 'status' | 'pause' | 'resume'>,
): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 2_000_000 });

  app.get('/health', () => ({ status: 'ok' }));
  app.get('/ready', () => ({ status: 'ready' }));
  app.get('/admin/editor/status', () => consumer.status());
  app.post('/admin/editor/pause', () => consumer.pause());
  app.post('/admin/editor/resume', () => consumer.resume());
  app.post('/v1/editor/refine', async (request, reply) => {
    try {
      const body = RequestSchema.parse(request.body);
      return await editor.refine({
        manuscript: body.manuscript,
        ...(body.model ? { model: body.model } : {}),
      });
    } catch (error) {
      if (error instanceof ZodError || isManuscriptValidationError(error)) {
        return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: error.message } });
      }
      if (error instanceof LlmError) {
        const status = error.code === 'RATE_LIMITED' ? 429 : error.retryable ? 503 : 502;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      request.log.error({ error }, 'Ad hoc editor request failed');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Editor request failed' },
      });
    }
  });
  return app;
}

function isManuscriptValidationError(error: unknown): error is Error {
  return error instanceof Error && /^Manuscript /.test(error.message);
}
