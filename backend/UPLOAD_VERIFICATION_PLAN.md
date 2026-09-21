# JSON-first verification upload plan

## Objective

Connect the dashboard's **New verification** dialog to a local FastAPI workflow
that always accepts one email JSON file and optionally accepts document
attachments. Every email is classified by the local BERT model. Only
`BL_COMPARISON` emails with attachments continue through SI/BL extraction and
comparison.

## Input contract

- Required: exactly one UTF-8 JSON file containing `email_id`, `subject`, `body`,
  optional `from`, and optional `attachments`.
- Optional: zero or more PDF, DOCX, XLSX, TXT, PNG, JPEG, or JPG attachments.
- Uploaded attachment basenames are matched against the JSON metadata; paths from
  the JSON are never trusted as filesystem paths.
- Files are processed in an isolated temporary directory and deleted after the
  response. This MVP does not persist uploaded cases or files.

## Processing flow

1. Validate the multipart request, JSON schema, filenames, extensions, and sizes.
2. Classify `subject + body` with the existing local BERT classifier.
3. Return a classification-only case when the category is not `BL_COMPARISON` or
   no attachments were uploaded.
4. For comparison requests, run the existing deterministic Stage 4 ingestion and
   Stage 5 seven-field extraction first.
5. Invoke hosted Gemma 4 only for an attachment that has no usable deterministic
   text or whose text produces none of the required fields.
6. Ask Gemma for strict JSON, validate its output, convert it into the canonical
   labelled text consumed by Stage 5, and mark the result for human review.
7. Return a dashboard-compatible case and add it to the frontend queue in memory.

## Gemma integration

- SDK: `google-genai`.
- Default model: `gemma-4-26b-a4b-it`; configurable through
  `DOCUVERIFY_GEMMA_MODEL`.
- API key: `DOCUVERIFY_GEMMA_API_KEY`; never sent to the browser or logged.
- Gemma is lazy and optional. Without a key, deterministic processing continues
  and the response explains that fallback was unavailable.
- Attachments leave the machine only when deterministic parsing fails. Successful
  Gemma fallback is recorded in document warnings and always requires review.
- Uploaded remote files are deleted on a best-effort basis after extraction.

## Backend work

- [x] Add upload request/response schemas.
- [x] Add a shared lazy classifier registry.
- [x] Add a lazy Gemma attachment extraction service.
- [x] Add deterministic-first fallback orchestration.
- [x] Add `POST /api/v1/verifications` multipart endpoint.
- [x] Add configuration and dependencies.
- [x] Add endpoint and fallback tests.

## Frontend work

- [x] Require one JSON email file in the dialog and allow optional attachments.
- [x] Submit files as `FormData` to `/api/v1/verifications`.
- [x] Display progress and backend errors.
- [x] Insert the returned case into the in-memory dashboard queue.

## Verification

- [x] Run focused backend tests without making a live Gemma call.
- [x] Run the frontend type/build check.
- [x] Exercise the endpoint with `email_009.json`, `email_009_SI.txt`, and
  `email_009_BL.txt`; deterministic TXT parsing should mean Gemma is not called.
- [x] Document local setup, API key handling, privacy behavior, and current
  non-persistence.
