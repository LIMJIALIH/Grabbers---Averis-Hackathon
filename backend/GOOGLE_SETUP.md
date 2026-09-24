# Google sign-in and Gmail setup

Use your existing Google Cloud project. No Cloud changes have been made automatically.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select your project. In **APIs & Services → Library**, enable **Gmail API**.
2. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**). Complete Branding with an app name, support email and developer contact. Under Audience, choose the audience appropriate for your project. For External development, leave publishing status as **Testing** and add your Google account under **Test users**.
3. Under **Data Access**, add `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/gmail.readonly`. Gmail readonly is a restricted scope; testing with listed test users is the intended local workflow. Publishing publicly requires Google's applicable verification process.
4. Under **Clients**, create an OAuth client of type **Web application**. Add authorized JavaScript origin `http://localhost:3000` and authorized redirect URI `http://localhost:3000/api/v1/auth/google/callback`. These must match exactly; use localhost consistently rather than switching to 127.0.0.1.
5. Add these values to the ignored `backend/.env` file, preserving your other settings:

   ```dotenv
   DOCUVERIFY_GOOGLE_PROJECT_ID=your-existing-project-id
   DOCUVERIFY_GOOGLE_CLIENT_ID=your-web-client-id
   DOCUVERIFY_GOOGLE_CLIENT_SECRET=your-web-client-secret
   DOCUVERIFY_APP_ORIGIN=http://localhost:3000
   ```

   The project ID is an informational setup value; OAuth identifies the project through the client ID. Never put the secret in frontend configuration, browser storage, screenshots, or source control. The example environment file contains empty Google variables only.

6. From `backend`, install dependencies and start one worker:

   ```powershell
   .venv/Scripts/python.exe -m pip install -r requirements.txt
   .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

   From `frontend`, run `npm run dev`. The existing Next.js rewrite proxies `/api/v1` to the backend. Restart the backend after changing credentials.

7. Visit `http://localhost:3000/login`, choose **Continue with Google**, and grant all requested scopes. Verify your picture or initials appear in the header and sidebar. Reload to verify session restoration. Open the **Account** menu and choose **Sign out**; the login screen should return. Check cancelled consent as well. The Google button is disabled until credentials are configured. **Continue with demo mailbox** starts a separate, tab-scoped demo session; it does not grant Gmail access. The queue still reads the shared shipping backend, not your Gmail inbox. The Gmail API endpoint and standalone inbox component are available, but the new dashboard does not yet expose a Gmail view.

The frontend checks the server session on load and window focus, handles the eight-hour expiry, and synchronizes Google logout between tabs. Failed logout hides account data and offers **Retry sign out**. Google tokens remain on the backend; the browser receives an HttpOnly session cookie. The frontend route guard is a navigation convenience; existing shipping/case APIs remain shared demo endpoints, not protected user-specific resources.

Sessions and tokens exist only in backend memory for eight hours. Restarting the backend requires signing in again. Use one worker; multiple workers need a shared server-side session store before deployment. Outside localhost, the configured origin must use HTTPS and cookies become Secure. App logout does not log you out of Google or revoke Google's grant. Expired access tokens refresh when a refresh token is available; otherwise sign in again. Google may expire refresh tokens issued to External apps in Testing.

Gmail fetching reads at most 50 inbox messages, with five concurrent detail requests, 20-second network timeouts and a 90-second overall fetch limit. Only inline message bodies are decoded; attachment names are shown without calling attachment download endpoints. HTML becomes plain text. Messages are never sent to the demo classifier, Gemini, extraction, or verification APIs. There is no polling or email sending.

Auth and Gmail responses use `Cache-Control: no-store`. The supplied Next.js development and Uvicorn access logging exclude these endpoints so callback codes are not logged. Keep HTTP/Authlib debug logging disabled and configure equivalent redaction if adding an external proxy or monitoring service.

Troubleshooting: `redirect_uri_mismatch` means the callback registration differs; access denied can mean your account is missing from test users; a configuration notice means credentials are absent; Gmail 403 can mean the API is disabled, consent is missing, or quota is exhausted. Rate limits show a retry message without automatic retrying.

References: [Google web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [Gmail messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get).
