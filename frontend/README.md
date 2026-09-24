# DocuVerify frontend

Next.js 16 · React 19 · TypeScript · Tailwind 4. Design source of truth: [`DESIGN_STYLE.md`](./DESIGN_STYLE.md); build plan: [`NEW_UI_BUILD_CHECKLIST.md`](./NEW_UI_BUILD_CHECKLIST.md).

```bash
pnpm install
pnpm dev          # http://localhost:3000, proxies /api/v1/* to BACKEND_URL (default http://127.0.0.1:8000)
```

| Route | What |
|---|---|
| `/` | Overview: greeting, KPIs, charts, queue preview, activity |
| `/inbox?case=email_004` | Work screen: queue rail + SI vs BL comparison |
| `/documents` | Attachment grid |
| `/audit` | Session audit trail (in-memory, Export JSON) |
| `/login` | Google OAuth or demo mailbox sign-in |

Every Overview number comes from one selector, `summarise()` in `lib/cases.ts`. If the backend is down, the app shows an offline state. For Vercel and Render setup, see [the deployment guide](../DEPLOYMENT_VERCEL_RENDER.md). The upload and extraction actions call `NEXT_PUBLIC_BACKEND_URL` directly when it is configured; Google and Gmail requests continue through the `BACKEND_URL` rewrite.
