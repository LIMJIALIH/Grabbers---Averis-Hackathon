# Supabase Gmail sync setup

Apply migrations in order: `001_gmail_sync.sql`, then `002_gmail_snapshot.sql` in the Supabase SQL editor before deploying the updated backend.
The second migration adds an atomic, service-role-only snapshot function. Saved Inbox reads use `GET /api/v1/gmail/messages` and never call Google.
Each sync retains historical rows while marking only IDs in Google's current 50-message Inbox response as visible. Previously saved bodies remain available when a detail fetch fails; new failed messages cannot be displayed until successfully fetched.
Personal account views display metadata only. Shipping extraction and the local demo dataset are separate.

The Gmail sync targets Supabase project `qufmfsxrvjatnqgdppgs` at
`https://qufmfsxrvjatnqgdppgs.supabase.co`.

1. Open the project in the Supabase dashboard and choose **Settings → API Keys**.
2. Create or reveal a server-side secret key beginning with `sb_secret_`. Do not use a
   publishable key and do not expose the secret in the browser application.
3. Put the key in the ignored `backend/.env` file:

   ```dotenv
   DOCUVERIFY_SUPABASE_URL=https://qufmfsxrvjatnqgdppgs.supabase.co
   DOCUVERIFY_SUPABASE_SECRET_KEY=sb_secret_your_key
   ```

4. Open **SQL Editor**, paste the contents of
   `supabase/migrations/001_gmail_sync.sql`, and run it once. The migration is
   idempotent, enables row-level security, and leaves browser roles without table access.
5. Restart the backend, sign in with Google, open `/gmail`, and choose **Sync Gmail**.

The secret key stays on the FastAPI server. Google access and refresh tokens remain in
process memory and are not stored in Supabase. A sync stores message headers, decoded
plain-text bodies, labels, and attachment filenames; it does not download attachment data.
