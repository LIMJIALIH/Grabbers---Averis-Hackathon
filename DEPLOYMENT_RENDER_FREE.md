# No-cost Render backend for the Vercel frontend

This is the selected deployment for `https://averis-x-monash.vercel.app`. The backend runs at `https://docuverify-api.onrender.com` on Render Free. It uses the same FastAPI routes as local development, but replaces runtime BERT loading with locally precomputed BERT classifications for the 520 demo emails and Gemini classification for new uploads. The demo inbox and attachments are encrypted in Git and restored to temporary storage at each startup. **No model weights, plaintext emails, attachments, or decryption key are committed.**

The paid persistent-disk deployment remains documented in [DEPLOYMENT_VERCEL_RENDER.md](DEPLOYMENT_VERCEL_RENDER.md). Render Free has 512 MB RAM, no persistent disk, and spins down after inactivity; expect a cold start and no persistence for uploaded files, decisions, or Google sessions. The current app already holds those in memory or temporary files. [Render Free limitations](https://render.com/docs/free).

## Prepare the encrypted demo bundle

From `backend/`, install the normal local requirements, retain the authorized `resources/sdoc-hackathon-bundle` and `model/email_multiclass_classifier`, then generate a random 32-byte key. Store the key in a password manager. It is required again whenever the bundle is rebuilt:

```powershell
$env:DOCUVERIFY_DEMO_ARCHIVE_KEY = python -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))"
$env:PYTHONPATH = (Get-Location).Path
python scripts/package_free_demo.py
```

The script classifies the inbox once with the local BERT model, then writes only `backend/deployment/demo-bundle.enc`. It packages inbox JSON, attachments, and classification results, excluding the answer key and model weights. Commit the encrypted file and code; enter `DOCUVERIFY_DEMO_ARCHIVE_KEY` only in Render's environment settings. Do not put the key in Git, Vercel, `.env.example`, or a public issue. On startup `python -m app.bootstrap_demo` authenticates and decrypts the archive into `/tmp/docuverify`. A wrong key stops startup instead of serving an empty or corrupt mailbox. The current key is also saved locally for this Windows user as a DPAPI-encrypted file at `%APPDATA%\DocuVerify\demo-archive-key.dpapi`; back it up in a password manager before moving machines.

The archive is encrypted at rest in Git, but the current `/api/v1/cases` and attachment routes intentionally serve demo records without per-user authentication. Use only documents approved for public demo access. Encryption does not restrict what a visitor can read through those endpoints.

## Render Free service

The current service uses GitHub branch `deploy/render-free` and root directory `backend`. To recreate it, create a Python Web Service using that branch:

```text
Region: Singapore
Plan: Free
Build command: pip install -r requirements-free.txt
Start command: python -m app.bootstrap_demo && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
Health path: /api/v1/health
```

Set these Render environment variables:

```text
PYTHON_VERSION=3.11.11
DOCUVERIFY_CLASSIFICATION_MODE=hosted
DOCUVERIFY_CLASSIFICATION_CACHE_PATH=/tmp/docuverify/classifications.json
DOCUVERIFY_BUNDLE_DIR=/tmp/docuverify/resources/sdoc-hackathon-bundle
DOCUVERIFY_CORS_ORIGINS=["https://averis-x-monash.vercel.app"]
DOCUVERIFY_APP_ORIGIN=https://averis-x-monash.vercel.app
DOCUVERIFY_DEMO_ARCHIVE_KEY=<private key generated above>
DOCUVERIFY_GEMINI_API_KEY=<Gemini key>
DOCUVERIFY_GOOGLE_PROJECT_ID=<Google project ID>
DOCUVERIFY_GOOGLE_CLIENT_ID=<Google Web client ID>
DOCUVERIFY_GOOGLE_CLIENT_SECRET=<Google Web client secret>
```

`DOCUVERIFY_CORS_ORIGINS` must remain valid JSON with quoted URL. `DOCUVERIFY_CLASSIFICATION_HOSTED_MODEL` can select another Gemini model if needed. The optional Gemma key remains unset. Provider calls stay on the backend. Keep one worker because OAuth sessions are process-local.

On the Vercel project, set `BACKEND_URL` and `NEXT_PUBLIC_BACKEND_URL` to `https://docuverify-api.onrender.com` for Production and redeploy. The first variable drives same-origin auth/Gmail/case rewrites; the second is embedded into the browser build for long extraction and upload POSTs. Configure Google's authorized JavaScript origin as `https://averis-x-monash.vercel.app` and its redirect URI as `https://averis-x-monash.vercel.app/api/v1/auth/google/callback` because OAuth returns through Vercel.

## Verify

```powershell
curl.exe --fail-with-body https://docuverify-api.onrender.com/api/v1/health
curl.exe --fail-with-body https://averis-x-monash.vercel.app/api/v1/health
$cases = Invoke-RestMethod https://docuverify-api.onrender.com/api/v1/cases
$cases.Count  # expect 520 for the current authorized bundle
```

Open the Vercel frontend. Confirm the demo queue, attachment downloads, a case extraction, a new upload, Google login and Gmail refresh. Restart the Render service; the demo queue must repopulate from the encrypted archive. A restart clears OAuth sessions and temporary uploads by design. If the queue is empty or returns 503, check the archive key, startup logs, cache path, and bundle path. If new uploads return 503, check the Gemini key and model access. If browser POSTs fail, check CORS and that `NEXT_PUBLIC_BACKEND_URL` was present at Vercel build time.

For a new demo bundle, rebuild the archive with the **same** stored key, commit it, and redeploy. If the key is rotated, rebuild the archive and update the Render secret together. Do not commit the plaintext source bundle, model, generated prediction JSON, or local `.env`.
