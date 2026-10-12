import { z } from 'zod';

const SummarySchema = z.array(z.string().trim().min(1)).min(2).max(5);

export const EditorResultSchema = z
  .strictObject({
    sourceLanguage: z.strictObject({
      code: z
        .string()
        .trim()
        .regex(/^[a-z]{2}$/i)
        .transform((value) => value.toLowerCase()),
      name: z.string().trim().min(1),
    }),
    summary: SummarySchema,
    originalLanguageSummary: SummarySchema,
    refinedManuscript: z.string().trim().min(1),
    englishTranslation: z.string().trim().min(1).nullable(),
  })
  .superRefine((result, context) => {
    if (result.sourceLanguage.code === 'en' && result.englishTranslation !== null) {
      context.addIssue({
        code: 'custom',
        path: ['englishTranslation'],
        message: 'English source content must not include an English translation',
      });
    }
    if (result.sourceLanguage.code !== 'en' && result.englishTranslation === null) {
      context.addIssue({
        code: 'custom',
        path: ['englishTranslation'],
        message: 'Non-English source content requires an English translation',
      });
    }
  });

export type EditorResult = z.infer<typeof EditorResultSchema>;

export const EDITOR_RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sourceLanguage',
    'summary',
    'originalLanguageSummary',
    'refinedManuscript',
    'englishTranslation',
  ],
  properties: {
    sourceLanguage: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'name'],
      properties: {
        code: {
          type: 'string',
          description: 'Lowercase ISO 639-1 code for the original or dominant narrative language.',
          pattern: '^[a-z]{2}$',
        },
        name: {
          type: 'string',
          description: 'English name of the original or dominant narrative language.',
          minLength: 1,
        },
      },
    },
    summary: {
      type: 'array',
      description:
        'Two to five concise English lines describing the subject and notable people, places, and events. Do not invent information.',
      minItems: 2,
      maxItems: 5,
      items: { type: 'string', minLength: 1 },
    },
    originalLanguageSummary: {
      type: 'array',
      description:
        'Two to five concise lines in the original or dominant language covering the same facts as summary.',
      minItems: 2,
      maxItems: 5,
      items: { type: 'string', minLength: 1 },
    },
    refinedManuscript: {
      type: 'string',
      description:
        'The complete corrected manuscript, preserving facts, sequence, voice, cultural expressions, and storytelling flavor.',
      minLength: 1,
    },
    englishTranslation: {
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
      description:
        'A complete English translation of refinedManuscript for non-English sources; null when the source language is English.',
    },
  },
} as const;
