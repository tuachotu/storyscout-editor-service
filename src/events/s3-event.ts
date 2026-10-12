import { z } from 'zod';

const S3EventSchema = z.object({
  Records: z
    .array(
      z.object({
        eventName: z.string().startsWith('ObjectCreated:'),
        s3: z.object({
          bucket: z.object({ name: z.string().min(1) }),
          object: z.object({ key: z.string().min(1) }),
        }),
      }),
    )
    .min(1),
});

export interface TranscriptEvent {
  bucket: string;
  key: string;
}

export function parseS3Events(body: string): TranscriptEvent[] {
  const value: unknown = JSON.parse(body);
  if (
    typeof value === 'object' &&
    value !== null &&
    'Event' in value &&
    value.Event === 's3:TestEvent'
  ) {
    return [];
  }
  return S3EventSchema.parse(value).Records.map((record) => ({
    bucket: record.s3.bucket.name,
    key: decodeKey(record.s3.object.key),
  }));
}

function decodeKey(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll('+', ' '));
  } catch {
    throw new Error('The S3 event contains an invalid object key encoding');
  }
}
