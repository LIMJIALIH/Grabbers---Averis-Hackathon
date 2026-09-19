# DocuVerify

Shipping document verification for the Averis x Monash hackathon. DocuVerify is designed to classify inbox requests, extract seven shipping fields from Shipping Instructions (SI) and draft Bills of Lading (BL), compare them, and send uncertain cases to a human reviewer.

## Project structure

```text
frontend/                     Next.js / React dashboard
  app/                        Pages, layouts, and theme styles
  components/                 Reusable UI components
  lib/                        Frontend utilities
  public/                     Static assets
  scripts/                    Browser smoke checks
backend/
  app/
    main.py                   FastAPI application factory and middleware
    api/routes/               HTTP endpoints, composed by api/router.py
    core/                     Environment-based configuration
    schemas/                  Pydantic API contracts
    services/                 Business logic (reserved for pipeline work)
    integrations/             External adapters (reserved for pipeline work)
  tests/                      Backend tests
  resources/
    sdoc-hackathon-bundle/     Original participant data and loader
    sdoc-hackathon-docker/     Original organizer inbox/scoring server
  pyproject.toml              Python dependencies and test configuration
DocuVerify Hackathon Proposal.md
```

The frontend folder was previously named `Grabbers---Averis-Hackathon`. Its existing nested `.git` repository and uncommitted work are preserved. The workspace also has its own `.git`; this is not yet a unified Git monorepo. Commit frontend changes from `frontend/`; choose a repository migration strategy before trying to track everything in a single repository.

## Current functionality

The dashboard includes a case queue, SI/BL comparison, editable extracted values, confidence indicators, local review/approval/escalation interactions, JSON export, audit views, light/dark themes, and a collapsible sidebar. Business data is currently demo/session state, not connected to a backend. See [frontend notes](frontend/FRONTEND.md).

The new FastAPI application is a runnable scaffold with `GET /api/v1/health` and interactive API documentation. Classification, extraction, normalization, persistence, authentication, and submission integration are not implemented. The supplied SDOC server remains an independent service; its `/submit` endpoint scores submissions rather than approving dashboard cases.

The seven target fields are `shipper`, `consignee`, `notify_party`, `port_of_loading`, `port_of_discharge`, `container_count`, and `gross_weight_kg`. For evaluation, follow the supplied bundle's categories and output schema (`BL_COMPARISON`, `SI_REQUEST`, etc.), which differ from some proposal labels.

## Run the frontend

Use Node.js compatible with the installed Next.js version (Node 20.9+).

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000. Existing installations can skip `npm ci`. Previous preview processes were stopped for the directory move; restart them from this new location.

```powershell
npx tsc --noEmit
npm run build
```

## Run the backend

Python 3.11+ is required. From the workspace root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. Health: http://localhost:8000/api/v1/health.
On macOS/Linux use `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`.
Environment configuration uses the `DOCUVERIFY_` prefix. Set `DOCUVERIFY_CORS_ORIGINS` to a JSON array of actual frontend origins when using another port. Local bundle paths default to an absolute path derived from the backend directory, not the shell's working directory.

Run tests from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

## Run the supplied inbox/scoring server (optional)

With Docker Desktop running, from the workspace root:

```powershell
cd backend/resources/sdoc-hackathon-docker
docker compose up --build
```

The supplied server listens at http://localhost:8080. Its relative Docker build and data-mount paths are unchanged. See its [README](backend/resources/sdoc-hackathon-docker/README.md) and the [participant bundle instructions](backend/resources/sdoc-hackathon-bundle/README.md).

**Organizer data warning:** the Docker package contains `data_v2/ground_truth.json`, an answer key. Do not distribute that package to participants or publish the answer key. The root `.gitignore` excludes this file from new commits, but does not remove it from any existing history. Do not enable `REVEAL_GT` in shared environments. The new API does not serve the resources directory.

## Backend development conventions

Keep route handlers thin, validate API contracts in `schemas/`, put pipeline logic in `services/`, and isolate external I/O in `integrations/`. Add tests alongside each implemented feature. Add database models/migrations only when choosing persistence; do not place business logic inside the bundled organizer server. Dependency ranges are initial scaffold constraints; lock tested versions before deployment.

Router organization follows the [FastAPI multi-file application guide](https://fastapi.tiangolo.com/tutorial/bigger-applications/). The original [proposal](DocuVerify%20Hackathon%20Proposal.md) describes the intended full pipeline, not completed functionality.
