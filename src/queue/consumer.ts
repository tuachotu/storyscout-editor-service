import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { Logger } from 'pino';

import { parseS3Events } from '../events/s3-event.js';

export type ConsumerState = 'running' | 'pausing' | 'paused' | 'stopped';

export interface EventProcessor {
  process(bucket: string, transcriptKey: string): Promise<void>;
}

export class SqsConsumer {
  private state: ConsumerState;
  private inFlight = false;
  private loopPromise?: Promise<void>;
  private abortController?: AbortController;

  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly waitTimeSeconds: number,
    private readonly visibilityTimeoutSeconds: number,
    private readonly processor: EventProcessor,
    private readonly logger: Logger,
    startPaused = false,
  ) {
    this.state = startPaused ? 'paused' : 'running';
  }

  start(): void {
    if (this.loopPromise) return;
    this.loopPromise = this.loop();
  }

  status(): { state: ConsumerState; inFlight: boolean } {
    return { state: this.state, inFlight: this.inFlight };
  }

  pause(): ReturnType<SqsConsumer['status']> {
    if (this.state !== 'stopped') {
      this.state = this.inFlight ? 'pausing' : 'paused';
      if (!this.inFlight) this.abortController?.abort();
    }
    return this.status();
  }

  resume(): ReturnType<SqsConsumer['status']> {
    if (this.state !== 'stopped') this.state = 'running';
    return this.status();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    this.abortController?.abort();
    await this.loopPromise;
  }

  private async loop(): Promise<void> {
    while (this.state !== 'stopped') {
      if (this.state !== 'running') {
        await delay(100);
        continue;
      }
      this.abortController = new AbortController();
      try {
        const response = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: this.waitTimeSeconds,
            VisibilityTimeout: this.visibilityTimeoutSeconds,
          }),
          { abortSignal: this.abortController.signal },
        );
        for (const message of response.Messages ?? []) {
          if (!message.Body || !message.ReceiptHandle) continue;
          this.inFlight = true;
          try {
            await processMessage(this.client, this.queueUrl, message, this.processor);
          } catch (error) {
            this.logger.error({ error, messageId: message.MessageId }, 'Editor message failed');
          } finally {
            this.inFlight = false;
            if (this.isPausing()) this.state = 'paused';
          }
        }
      } catch (error) {
        if (!this.abortController.signal.aborted) {
          this.logger.error({ error }, 'SQS receive failed');
          await delay(1000);
        }
      }
    }
  }

  private isPausing(): boolean {
    return this.state === 'pausing';
  }
}

export async function processMessage(
  client: Pick<SQSClient, 'send'>,
  queueUrl: string,
  message: Pick<Message, 'Body' | 'ReceiptHandle'>,
  processor: EventProcessor,
): Promise<void> {
  if (!message.Body || !message.ReceiptHandle) throw new Error('SQS message is incomplete');
  for (const event of parseS3Events(message.Body)) {
    await processor.process(event.bucket, event.key);
  }
  await client.send(
    new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }),
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
