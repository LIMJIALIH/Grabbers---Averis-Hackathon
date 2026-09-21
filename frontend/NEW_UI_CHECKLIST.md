# New UI — transition checklist

> **Three files, three questions.**
> | File | Answers | Written against |
> |---|---|---|
> | **this file** | *What must not be lost?* | the code that exists **today** |
> | [`NEW_UI_BUILD_CHECKLIST.md`](./NEW_UI_BUILD_CHECKLIST.md) | *What gets built, and how?* | the **new** design |
> | [`DESIGN_STYLE.md`](./DESIGN_STYLE.md) | *What does it look like?* | tokens and rules |
>
> This one is an **audit of the current apps** — ~150 boxes covering every modal, filter
> and control that already works, so the port doesn't quietly drop one. It is not a build
> plan; the build plan is the other file, and a feature appearing here does not mean it
> survives (three already didn't — see Open decisions).

Parity contract for the `New_UI` redesign: **nothing more, nothing less.**

Two apps exist today and both must survive the port:

| App | Route | Source | Data |
|---|---|---|---|
| **A — Dashboard** | `/` | `app/page.tsx` (1061 lines) + `globals.css` + `appearance.css` | Live backend |
| **B — Verification workspace** | `/verification` | `components/*` (7 files, ~1960 lines) | Mock (`data/mockShippingData.ts`) |

They do not share a design language. A is hand-written CSS (charcoal/paper/orange, 13px Segoe).
B is Tailwind utilities (zinc/emerald/amber/rose/teal). **Unifying these two is the redesign.**

---

## App A — Dashboard (`/`)

### A1. Shell
- [ ] Skip link → `#main`
- [ ] Fixed sidebar
- [ ] Mobile backdrop (blur, closes nav)
- [ ] Sidebar collapse toggle — persists to `localStorage["docuverify-sidebar"]`
- [ ] Theme toggle light/dark — persists to `localStorage["docuverify-theme"]`, falls back to `prefers-color-scheme`
- [ ] Responsive switch at `max-width: 600px`

### A2. Navigation
- [ ] Brand lockup (ship mark + wordmark + "SHIPPING INTELLIGENCE")
- [ ] Workspace switcher — "Averis workspace / Operations team" + PRO badge
- [ ] Nav items ×4 — Overview · Verification inbox · Documents · Audit trail
- [ ] Review-count badge on "Verification inbox"
- [ ] **Link to `/verification`** — "Verification workspace" (added by merge `f4504e2`)
- [ ] Pipeline settings button
- [ ] Integrations button + unread dot
- [ ] Trust card — "A second pair of eyes" + Explore the pipeline
- [ ] Profile chip — JR / Jamie Roberts + settings icon

### A3. Topbar
- [ ] Breadcrumb — Workspace › `{view}`
- [ ] "Interactive demo" status pill
- [ ] Notification bell + unread dot
- [ ] Avatar (small)
- [ ] Decorative divider `.top-divider`

### A4. Page header
- [ ] Eyebrow + H1 + subcopy (H1 swaps per view)
- [ ] "New verification" primary CTA

### A5. Metric cards
- [ ] Documents in queue — `cases.length`
- [ ] Needs your attention — `state === "review"` (gets `.attention` styling)
- [ ] Approved this session — `state === "approved"`
- [ ] Fields per verification — literal `7`
- [x] ~~Inline SVG sparkline — **hardcoded, identical on all four**~~ — **dropped, not ported** (see Open decisions)

### A6. Pipeline stepper
- [ ] 5 nodes: Classify · Ingest · Extract · Compare · Human review
- [ ] Steps 1–4 render a check, step 5 renders `.current` with pulse
- [ ] Every node is a button → explainer modal

### A7. Queue rail
- [ ] Header + filtered count
- [ ] Reset-filters icon button
- [ ] Search input — matches `id + vessel + company`, client-side
- [ ] Filter select — All cases / Needs review / Approved
- [ ] Pagination — 10/page, prev/next, "x–y of n emails", scroll-to-top on change
- [ ] Queue item — id · time · subject · sender · badge · attachment count
- [ ] Status badge — 5 tones: `orange` `yellow` `green` `dark` `neutral`
- [ ] Empty state + clear-filters
- [ ] Footer strip — "Your judgment makes the difference."

### A8. Workbench heading
- [ ] H2 "Verification workspace"
- [ ] `.live-pill` — "HUMAN IN THE LOOP"
- [ ] "Export report" text button

### A9. Case pane
- [ ] Case kicker — "DOCUMENT COMPARISON / {id}"
- [ ] Title + subtitle (sender, attachment count)
- [ ] State badge
- [ ] Sample email reader — From / Subject / body `<pre>`
- [ ] "extraction not run" info note
- [ ] Attachment `<select>`
- [ ] Attachment download link → live endpoint
- [ ] `.txt` inline preview
- [ ] Missing-attachment notice (`url === null`)
- [ ] Footer status line
- [ ] Escalate button
- [ ] Approve & submit button (gated on `unresolved === 0`)

### A10. Alternate views
- [ ] **Documents** — card grid over all cases + attachment names
- [ ] **Audit trail** — timeline rows (time + text) from in-memory `audit[]`

### A11. Modals — one `<dialog>`, 14 identities
- [ ] Upload documents — file picker, `.pdf/.docx/.txt/.json`, 20MB cap, file preview rows
- [ ] Escalate case — reason textarea, required
- [ ] Approve & submit — confirm
- [ ] Notifications — top 3 review cases, click-to-navigate
- [ ] Pipeline settings
- [ ] Integrations
- [ ] Operator settings
- [ ] Help & resources
- [ ] Classify / Ingest / Extract / Compare / Human review (5 stage explainers)
- [ ] How it works
- [ ] `.modal-features` numbered list — 5 different datasets feed it
- [ ] Native `<dialog>` behaviour: ESC, backdrop click, focus trap

### A12. Feedback + footer
- [ ] Toast — auto-dismiss 4.5s, dismissable, 4 messages
- [ ] Loading state
- [ ] Error state + Retry button
- [ ] Page footer — 2 spans
- [ ] `exportReport()` — client-side JSON blob download

---

## App B — Verification workspace (`/verification`)

### B1. App shell
- [ ] Header bar — ship mark + "Malaysia Shipping Document Verification" + subtitle
- [ ] "Audit Recorder Active" pill
- [ ] "Dashboard" link back to `/`
- [ ] "Quick Test Action" button (logs a synthetic approval)
- [ ] Audit panel toggle + live count badge

### B2. Workflow bar
- [ ] Case-email pill strip — discrepancy dot (amber) / approved check (emerald)
- [ ] Request Review button (rose)
- [ ] Generate Report button (teal)
- [ ] Approve Verification button (emerald, disabled when approved)

### B3. Email header card
- [ ] Sender / subject / received date / status
- [ ] SI + BL attachment launchers
- [ ] Quick metrics bar — Carrier · Vessel & Voyage · SI Reference · BL Reference

### B4. Tabs
- [ ] SI vs BL Comparison Matrix + discrepancy-count badge
- [ ] Side-by-Side Document Comparison

### B5. Comparison tab
- [ ] Discrepancy summary alert (amber, conditional)
- [ ] Comparison table — Field / SI value / BL value / status / action
- [ ] Row states — `matched` `discrepancy` `corrected`
- [ ] Per-row "Correct" action button

### B6. Documents tab
- [ ] SI column — 13 fields + open-attachment button
- [ ] BL column — 13 fields + open-attachment button

### B7. Modals
- [ ] **FieldCorrectionModal** — pick SI or BL value, free-text corrected value, reason textarea
- [ ] **HumanReviewModal** — priority low/medium/high, notes textarea
- [ ] **DocumentAttachmentModal** — full document viewer
- [ ] **ReportModal** — certificate banner, stats, field table, `window.print()`

### B8. Audit trail panel
- [ ] Header + entry count
- [ ] Export JSON button
- [ ] Clear trail button
- [ ] Transient-storage notice
- [ ] Search input (descriptions, fields, metadata)
- [ ] Action-type filter select
- [ ] Email filter select
- [ ] Sort-order toggle
- [ ] Timeline list — sequence no · timestamp · action label · description
- [ ] Per-entry metadata expand toggle
- [ ] Footer info

### B9. Audit recorder — `lib/auditTrailStore.ts`
- [ ] `recordUserAction()` still importable by any component
- [ ] `useAuditTrail()` via `useSyncExternalStore`
- [ ] 8 action types wired: `OPEN_EMAIL` `VIEW_ATTACHMENT` `REVIEW_COMPARISON` `APPROVE_RESULT` `CORRECT_FIELD` `REQUEST_HUMAN_REVIEW` `GENERATE_REPORT` `SYSTEM_NOTE`
- [ ] Seed-on-mount (2 entries) preserved
- [ ] In-memory only — no localStorage, wipes on refresh

---

## Backend contracts — do not change

### Live and consumed
- [ ] `GET /api/v1/cases` → `Case[]`
- [ ] `GET /api/v1/cases/{email_id}/attachments/{index}` → `FileResponse`

```ts
// what the dashboard consumes today
{ id, vessel /* = subject */, company /* = sender */, time: "" /* always */,
  kind: "Pending review", state: "review",
  body, fields: [], attachments: [{ name, url: string|null, text: string|null }] }
```

### Exists, not yet consumed
- [ ] `GET /api/v1/health` → wire to the topbar status pill
- [ ] `POST /api/v1/ingestion` → `VerificationResult` with `fields: ComparisonField[]`, `extraction_status`, `review_reasons`

### Still missing
- [ ] Populated `fields[]` on `GET /cases`
- [ ] `POST` for approve / escalate / submit
- [ ] Persisted audit log
- [ ] Auth / `/me`

---

## Type reconciliation — the real work

Two incompatible field models describe the same thing:

| | App A | App B | Backend |
|---|---|---|---|
| Type | `Field` (`app/page.tsx:36`) | `ComparisonField` (`types/shipping.ts`) | `ComparisonField` (`schemas/verification.py`) |
| Shape | `key,label,si,bl,confidence` | `id,label,siValue,blValue,isMatch,status` | `key,label,si,bl,confidence` |
| Status | derived via `matches()` | explicit `status` field | `extraction_status` + `review_reasons` |

- [ ] Pick one field type — backend's `{key,label,si,bl,confidence}` matches App A and the API
- [ ] Map App B's `status` / `isMatch` onto it (derive, don't store)
- [ ] Rename `vessel` → `subject`, `company` → `sender` in the `Case` type
- [ ] Decide `time` — always `""` today; populate it backend-side or drop the column

---

## Excluded — do not port

387 lines of `globals.css`, 27 classes, zero JSX references. App B already implements all of it properly.

`.comparison-row` `.table-head` `.field-label` `.reference-value` `.draft-value` `.value-button`
`.field-action` `.issue-dot` `.flagged` `.focused-row` `.confidence-meter` `.review-notice`
`.normalization-note` `.edit-form` `.segmented` `.chosen` `.source-toolbar` `.source-caption`
`.paper` `.paper-brand` `.paper-field` `.paper-number` `.paper-signature` `.paper-stage`
`.highlight` `.extract-tag` `.mobile-toggle`

Also unused: `components/ui/button.tsx` (imported by nothing). Tailwind v4 is installed but used only by App B.

---

## Open decisions

- [x] **Merge or keep two routes?** → **Merge.** `/` Overview, `/inbox` workspace, `/documents`, `/audit`, `/verification` redirects. App B's logic survives, App A's second shell does not. See `NEW_UI_BUILD_CHECKLIST.md` §0.0.
- [x] **Which design language wins** — **neither.** A new one: warm paper, burgundy `#6D001A` brand, Averis orange `#E78823` for `NEEDS_REVIEW` only, black CTAs. See `DESIGN_STYLE.md`.
- [ ] **`FRONTEND.md` is stale** — it describes App A features that never existed. Rewrite or delete after the port.
- [x] **A5 sparklines** — **dropped.** Hardcoded identical SVG on all four cards; no per-day history exists to make them real. KPI cards carry a second derived number instead (`NEW_UI_BUILD_CHECKLIST.md` §2).
