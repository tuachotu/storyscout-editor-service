# StoryScout Editor

Standalone transcript refinement service. It consumes S3 `ObjectCreated` notifications from SQS
or accepts an ad hoc manuscript through REST, then uses `@storyscout/llm-client` to produce a
strict JSON result containing summary lines, a lightly refined manuscript, and an English
translation only when the source language is not English.

## Default S3 flow

```text
recordings/{participantGuid}/{recordingId}/transcription.txt
  -> SQS -> Editor
  -> recordings/{participantGuid}/{recordingId}/refined/summary.txt
  -> recordings/{participantGuid}/{recordingId}/refined/summary.original.txt
  -> recordings/{participantGuid}/{recordingId}/refined/manuscript.txt
  -> recordings/{participantGuid}/{recordingId}/refined/manuscript.en.txt (non-English only)
  -> recordings/{participantGuid}/{recordingId}/refined/editor-result.json
```

Both the transcript key and refined-output prefix are YAML-configurable templates. Each must use
`{participantGuid}` and `{recordingId}` exactly once. `summary.txt` is always English, while
`summary.original.txt` uses the source language. The validated JSON manifest determines whether
`manuscript.en.txt` is required, making both English and non-English deliveries idempotent. Legacy
v1 output sets without a manifest are incomplete; partial sets are regenerated when delivered.

## Configuration and local start

Copy `config/editor.config.example.yaml` to `config/editor.config.yaml`, replace every placeholder,
and provide `OPENAI_API_KEY` outside the file. AWS credentials use the standard AWS SDK credential
chain.

```sh
npm install
npm run check
OPENAI_API_KEY=replace-me npm run dev -- --config config/editor.config.yaml
```

The configuration file contains non-secret AWS region, S3 key templates, SQS settings, default
model, prompt path, HTTP binding, and transcript size limit. The service defaults to loopback in
the example because v1 does not include authentication.

## HTTP API

```http
POST /v1/editor/refine
Content-Type: application/json

{"manuscript":"Transcript text","model":"optional-model-override"}
```

The response contract is:

```json
{
  "sourceLanguage": { "code": "hi", "name": "Hindi" },
  "summary": ["English summary line one.", "English summary line two."],
  "originalLanguageSummary": ["मूल सारांश पंक्ति एक।", "मूल सारांश पंक्ति दो।"],
  "refinedManuscript": "Refined text in the source language.",
  "englishTranslation": "English translation for a non-English source."
}
```

For English source content, `sourceLanguage.code` is `en` and `englishTranslation` is `null`.
For mixed-language content, the dominant narrative language determines whether translation is
required. The REST path does not read or write S3. Operational routes are `GET /health`, `GET /ready`,
`GET /admin/editor/status`, `POST /admin/editor/pause`, and `POST /admin/editor/resume`.

## IAM and deployment

The runtime role needs `sqs:ReceiveMessage`, `sqs:DeleteMessage`, and
`sqs:ChangeMessageVisibility` on the Editor queue, plus `s3:GetObject` and `s3:ListBucket` for the
configured transcript keys and `s3:PutObject`/`s3:HeadObject` for refined outputs. Scope resources
to the configured bucket, prefix, and queue.

The `infrastructure/` directory contains non-deploying examples for the S3 notification, SQS
policy, long polling, visibility timeout, and DLQ redrive. Adjust them when key templates change.
`deploy/storyscout-editor.service` is a systemd template. Nothing in this repository provisions or
modifies AWS resources.

An end-to-end deployment check should upload a test `transcription.txt`, observe one queue event,
verify all three encrypted UTF-8 outputs, redeliver the same event to confirm no LLM call occurs,
and exercise the REST endpoint through an authenticated gateway before exposing it externally.

## Checkout layout

The Editor currently depends on `file:../LLMCient`. Keep these repositories as
siblings and preserve the local directory name `LLMCient` (including its spelling):

```sh
git clone -b feature/initial-import git@github.com:tuachotu/storyscout-llm-client.git LLMCient
git clone -b feature/initial-import git@github.com:tuachotu/storyscout-editor-service.git editor
cd LLMCient
npm ci
npm run check
cd ../editor
npm ci
npm run check
```

Build the library before checking or running the Editor. Neither package is published
to npm; the library's generated `dist` directory is built locally and excluded from Git.
