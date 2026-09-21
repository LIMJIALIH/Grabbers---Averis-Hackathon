# DocuVerify Backend

FastAPI application served by **Uvicorn**, for the DocuVerify shipping document verification project. Stage 5 uses two Gemini models through the Google Gen AI SDK and accepts fields only when their normalized outputs agree. PDFs are passed directly to Gemini for native document vision; Tesseract is not required.

The API provides health checks, local email classification, a sample email review queue, and independent Stage 4 attachment ingestion. `GET /api/v1/cases` reads emails from the configured participant bundle's `inbox/`, includes text attachment previews, and links to `GET /api/v1/cases/{email_id}/attachments/{index}` for original files. Only attachments under the bundle's `attachments/` directory can be downloaded. Email classification and SI/BL comparison are implemented; review persistence is not. The supplied SDOC inbox/scoring server is a separate optional service.

Run the backend on port 8000 and the frontend together to use the Review Queue. Next.js proxies `/api/v1/*` to `http://127.0.0.1:8000`; set `BACKEND_URL` in the frontend environment to use another backend address, then restart Next.js. Emails with no attachments remain visible. TXT files display inline; PDF, DOCX, and XLSX files can be downloaded. Approval remains disabled until extraction is implemented.

## Requirements

- Python 3.11 or newer, with pip and venv.
- Docker Desktop only if running the optional SDOC scoring service.

Run all commands below from the `backend/` directory unless stated otherwise.

Tests (`tests/`, `data_prep/test_pipeline.py`) and mock fixtures (`examples/`,
`scripts/create_mock_emails.py`) are local-only and excluded from Git. Commands
below that use these files require an existing local copy; a fresh clone does
not include them. Model weights and source datasets are also local-only.

Offline dataset preparation lives in [`data_prep/`](data_prep/README.md). Run `python data_prep/build_dataset.py` to generate datasets and `python data_prep/test_pipeline.py` for its self-check, using the backend environment. It reads the local bundle under `resources/` and keeps generated datasets under `data_prep/out/`.

## Windows setup (PowerShell)

From the project root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

Create your local configuration once (do not overwrite an existing `.env`):

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Start the backend:

```powershell
.\.venv\Scripts\python.exe run.py
```

Using the virtual environment's Python directly avoids PowerShell activation-policy issues. With the virtual environment activated, simply run `python run.py`. The launcher serves at `http://127.0.0.1:8000` with automatic reload for development. Stop the server with **Ctrl+C**.

## macOS / Linux setup

From the project root:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e ".[dev]"
test -f .env || cp .env.example .env
.venv/bin/python run.py
```

## Verify the server

- Swagger API docs: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- OpenAPI schema: http://127.0.0.1:8000/openapi.json
- Health endpoint: http://127.0.0.1:8000/api/v1/health

In a second PowerShell terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
```

Expected JSON response:

```json
{"status":"ok","service":"docuverify"}
```

The root URL `/` has no route and returns 404; use `/docs` or the health endpoint.

## Configuration

Settings load from `backend/.env` and environment variables (environment variables take precedence). Keep real credentials out of `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCUVERIFY_CORS_ORIGINS` | `["http://localhost:3000"]` | JSON array of allowed frontend origins |
| `DOCUVERIFY_INBOX_BASE_URL` | `http://localhost:8080` | Reserved URL for the separate SDOC service |
| `DOCUVERIFY_BUNDLE_DIR` | Absolute path to `backend/resources/sdoc-hackathon-bundle` | Local participant bundle location |
| `DOCUVERIFY_MODEL_DIR` | Absolute path to `backend/model/email_multiclass_classifier` | Saved Hugging Face classifier directory |
| `DOCUVERIFY_MODEL_DEVICE` | `auto` | Inference device: `auto`, `cpu`, or `cuda` |
| `DOCUVERIFY_GEMMA_API_KEY` | unset | Google AI Studio key for failed attachment extraction only |
| `DOCUVERIFY_GEMMA_MODEL` | `gemma-4-26b-a4b-it` | Hosted Gemma fallback model |
| `DOCUVERIFY_GEMMA_TIMEOUT_MS` | `120000` | Hosted fallback timeout in milliseconds |

For the frontend on port 3101, for example:

```dotenv
DOCUVERIFY_CORS_ORIGINS=["http://localhost:3000","http://localhost:3101"]
DOCUVERIFY_INBOX_BASE_URL=http://localhost:8080
```

`localhost` and `127.0.0.1` are different origins; include the exact browser origin. Restart Uvicorn after changing `.env`. Configuring these values does not connect the demo frontend or implement the processing pipeline.

## Local email classification

`POST /api/v1/classification` runs the fine-tuned BERT model entirely on the local
machine. The model is loaded on the first classification request and reused for
later requests. `auto` selects CUDA when the installed PyTorch build can access an
NVIDIA GPU and otherwise falls back to CPU. Model and tokenizer loading use local
files only and do not download from Hugging Face at request time.

Example request from PowerShell:

```powershell
$payload = @{
  subject = "Please compare shipping documents"
  body = "Attached are the SI and draft BL. Please check the draft BL against the SI."
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8000/api/v1/classification `
  -ContentType "application/json" -Body $payload
```

The response contains `category`, the winning `confidence`, all five class
`scores`, and the actual `device`. An empty subject and body return HTTP 422; a
missing model or unusable requested device returns HTTP 503.

The ordinary PyPI installation may install a CPU-only PyTorch wheel. For RTX GPU
inference, use the command generated for Windows, Pip, and your supported CUDA
version by the official [PyTorch installation selector](https://pytorch.org/get-started/locally/),
then confirm the environment before starting the API:

```powershell
uv run --project . --no-sync python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

Keep a single Uvicorn worker for the local demo because every worker loads its own
copy of the roughly 438 MB model. The endpoint uses inference mode and does not
calculate gradients or update model weights.

## Hybrid email normalization and verification uploads

`POST /api/v1/verifications` accepts multipart form data with one required
`email` file and zero or more optional `attachments`. JSON, EML, and plain text
emails are normalized locally. PDF, DOCX, PNG, and JPEG email inputs (and malformed
standard inputs) use Gemma to produce the stable organizer contract:
`email_id`, `from`, `subject`, `body`, and `attachments`.
Attachment paths in the JSON are used only for basename matching and are never
trusted as server paths.

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/v1/verifications `
  -F "email=@data_prep/inference_data/email_009.json;type=application/json" `
  -F "attachments=@data_prep/inference_data/email_009_SI.txt;type=text/plain" `
  -F "attachments=@data_prep/inference_data/email_009_BL.txt;type=text/plain"
```

The normalized subject and body are classified by the local fine-tuned BERT model.
Per-category confidence thresholds and a top-two margin gate route uncertain
predictions to Gemma. A confident Gemma agreement is accepted; BERT/Gemma
disagreement, low Gemma confidence, or an unavailable fallback is marked for
human review. Responses expose `normalization_source`, classification `source`,
the original BERT decision, and the review flag.

The queue endpoint uses the same hybrid classifier and caches decisions in the
backend process. The frontend consumes the returned category rather than applying
keyword rules. Non-comparison emails and emails without uploaded documents return
a classification-only dashboard case. A
`BL_COMPARISON` email with documents runs deterministic ingestion, extraction,
and comparison. Uploads are held in a request-specific temporary directory and
are not persisted after the response.

When deterministic extraction yields no usable fields, the backend can use
hosted Gemma 4 through Google AI Studio. Add the API key only to `backend/.env`:

```dotenv
DOCUVERIFY_GEMMA_API_KEY=your-google-ai-studio-key
DOCUVERIFY_GEMMA_MODEL=gemma-4-26b-a4b-it
```

Gemma is not called for documents handled by local parsers. A fallback document
is sent to Google's API, marked with a warning, and always requires human review.
Without an API key, deterministic processing still works and incomplete documents
remain review items. The current dashboard stores newly returned cases only in
browser memory, so they disappear on refresh.

The frontend sends this potentially long-running upload directly to FastAPI to
avoid development-proxy timeouts. It defaults to `http://127.0.0.1:8000`; set
`NEXT_PUBLIC_BACKEND_URL` before starting Next.js when the backend uses another
origin. That frontend origin must also appear in `DOCUVERIFY_CORS_ORIGINS`.

## Local resources (not committed)

The entire `backend/resources/` directory is ignored by Git. Existing local files remain untouched, but a fresh clone will not include these packages. Obtain authorized copies separately and place them as follows:

```text
resources/
  sdoc-hackathon-bundle/
    inbox/
    attachments/
    loader.py
    sample_submission.json
  sdoc-hackathon-docker/
    server/
    data_v2/
    docker-compose.yml
```

The API and health endpoint run without either package. The resource-location test requires the participant bundle (or `DOCUVERIFY_BUNDLE_DIR` pointing to it).

The organizer Docker package includes an answer key. Do not distribute it to participants or expose its ground truth. The DocuVerify API does not serve this directory.

### Optional inbox/scoring service

With Docker Desktop running and the package restored locally:

```powershell
docker compose -f resources/sdoc-hackathon-docker/docker-compose.yml up --build
```

This separate service runs at http://localhost:8080. Its `/submit` endpoint scores submissions; it is not the DocuVerify API. Consult the package's own README for its endpoints and data requirements. Docker resolves the relative build and mount paths from the Compose file's directory.

## Stage 4: attachment ingestion

`POST /api/v1/ingestion` accepts a filtered email with `email_id`, `tag` (`SI` or `DL`), optional `requires_human_review`, and `attachments`. Each attachment requires `filename` and `path` (relative to the bundle's `attachments/` directory), plus optional `document_type` (`SI`, `DL`, or `BL`). Other email tags receive HTTP 422. A pending human-review email is not processed. The ingestion endpoint does not run a classifier or connect to Gmail.

Supported files: PDF, DOCX, XLSX, and TXT (UTF-8, UTF-8 BOM, or UTF-16 BOM). DOC/XLS and misspelled extensions are rejected with a controlled attachment error; export them to supported formats. Do not simply rename binary files.

Install the Python dependencies using the setup instructions above. PDFs, including scanned PDFs, are sent directly to Gemini for native document vision during Stage 5. Tesseract is not used or required.

Run against a locally provisioned mock without earlier stages, from `backend/`:

```powershell
$env:DOCUVERIFY_BUNDLE_DIR = (Resolve-Path ./examples).Path
.\.venv\Scripts\python.exe run.py
```

Then, in a second terminal in `backend/`:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/ingestion -ContentType 'application/json' -Body (Get-Content ./examples/stage3_email.json -Raw)
```

Or call `ingest_email(ClassifiedEmail.model_validate(payload), attachment_root)` directly. Future Stage 3 integration must retain stored attachment references. Existing inbox resource paths start with `attachments/`; strip that prefix when constructing this contract because paths here are relative to that directory.

The output includes concatenated `text` and located `segments`, per-document `ok`/`partial`/`error` status, errors, warnings, and top-level `requires_human_review`. PDFs include real page numbers; Word blocks and Excel rows do not invent page counts. Attachment type inference is advisory: conflicting evidence returns `UNKNOWN`. An email's `DL` tag does not automatically relabel all attachments as BL.

Limits: 30 attachments per request, 25 MB per file, 100 PDF pages, 100 MB expanded Office archives, and 200,000 spreadsheet cells. PDFium work is serialized within each worker for document-type detection. This synchronous MVP needs background jobs/process isolation and overall resource quotas before processing untrusted mail at scale. Embedded Office images and Word text boxes are not sent through native PDF vision. Excel formulas are preserved as expressions and flagged for review; formulas are never executed. Stage 5 must honor review flags rather than treating partial text as verified data.

## Automatic Stage 4 to Stage 5 workflow

`POST /api/v1/ingestion` now runs both stages in order:

1. Stage 4 reads each attachment once and retains text, source segments, warnings, errors, and the trusted local PDF reference.
2. Stage 5 sends each eligible PDF directly to two distinct Gemini models independently for native vision; non-PDF documents use their parsed text. Neither model receives the other's output.
3. Python validates and normalizes each model's seven raw fields, checks agreement per field, then compares agreed SI and BL values. Source text, both attempts, and consensus results remain inspectable.

The existing request format and ingestion response fields remain available. Supply `document_type: "SI"` or `"BL"` when the attachment role is known; otherwise Stage 4 infers it. Conflicting evidence remains `UNKNOWN` and requires review. The email tag `DL` is not an attachment role.

Additional response fields:

- `fields`: seven entries containing `key`, `label`, `si`, `bl`, and `confidence`.
- `extraction_status`: `ok`, `review_required`, or `skipped`.
- `review_reasons`: missing fields/documents, mismatches, duplicate roles, or ingestion issues.
- `document_extractions`: filename, document type, two model `attempts`, seven `field_checks`, consensus `normalized_fields`, issues, and an error summary. Each attempt includes model ID, nullable raw/normalized fields, issues, and an error. The previous document-level `model` and `raw_fields` now live inside `attempts`.

`status` still describes Stage 4 ingestion. The top-level `requires_human_review` now covers both stages. A document can be readable (`status: "ok"`) while its extracted fields need review. Partial text can produce provisional fields, but errors and warnings remain flagged. If multiple documents have the same role, that side is left empty until a document is selected. Pending human-review emails skip both stages; if neither side has usable, identified text, extraction is skipped.

Stage 5 uses Gemini JSON-schema structured output with strict Pydantic validation,
independently for each model and each SI/BL document.
The seven raw fields are required keys with nullable string values; missing or
ambiguous values remain null. Original weight units are retained in the raw
`gross_weight_kg` field. Python converts explicit kg/metric-tonne values to decimal
kilograms and unambiguous counts to integers. Names/ports receive whitespace and
boundary-punctuation cleanup only. Unsupported units, unitless weights, and
ambiguous numbers require review. Port aliases, company suffix mapping, and fuzzy
matching are deferred. Decimal weights serialize as strings in normalized JSON;
the existing comparison `si`/`bl` fields remain display strings.

Model agreement is evaluated after normalization:

| Field check | Meaning | Consensus value |
| --- | --- | --- |
| `agreed` | Both valid normalized outputs match | Accepted value (primary spelling for case-only differences) |
| `disagreed` | Two valid but different values | null |
| `missing_or_invalid` | Either value is absent or cannot be normalized | null |
| `model_error` | Either model attempt failed | null |

Two missing values never count as agreement. Text comparison ignores case; numeric
comparison is exact. A disagreement affects only that field; the other agreed
fields remain available. If either model call fails, every field for that document
is unresolved, but the successful attempt remains visible. Unresolved consensus
values display as empty strings in the existing comparison fields and require
human review. Agreement is not proof of correctness: models can share errors,
including errors already present in the document.

Existing confidence values remain comparison scores (100 matching, 70 different,
60 one-sided, 0 absent), not model confidence or calibrated probabilities.

Configure the following in your local `backend/.env` (never commit real keys):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCUVERIFY_GEMINI_API_KEY` | unset | Gemini Developer API credential; needed only when extraction is attempted |
| `DOCUVERIFY_EXTRACTION_PRIMARY_MODEL` | `gemini-3.8-flash` | First independent extractor |
| `DOCUVERIFY_EXTRACTION_SECONDARY_MODEL` | `gemini-3.7-flash` | Second independent extractor; must differ from the first |
| `DOCUVERIFY_EXTRACTION_TIMEOUT_SECONDS` | `60` | Provider timeout per attempt |
| `DOCUVERIFY_EXTRACTION_MAX_RETRIES` | `1` | Application retries for network failures and HTTP 408/500/502/503/504; SDK retries are disabled |
| `DOCUVERIFY_EXTRACTION_MAX_INPUT_CHARS` | `100000` | Per-document text limit; larger documents require review without truncation |

Migration: replace the previous `DOCUVERIFY_OPENAI_API_KEY` and
`DOCUVERIFY_EXTRACTION_MODEL` settings with the Gemini variables above; old settings
are ignored. Install updated dependencies and restart the backend. The application
does not rewrite your local `.env` or select fallback models. Empty or identical
model IDs produce a controlled review result without a provider request.

Calling ingestion with eligible documents sends their text to Gemini. Model
construction is lazy: health checks and Stage 4-only ingestion work without a key.
Missing credentials, refusals, invalid output, and provider failures preserve Stage
4 text and set extraction to `review_required`; no regex fallback occurs. A failed
document leaves its comparison values empty while retaining the other side's
successful extraction. Existing Stage 4 warnings always remain review reasons.

Calls are sequential: two per document, normally four per SI/BL pair before
retries. Each retry waits one second. Quota/rate-limit errors (HTTP 429), credential
errors, blocked output, and invalid schemas are not retried. The 60-second timeout
is per provider attempt, not a whole-email deadline. There is no OpenAI or regex
fallback. Stage 4 parsing, legacy cases, and exports retain their existing paths.

Google currently lists free-tier usage for the default models, subject to account
availability and quota; a billing-enabled project may incur charges. Free-tier
content is listed as used to improve Google's products. Check the current
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and account limits.

For Python callers:

```python
from pathlib import Path
from app.schemas.ingestion import ClassifiedEmail
from app.services.verification import process_email

email = ClassifiedEmail(
    email_id="example", tag="SI",
    attachments=[
        {"filename": "SI.txt", "path": "SI.txt", "document_type": "SI"},
        {"filename": "BL.txt", "path": "BL.txt", "document_type": "BL"},
    ],
)
result = process_email(email, Path("examples/attachments"))  # Calls both Gemini models.
print(result.model_dump_json(indent=2))
```

Use real attachment filenames for your bundle. `extract_ingested_fields(ingestion_result)` also accepts previously produced Stage 4 output. The standalone `ingest_email` function and legacy file-based extraction functions remain available; the existing cases listing/export helpers still use their original file-based path.

For offline tests, pass `extractor=callable` to either `process_email` or
`extract_ingested_fields`. It receives `(text, document_type, *, model)` and returns a
`RawFields` object. Automated tests mock Gemini; they do not measure live-model
accuracy. A live smoke test is opt-in: configure a key and invoke the endpoint
with the synthetic files in `examples/`, then inspect `document_extractions`.

Run the combined workflow tests with sample output:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_stage4_stage5.py -v -s
```

## Running tests

After installing the `[dev]` dependencies:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

On macOS/Linux:

```bash
.venv/bin/python -m pytest
```

Without local participant resources, run only the API checks:

```powershell
.\.venv\Scripts\python.exe -m pytest -k "not resource_location"
```

## Structure and development conventions

```text
app/
  main.py          Application factory and middleware
  api/
    router.py      Versioned router composition
    routes/        HTTP endpoint handlers
  core/            Environment configuration
  schemas/         Pydantic request/response contracts
  services/        Future pipeline business logic
  integrations/    Future external service adapters
tests/             Backend tests
resources/         Ignored local hackathon packages
run.py             Development server launcher
pyproject.toml     Dependencies and test configuration
.env.example       Safe configuration template
```

Keep HTTP handlers thin, put business logic in services, and isolate external I/O in integrations. Register new routers in `app/api/router.py`; they receive the `/api/v1` prefix from `main.py`. Add tests for new behavior.

## Running without auto-reload

For a local production-style process:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
```

Do not combine `--workers` with `--reload`. Use `--host 0.0.0.0` only when intentionally exposing the service to other machines or a container network. This scaffold has no authentication; it is not ready for public deployment. Add appropriate authentication, HTTPS/reverse proxy configuration, secret management, and tested dependency locking before deployment.

## Troubleshooting

- **Cannot import `app`:** run `python run.py` from `backend/`, using the environment where dependencies are installed.
- **No module named `uvicorn`:** install dependencies with the same `.venv` Python used to launch the server.
- **Port 8000 is in use:** change `port=8000` in `run.py` to another port, such as `8001`, and use that port in API URLs.
- **CORS errors:** set the exact frontend origin in `DOCUVERIFY_CORS_ORIGINS` and restart the server.
- **Resource test fails:** restore the participant bundle or set `DOCUVERIFY_BUNDLE_DIR` to its absolute location.
- **Ignored files still appear tracked:** `.gitignore` does not untrack previously committed files or erase Git history. Review tracked files before publishing.
