const REQUIRED_PLACEHOLDERS = ['participantGuid', 'recordingId'] as const;
const PLACEHOLDER_PATTERN = /\{([^{}]+)\}/g;

export interface RecordingIdentity {
  participantGuid: string;
  recordingId: string;
}

export class KeyTemplate {
  private readonly matcher: RegExp;

  constructor(readonly value: string) {
    validateTemplate(value);
    this.matcher = compileMatcher(value);
  }

  match(key: string): RecordingIdentity | undefined {
    const match = this.matcher.exec(key);
    if (!match?.groups) return undefined;
    const participantGuid = match.groups.participantGuid;
    const recordingId = match.groups.recordingId;
    if (!participantGuid || !recordingId) return undefined;
    return { participantGuid, recordingId };
  }

  render(identity: RecordingIdentity): string {
    const rendered = this.value
      .replace('{participantGuid}', identity.participantGuid)
      .replace('{recordingId}', identity.recordingId);
    if (rendered.includes('{')) throw new Error('S3 key template contains unresolved placeholders');
    return rendered;
  }
}

function validateTemplate(value: string): void {
  if (!value || value.startsWith('/') || value.endsWith('/') || value.includes('//')) {
    throw new Error('S3 key template must be a non-empty relative key');
  }
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('S3 key template contains an unsafe path segment');
  }
  const placeholders = [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
  for (const required of REQUIRED_PLACEHOLDERS) {
    if (placeholders.filter((item) => item === required).length !== 1) {
      throw new Error(`S3 key template must contain {${required}} exactly once`);
    }
  }
  if (placeholders.some((item) => !REQUIRED_PLACEHOLDERS.includes(item as never))) {
    throw new Error('S3 key template contains an unknown placeholder');
  }
}

function compileMatcher(template: string): RegExp {
  let source = '';
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index;
    source += escapeRegExp(template.slice(cursor, index));
    source += `(?<${match[1]}>[^/]+)`;
    cursor = index + match[0].length;
  }
  source += escapeRegExp(template.slice(cursor));
  return new RegExp(`^${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
