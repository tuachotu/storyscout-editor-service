import type { Logger } from 'pino';

import type { S3EditorStorage } from '../storage/s3-editor-storage.js';
import type { Editor } from './editor.js';

export class TranscriptProcessor {
  constructor(
    private readonly storage: S3EditorStorage,
    private readonly editor: Editor,
    private readonly logger: Logger,
  ) {}

  async process(bucket: string, transcriptKey: string): Promise<void> {
    const identity = this.storage.identifyEvent(bucket, transcriptKey);
    if (await this.storage.outputsExist(identity)) {
      this.logger.info({ transcriptKey }, 'Editor outputs already exist; acknowledging duplicate');
      return;
    }
    const manuscript = await this.storage.readTranscript(transcriptKey);
    const result = await this.editor.refine({ manuscript });
    await this.storage.saveOutputs(identity, result);
    this.logger.info(
      { transcriptKey, outputKeys: this.storage.outputKeys(identity) },
      'Editor outputs saved',
    );
  }
}
