import { DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it, vi } from 'vitest';

import { processMessage } from '../src/queue/consumer.js';

function body(): string {
  return JSON.stringify({
    Records: [
      {
        eventName: 'ObjectCreated:Put',
        s3: {
          bucket: { name: 'bucket' },
          object: { key: 'recordings%2Fp%2Fr%2Ftranscription.txt' },
        },
      },
    ],
  });
}

describe('processMessage', () => {
  it('deletes the SQS message only after processing succeeds', async () => {
    const send = vi.fn().mockResolvedValue({});
    const process = vi.fn().mockResolvedValue(undefined);
    await processMessage(
      { send } as never,
      'queue',
      { Body: body(), ReceiptHandle: 'receipt' },
      { process },
    );
    expect(process).toHaveBeenCalledWith('bucket', 'recordings/p/r/transcription.txt');
    expect(send.mock.calls[0]![0]).toBeInstanceOf(DeleteMessageCommand);
  });

  it('does not acknowledge a failed message', async () => {
    const send = vi.fn();
    const process = vi.fn().mockRejectedValue(new Error('failed'));
    await expect(
      processMessage(
        { send } as never,
        'queue',
        { Body: body(), ReceiptHandle: 'receipt' },
        { process },
      ),
    ).rejects.toThrow('failed');
    expect(send).not.toHaveBeenCalled();
  });
});
