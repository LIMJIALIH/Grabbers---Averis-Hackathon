# DocuVerify Backend

FastAPI application served by **Uvicorn**, for the DocuVerify shipping document verification project. The dependency set includes LangChain and its OpenAI/community integrations for the future document-processing pipeline.

The API provides health checks and a sample email review queue. `GET /api/v1/cases` reads emails from the configured participant bundle's `inbox/`, includes text attachment previews, and links to `GET /api/v1/cases/{email_id}/attachments/{index}` for original files. Only attachments under the bundle's `attachments/` directory can be downloaded. Document processing, classification, comparison, and review persistence are not implemented yet. The supplied SDOC inbox/scoring server is a separate optional service.

Run the backend on port 8000 and the frontend together to use the Review Queue. Next.js proxies `/api/v1/*` to `http://127.0.0.1:8000`; set `BACKEND_URL` in the frontend environment to use another backend address, then restart Next.js. Emails with no attachments remain visible. TXT files display inline; PDF, DOCX, and XLSX files can be downloaded. Approval remains disabled until extraction is implemented.

## Requirements

- Python 3.11 or newer, with pip and venv.
- Docker Desktop only if running the optional SDOC scoring service.

Run all commands below from the `backend/` directory unless stated otherwise.

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

Start the backend using Uvicorn:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Using the virtual environment's Python directly avoids PowerShell activation-policy issues. Stop the server with **Ctrl+C**. `--reload` restarts it when application code changes and is intended for development only.

## macOS / Linux setup

From the project root:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e ".[dev]"
test -f .env || cp .env.example .env
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
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

## Tests

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

- **Cannot import `app`:** run Uvicorn from `backend/`, using the commands above.
- **No module named `uvicorn`:** install dependencies with the same `.venv` Python used to launch the server.
- **Port 8000 is in use:** select another port, such as `--port 8001`, and use that port in API URLs.
- **CORS errors:** set the exact frontend origin in `DOCUVERIFY_CORS_ORIGINS` and restart the server.
- **Resource test fails:** restore the participant bundle or set `DOCUVERIFY_BUNDLE_DIR` to its absolute location.
- **Ignored files still appear tracked:** `.gitignore` does not untrack previously committed files or erase Git history. Review tracked files before publishing.
