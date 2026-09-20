# Verification and audit workflow

The imported audit workflow is part of the existing Next.js frontend at `/verification`. Run `npm run dev` from `frontend/` and choose **Verification workspace** in the dashboard navigation. The workspace includes a **Dashboard** link back to `/`. There is one package manifest, build, and frontend server.

The verification workflow still uses sample shipping emails. Its audit store is browser memory, clears on refresh, and has no backend persistence. Existing dashboard data and interactions remain intact.

## File responsibilities

| File | Function |
| --- | --- |
| `app/verification/page.tsx` | Next.js route and page metadata. |
| `components/VerificationWorkspace.tsx` | Former `App.tsx`: shipping state, email selection, workflow and audit panel composition. |
| `components/ShippingVerificationView.tsx` | Comparison workflow, corrections, approvals, review requests, and reports. |
| `components/AuditTrailPanel.tsx` | Audit event display, filtering, search, sorting, clearing, and JSON export. |
| `components/DocumentAttachmentModal.tsx` | Sample SI/BL document details and attachment actions. |
| `components/FieldCorrectionModal.tsx` | Field correction entry and audit action recording. |
| `components/HumanReviewModal.tsx` | Review request entry and audit action recording. |
| `components/ReportModal.tsx` | Report display, print, and download actions. |
| `lib/auditTrailStore.ts` | Shared in-memory audit recorder, subscriptions, and React hook. |
| `types/shipping.ts` | Shipping, comparison, verification status, and audit event types. |
| `data/mockShippingData.ts` | Sample email and comparison data. |
| `docs/audit-prototype-metadata.json` | Retained original AI Studio metadata, for provenance only. |

## Replaced standalone scaffolding

Next.js `app/layout.tsx` and the new route replace Vite's `index.html` and `src/main.tsx`. The existing `app/globals.css` already imports Tailwind, replacing the duplicate `src/index.css`. The existing `package.json`, `tsconfig.json`, PostCSS configuration, and `.gitignore` replace the separate Vite configuration and manifest. All imported runtime code uses React and lucide-react, already installed in the main frontend; no additional dependencies are required. The former standalone README is replaced by this file.
