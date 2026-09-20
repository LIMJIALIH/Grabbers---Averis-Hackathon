# DocuVerify Backend

FastAPI application served by **Uvicorn**, for the DocuVerify shipping document verification project. The dependency set includes LangChain and its OpenAI/community integrations for the future document-processing pipeline.

The API provides health checks, a sample email review queue, and independent Stage 4 attachment ingestion. `GET /api/v1/cases` reads emails from the configured participant bundle's `inbox/`, includes text attachment previews, and links to `GET /api/v1/cases/{email_id}/attachments/{index}` for original files. Only attachments under the bundle's `attachments/` directory can be downloaded. Classification, comparison, and review persistence are not implemented yet. The supplied SDOC inbox/scoring server is a separate optional service.

Run the backend on port 8000 and the frontend together to use the Review Queue. Next.js proxies `/api/v1/*` to `http://127.0.0.1:8000`; set `BACKEND_URL` in the frontend environment to use another backend address, then restart Next.js. Emails with no attachments remain visible. TXT files display inline; PDF, DOCX, and XLSX files can be downloaded. Approval remains disabled until extraction is implemented.

## Requirements

- Python 3.11 or newer, with pip and venv.
- Docker Desktop only if running the optional SDOC scoring service.

Run all commands below from the `backend/` directory unless stated otherwise.

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

For the frontend on port 3101, for example:

```dotenv
DOCUVERIFY_CORS_ORIGINS=["http://localhost:3000","http://localhost:3101"]
DOCUVERIFY_INBOX_BASE_URL=http://localhost:8080
```

`localhost` and `127.0.0.1` are different origins; include the exact browser origin. Restart Uvicorn after changing `.env`. Configuring these values does not connect the demo frontend or implement the processing pipeline.

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

Install the Python dependencies using the setup instructions above. For scanned PDFs, additionally install Tesseract with English language data and make `tesseract --version` work in the server's environment. Missing Tesseract or OCR timeouts produce page errors and a human-review result. Digital PDF extraction needs no external executable.

Run against the committed mock without earlier stages, from `backend/`:

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

Limits: 30 attachments per request, 25 MB per file, 100 PDF pages, 100 MB expanded Office archives, 200,000 spreadsheet cells, and 60 seconds per OCR page. PDFium work is serialized within each worker for thread safety. This synchronous MVP needs background jobs/process isolation and overall resource quotas before processing untrusted mail at scale. Embedded Office images, Word text boxes, and scanned regions on otherwise text-rich PDF pages are not fully extracted. Excel formulas are preserved as expressions and flagged for review; formulas are never executed. Stage 5 must honor review flags rather than treating partial text as verified data.

## Automatic Stage 4 to Stage 5 workflow

`POST /api/v1/ingestion` now runs both stages in order:

1. Stage 4 reads each attachment once, including PDF OCR where needed, and retains text, source segments, warnings, and errors.
2. Stage 5 consumes that in-memory text to extract and normalize the seven SI/BL comparison fields. It does not reopen attachments.

The existing request format and ingestion response fields remain available. Supply `document_type: "SI"` or `"BL"` when the attachment role is known; otherwise Stage 4 infers it. Conflicting evidence remains `UNKNOWN` and requires review. The email tag `DL` is not an attachment role.

Additional response fields:

- `fields`: seven entries containing `key`, `label`, `si`, `bl`, and `confidence`.
- `extraction_status`: `ok`, `review_required`, or `skipped`.
- `review_reasons`: missing fields/documents, mismatches, duplicate roles, or ingestion issues.

`status` still describes Stage 4 ingestion. The top-level `requires_human_review` now covers both stages. A document can be readable (`status: "ok"`) while its extracted fields need review. Partial text can produce provisional fields, but errors and warnings remain flagged. If multiple documents have the same role, that side is left empty until a document is selected. Pending human-review emails skip both stages; if neither side has usable, identified text, extraction is skipped.

Stage 5 currently uses deterministic label extraction and normalization, not an LLM. Its existing confidence values are comparison scores (100 matching, 70 different, 60 one-sided, 0 absent), not calibrated probabilities.

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
result = process_email(email, Path("examples/attachments"))
print(result.model_dump_json(indent=2))
```

Use real attachment filenames for your bundle. `extract_ingested_fields(ingestion_result)` also accepts previously produced Stage 4 output. The standalone `ingest_email` function and legacy file-based extraction functions remain available; the existing cases listing/export helpers still use their original file-based path.

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
