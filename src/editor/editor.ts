import type { LlmClient } from '@storyscout/llm-client';

import type { EditorPrompt } from './prompt.js';
import { promptInstructions } from './prompt.js';
import { EDITOR_RESULT_JSON_SCHEMA, EditorResultSchema, type EditorResult } from './schema.js';

export interface EditorRequest {
  manuscript: string;
  model?: string;
}

export interface Editor {
  refine(request: EditorRequest): Promise<EditorResult>;
}

export class LlmEditor implements Editor {
  constructor(
    private readonly llm: LlmClient,
    private readonly prompt: EditorPrompt,
    private readonly maxTranscriptBytes: number,
    private readonly maxOutputTokens: number,
  ) {}

  async refine(request: EditorRequest): Promise<EditorResult> {
    validateManuscript(request.manuscript, this.maxTranscriptBytes);
    const input = JSON.stringify({ manuscript: request.manuscript });
    const result = await this.llm.generateStructured<EditorResult>({
      input,
      instructions: promptInstructions(this.prompt),
      schemaName: this.prompt.output.schemaName,
      schema: EDITOR_RESULT_JSON_SCHEMA,
      validate: (value) => EditorResultSchema.parse(value),
      maxOutputTokens: this.maxOutputTokens,
      ...(request.model ? { model: request.model } : {}),
    });
    return result.value;
  }
}

export function validateManuscript(manuscript: string, maxBytes: number): void {
  if (!manuscript.trim()) throw new Error('Manuscript must not be empty');
  if (Buffer.byteLength(manuscript, 'utf8') > maxBytes) {
    throw new Error(`Manuscript exceeds the ${maxBytes} byte limit`);
  }
}
