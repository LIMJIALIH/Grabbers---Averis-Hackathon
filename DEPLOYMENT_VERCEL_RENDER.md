# Deploy DocuVerify on Vercel and Render

This procedure describes the paid persistent-disk deployment: Next.js on Vercel, FastAPI on Render, the demo mailbox, Google sign-in/Gmail, BERT classification, Gemini extraction and optional Gemma fallback. For the selected **no-extra-payment Render Free deployment**, use [DEPLOYMENT_RENDER_FREE.md](DEPLOYMENT_RENDER_FREE.md). Start with generated `*.vercel.app` and `*.onrender.com` domains. Replace every `<placeholder>`.

The repository includes [render.yaml](render.yaml) and [frontend/.env.example](frontend/.env.example). Credentials, private artifacts and hosting accounts must be supplied separately.

Current Vercel production origin: `https://averis-x-monash.vercel.app`. The frontend was deployed from the local `frontend/` directory. Its two backend URL variables point to the active Render Free service at `https://docuverify-api.onrender.com`; the Vercel project has no Git connection. This paid guide is an alternative for a future persistent-disk upgrade.

## Current behavior and requirements

| Capability | Behavior on this branch |
| --- | --- |
| Demo mailbox | Reads JSON and attachments from `DOCUVERIFY_BUNDLE_DIR` at request time. |
| Classification | Loads local BERT lazily. Gemma handles low-confidence results when configured; it cannot replace a missing BERT model. |
| Case extraction | `POST /api/v1/cases/{email_id}/extract` runs the Gemini/ingestion pipeline and returns fields; no backend report is stored. |
| Upload | `POST /api/v1/verifications` processes an email and optional attachments in a temporary directory; uploaded files and results are not saved. |
| Human actions | Corrections, decisions and activity are held in frontend memory; activity can be exported manually. |
| Google/Gmail | OAuth state, tokens and sessions are backend memory only; Gmail attachments do not enter verification. |

**This branch has no OpenAI verifier, SQLite audit database, `/api/v1/review` route or Tesseract OCR recovery.** Do not configure `DOCUVERIFY_OPENAI_*` or `DOCUVERIFY_VERIFICATION_AUDIT_PATH`, and do not attempt the former review/audit API checklist. The persistent disk protects the private bundle and model, not uploaded files or decisions. PDF extraction uses Gemini native PDF processing. Check the [registered routes](backend/app/api/router.py).

The case, attachment and upload routes serve shared demo material without per-user authorization. Google sign-in protects Gmail access only. Use material you are authorized to expose; add backend authorization before using private multi-user documents.

You need a GitHub repository with these changes, Vercel and paid Render accounts, Google Cloud OAuth Web client credentials and Gmail API, and authorized copies of:

```text
backend/resources/sdoc-hackathon-bundle/inbox/
backend/resources/sdoc-hackathon-bundle/attachments/
backend/model/email_multiclass_classifier/
```

The bundle and fine-tuned classifier are ignored by Git. The model folder must include `config.json`, weights and tokenizer files. Preserve the inbox JSON attachment references and their exact case-sensitive filenames. Do not upload an organizer answer key. Have a Gemini key for extraction and optionally a Gemma/Google AI Studio key for fallback.

If the GitHub repository is private, grant Render's GitHub integration access to it before creating the service. The Render workspace also needs a payment method before it can create the paid service and persistent disk used here.

## 1. Create the Render backend

Connect the repository to Render and create a Blueprint from the root [render.yaml](render.yaml). It creates a Python Web Service rooted at `backend` with:

```text
Build: pip install -r requirements.txt
Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
Health path: /api/v1/health
Persistent disk mount: /var/data/docuverify
```

The Blueprint pins Python 3.11.11 and starts with a 2 GB RAM service and 10 GB disk; increase memory or disk if the real bundle/model requires it. A free service cannot have the required disk. The disk is accessible only at runtime and limits the service to one instance. One worker is required because Google OAuth flow state and sessions exist only in process memory. A restart signs users out. See [Render Blueprint fields](https://render.com/docs/blueprint-spec), [Python versions](https://render.com/docs/python-version) and [persistent disks](https://render.com/docs/disks).

Render prompts for the variables below. If the stable Vercel hostname is not known, use the temporary local origins for the first backend deploy and replace them after creating Vercel:

| Variable | First deploy | Production value |
| --- | --- | --- |
| `DOCUVERIFY_CORS_ORIGINS` | `["http://localhost:3000"]` | `["https://<vercel-project>.vercel.app"]` |
| `DOCUVERIFY_APP_ORIGIN` | `http://localhost:3000` | `https://<vercel-project>.vercel.app` |
| `DOCUVERIFY_GOOGLE_PROJECT_ID` | Google project ID or empty | Google project ID |
| `DOCUVERIFY_GOOGLE_CLIENT_ID` | Web client ID or empty | Web client ID |
| `DOCUVERIFY_GOOGLE_CLIENT_SECRET` | Web client secret or empty | Web client secret |
| `DOCUVERIFY_GEMINI_API_KEY` | Gemini key or empty | Gemini key for extraction |
| `DOCUVERIFY_GEMMA_API_KEY` | Gemma key or empty | Optional fallback key |

`DOCUVERIFY_CORS_ORIGINS` must be a JSON array. `DOCUVERIFY_APP_ORIGIN` must be one exact frontend origin without a path or trailing slash. The Blueprint also sets the production disk paths:

```text
DOCUVERIFY_BUNDLE_DIR=/var/data/docuverify/resources/sdoc-hackathon-bundle
DOCUVERIFY_MODEL_DIR=/var/data/docuverify/model/email_multiclass_classifier
DOCUVERIFY_MODEL_DEVICE=cpu
```

Repository defaults are `DOCUVERIFY_EXTRACTION_PRIMARY_MODEL=gemini-3.8-flash`, `DOCUVERIFY_EXTRACTION_SECONDARY_MODEL=gemini-3.7-flash` and `DOCUVERIFY_GEMMA_MODEL=gemma-4-26b-a4b-it`. Set alternate model names in Render if those are unavailable to your provider account. Confirm access with an actual request. Provider keys belong only in Render environment settings, never `.env.example`, Git, Vercel variables, Docker images or browser code.

After the first deploy, record `https://<render-service>.onrender.com` and check:

```powershell
$renderOrigin = 'https://<render-service>.onrender.com'
curl.exe --fail-with-body "$renderOrigin/api/v1/health"
```

Expect `{"status":"ok","service":"docuverify"}`. Health does not validate the bundle, model or providers.

## 2. Provision the private artifacts

The disk must contain:

```text
/var/data/docuverify/
  resources/sdoc-hackathon-bundle/inbox/*.json
  resources/sdoc-hackathon-bundle/attachments/...
  model/email_multiclass_classifier/config.json
  model/email_multiclass_classifier/...weights and tokenizer files...
```

Use the **running disk-backed service's Shell**, not a build or ephemeral shell. Render documents [SCP and Magic Wormhole transfers](https://render.com/docs/disks). For Magic Wormhole, package the authorized artifacts from the repository root in local PowerShell:

```powershell
$artifactArchive = Join-Path $env:TEMP 'docuverify-artifacts.tar.gz'
tar -czf $artifactArchive -C backend resources/sdoc-hackathon-bundle/inbox resources/sdoc-hackathon-bundle/attachments model/email_multiclass_classifier
python -m pip install magic-wormhole
wormhole send $artifactArchive
```

While that waits, in the running Render Shell:

```bash
mkdir -p /var/data/docuverify
cd /var/data/docuverify
wormhole receive
# Enter the private transfer code and inspect the archive.
tar -tzf docuverify-artifacts.tar.gz
tar -xzf docuverify-artifacts.tar.gz
test -d resources/sdoc-hackathon-bundle/inbox
test -d resources/sdoc-hackathon-bundle/attachments
test -f model/email_multiclass_classifier/config.json
find resources/sdoc-hackathon-bundle/inbox -maxdepth 1 -name '*.json' | head
```

Extract only archives containing the expected `resources/` and `model/` paths. Render's native Python runtime includes Magic Wormhole. Remove archives after validating the copies. Restart Render after replacing a loaded model to clear its process cache. Confirm the disk content survives a restart.

Missing inbox files cause `/api/v1/cases` to return 503 unless `DOCUVERIFY_INFERENCE_DIR` points to another provisioned inbox; an empty inbox returns `[]`. Missing BERT files cause classifier-unavailable 503 on normal case loads/uploads. Gemma cannot bypass a missing BERT model.

## 3. Deploy Vercel

Import the same repository into Vercel:

```text
Root Directory: frontend
Framework: Next.js
Install Command: pnpm install --frozen-lockfile
Build Command: pnpm build
Output Directory: Next.js default
```

Use a Node/pnpm version compatible with [frontend/package.json](frontend/package.json) and the committed `pnpm-lock.yaml`. Set these **Production** environment variables before building:

```dotenv
BACKEND_URL=https://<render-service>.onrender.com
NEXT_PUBLIC_BACKEND_URL=https://<render-service>.onrender.com
```

`BACKEND_URL` powers the `/api/v1/*` rewrite for auth, Gmail, case lists and attachment downloads. Without it, the rewrite defaults to localhost and fails on Vercel. `NEXT_PUBLIC_BACKEND_URL` is a browser-visible URL used by the upload modal and case extraction button; its value is embedded at build time, so rebuild when it changes. No provider secret belongs in Vercel. See [Next.js environment variables](https://nextjs.org/docs/pages/guides/environment-variables).

Uploads and case extraction call Render directly to avoid Vercel's [120-second external rewrite limit](https://vercel.com/docs/limits). Render must allow the exact Vercel origin via CORS. These two routes do not use Google cookies. Google login, callback, `/auth/me`, Gmail and logout remain on the same-origin Vercel rewrite so their host-only cookies work. Other long rewrite requests can still time out; test representative cases.

Record the stable production URL `https://<vercel-project>.vercel.app`, not a changing deployment preview URL.

## 4. Finish Google OAuth and origins

Enable Gmail API in Google Cloud. Configure OAuth branding, audience, the intended test users, and scopes `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`. Broader public use of the Gmail scope can require Google verification. See [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [local Google setup](backend/GOOGLE_SETUP.md).

Create or edit a **Web application** OAuth client. Register:

```text
Authorized JavaScript origin:
https://<vercel-project>.vercel.app

Authorized redirect URI requested by this code:
https://<vercel-project>.vercel.app/api/v1/auth/google/callback
```

The direct Render route exists at `https://<render-service>.onrender.com/api/v1/auth/google/callback`, but login requests the **Vercel** callback because it constructs the redirect from `DOCUVERIFY_APP_ORIGIN`. Registering the Render callback alone causes `redirect_uri_mismatch`. Vercel forwards the callback to FastAPI while the browser's session stays on the Vercel hostname.

Set the final Vercel origin in Render's `DOCUVERIFY_CORS_ORIGINS` and `DOCUVERIFY_APP_ORIGIN`, add the Google credentials if deferred, and redeploy Render. Use exact HTTPS hostnames and no trailing slash. Login will fail until this is complete.

## 5. Verify the deployment

Use actual case IDs and authorized demo documents. In local PowerShell:

```powershell
$renderOrigin = 'https://<render-service>.onrender.com'
$vercelOrigin = 'https://<vercel-project>.vercel.app'
curl.exe --fail-with-body "$renderOrigin/api/v1/health"
curl.exe --fail-with-body "$vercelOrigin/api/v1/health"
$cases = Invoke-RestMethod "$renderOrigin/api/v1/cases"
$cases | Select-Object id, category, classification_requires_review
$emailId = '<actual-email-id-from-cases>'
$encodedId = [uri]::EscapeDataString($emailId)
curl.exe --fail-with-body --max-time 600 -X POST "$renderOrigin/api/v1/cases/$encodedId/extract"
curl.exe --fail-with-body -o "$env:TEMP/docuverify-test-attachment" "$vercelOrigin/api/v1/cases/$encodedId/attachments/0"
```

Extraction returns fields, extraction status and review reasons. It does not persist a report. Test the upload route with a real email and optional documents (each file up to 25 MiB):

```powershell
curl.exe --fail-with-body --max-time 600 -X POST "$renderOrigin/api/v1/verifications" -F 'email=@C:/test/email.eml' -F 'attachments=@C:/test/example_SI.pdf' -F 'attachments=@C:/test/example_BL.pdf'
```

Browser checks:

- [ ] Vercel loads and its `/api/v1/health` rewrite reaches Render.
- [ ] Demo mailbox loads classified cases; attachments download. Missing bundle or BERT model yields a clear 503 until restored.
- [ ] **Extract** and **New verification** complete. Browser Network shows their POST requests to Render, with correct CORS headers and no Vercel proxy timeout.
- [ ] Google login returns through the registered Vercel callback and survives a page reload. Gmail refresh works after consent. The shipping dashboard is the shared demo queue; Gmail messages are available through their own component and `/api/v1/gmail/messages`.
- [ ] Logout makes `/api/v1/auth/me` return `user: null`; Gmail returns 401. Demo login still works.
- [ ] A Render restart preserves disk files and clears memory-only Google sessions. Frontend corrections/activity are session-only; export activity if needed.
- [ ] Hosting and monitoring logs do not contain OAuth callback query strings, cookies, provider keys or tokens. Keep HTTP/Authlib debug logging off.

## 6. Custom domains and operations

Complete generated-domain checks first. With frontend `https://app.example.com` and backend `https://api.example.com`:

1. Add DNS/TLS domains in Vercel and Render.
2. Set `DOCUVERIFY_APP_ORIGIN=https://app.example.com` and include `https://app.example.com` in Render's CORS JSON array.
3. Register Google's JavaScript origin `https://app.example.com` and redirect URI `https://app.example.com/api/v1/auth/google/callback`.
4. Set both Vercel backend URL variables to `https://api.example.com`, rebuild, redeploy Render, then retest login, logout, cases, extraction and uploads.

Use one canonical frontend origin: logout checks the exact origin and cookies are host-specific. Maintain an authorized backup of the bundle and model; the disk survives deployments but is not a backup. Size the service using a real case request because BERT loads on first classification.

## 7. Troubleshooting

| Symptom | Check |
| --- | --- |
| CORS blocks upload/extraction | Put the exact Vercel HTTPS origin in Render's JSON `DOCUVERIFY_CORS_ORIGINS`; redeploy. Inspect the real Render response too. |
| `redirect_uri_mismatch` | Register the **Vercel** callback and set the matching `DOCUVERIFY_APP_ORIGIN`. |
| `invalid_state` or disappearing login | Start a new login at the canonical Vercel URL, allow cookies and keep one worker/instance. Restarts clear sessions. |
| `/cases` returns 503 or empty | Check mounted inbox JSON and model files. Missing inbox returns 503; an empty inbox returns `[]`. |
| BERT unavailable | Restore all model files at `DOCUVERIFY_MODEL_DIR`; check available memory. Gemma cannot replace missing BERT. |
| Extraction fails or needs review | Check Gemini key/model access, document format and attachment paths. This branch has no OpenAI verifier or Tesseract OCR recovery. |
| Vercel rewrite targets localhost | Set `BACKEND_URL` before rebuilding. `NEXT_PUBLIC_BACKEND_URL` does not control the rewrite. |
| Direct POST still goes through Vercel | Set `NEXT_PUBLIC_BACKEND_URL` before the frontend build, rebuild, and inspect the POST URL in browser Network. |
| Gmail 401/403 | Reauthenticate; check Gmail API, scopes, testers and quota. Keep Gmail calls on the Vercel rewrite. |
| Attachment 404 | Check case-sensitive JSON references and bundle files. Upload files are temporary, not bundle attachments. |
| pnpm frozen install fails | Match Node/pnpm requirements and commit a compatible lockfile; keep frozen installation enabled. |

This document prepares deployment; hosted services and provider-backed flows must still be configured and tested with the actual accounts.
