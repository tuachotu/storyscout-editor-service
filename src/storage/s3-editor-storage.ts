import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
  type GetObjectCommandOutput,
  type S3Client,
} from '@aws-sdk/client-s3';

import type { EditorResult } from '../editor/schema.js';
import { EditorResultSchema } from '../editor/schema.js';
import type { KeyTemplate, RecordingIdentity } from './key-template.js';

export interface OutputKeys {
  summary: string;
  originalLanguageSummary: string;
  refinedManuscript: string;
  englishTranslation: string;
  manifest: string;
}

export class S3EditorStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly transcriptTemplate: KeyTemplate,
    private readonly outputPrefixTemplate: KeyTemplate,
    private readonly maxTranscriptBytes: number,
  ) {}

  identifyEvent(bucket: string, key: string): RecordingIdentity {
    if (bucket !== this.bucket) throw new Error('Unexpected S3 bucket');
    const identity = this.transcriptTemplate.match(key);
    if (!identity) throw new Error('Unexpected S3 transcript key');
    return identity;
  }

  outputKeys(identity: RecordingIdentity): OutputKeys {
    const prefix = this.outputPrefixTemplate.render(identity);
    return {
      summary: `${prefix}/summary.txt`,
      originalLanguageSummary: `${prefix}/summary.original.txt`,
      refinedManuscript: `${prefix}/manuscript.txt`,
      englishTranslation: `${prefix}/manuscript.en.txt`,
      manifest: `${prefix}/editor-result.json`,
    };
  }

  async readTranscript(key: string): Promise<string> {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    if (head.ContentLength !== undefined && head.ContentLength > this.maxTranscriptBytes) {
      throw new Error(`Manuscript exceeds the ${this.maxTranscriptBytes} byte limit`);
    }
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error('Transcript object is empty');
    const bytes = await response.Body.transformToByteArray();
    if (bytes.byteLength > this.maxTranscriptBytes) {
      throw new Error(`Manuscript exceeds the ${this.maxTranscriptBytes} byte limit`);
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      throw new Error('Transcript must contain valid UTF-8', { cause: error });
    }
    if (!text.trim()) throw new Error('Transcript object is empty');
    return text;
  }

  async outputsExist(identity: RecordingIdentity): Promise<boolean> {
    const output = this.outputKeys(identity);
    const result = await this.readResultManifest(output.manifest);
    if (!result) return false;
    const keys = [output.summary, output.originalLanguageSummary, output.refinedManuscript];
    if (result.englishTranslation !== null) keys.push(output.englishTranslation);
    const results = await Promise.all(keys.map((key) => this.objectExists(key)));
    return results.every(Boolean);
  }

  async saveOutputs(identity: RecordingIdentity, result: EditorResult): Promise<void> {
    const keys = this.outputKeys(identity);
    await this.putText(keys.summary, result.summary.join('\n'));
    await this.putText(keys.originalLanguageSummary, result.originalLanguageSummary.join('\n'));
    await this.putText(keys.refinedManuscript, result.refinedManuscript);
    if (result.englishTranslation !== null) {
      await this.putText(keys.englishTranslation, result.englishTranslation);
    }
    await this.putJson(keys.manifest, result);
  }

  private async readResultManifest(key: string): Promise<EditorResult | undefined> {
    let response: GetObjectCommandOutput;
    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
    if (!response.Body) return undefined;
    try {
      return EditorResultSchema.parse(JSON.parse(await response.Body.transformToString()));
    } catch {
      return undefined;
    }
  }

  private async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  private async putText(key: string, text: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: text.endsWith('\n') ? text : `${text}\n`,
        ContentType: 'text/plain; charset=utf-8',
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  private async putJson(key: string, value: EditorResult): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: `${JSON.stringify(value, null, 2)}\n`,
        ContentType: 'application/json; charset=utf-8',
        ServerSideEncryption: 'AES256',
      }),
    );
  }
}

function isNotFound(error: unknown): boolean {
  return (
    (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'NotFound')
  );
}
