import { readFile } from 'node:fs/promises';

import { z } from 'zod';

const PromptSchema = z.strictObject({
  id: z.string().min(1),
  version: z.number().int().positive(),
  instructions: z.array(z.string().min(1)).min(1),
  input: z.strictObject({ manuscriptField: z.literal('manuscript') }),
  output: z.strictObject({ schemaName: z.string().min(1), strict: z.literal(true) }),
});

export type EditorPrompt = z.infer<typeof PromptSchema>;

export async function loadPrompt(path: string): Promise<EditorPrompt> {
  return PromptSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export function promptInstructions(prompt: EditorPrompt): string {
  return JSON.stringify({
    task: { id: prompt.id, version: prompt.version, instructions: prompt.instructions },
    expectedOutput: { schemaName: prompt.output.schemaName, strict: true },
  });
}
