import { describe, expect, it } from 'vitest';

import { parseS3Events } from '../src/events/s3-event.js';

describe('parseS3Events', () => {
  it('decodes object-created events', () => {
    const events = parseS3Events(
      JSON.stringify({
        Records: [
          {
            eventName: 'ObjectCreated:Put',
            s3: { bucket: { name: 'bucket' }, object: { key: 'recordings%2Fp+1%2Ft.txt' } },
          },
        ],
      }),
    );
    expect(events).toEqual([{ bucket: 'bucket', key: 'recordings/p 1/t.txt' }]);
  });

  it('ignores S3 test events', () => {
    expect(parseS3Events(JSON.stringify({ Event: 's3:TestEvent' }))).toEqual([]);
  });
});
