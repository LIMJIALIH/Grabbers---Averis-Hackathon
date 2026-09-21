# New UI — build checklist

> **Three files, three questions.**
> | File | Answers | Written against |
> |---|---|---|
> | **this file** | *What gets built, and how?* | the **new** design |
> | [`NEW_UI_CHECKLIST.md`](./NEW_UI_CHECKLIST.md) | *What must not be lost?* | the code that exists **today** |
> | [`DESIGN_STYLE.md`](./DESIGN_STYLE.md) | *What does it look like?* | tokens and rules |
>
> Start here. Reach for the parity checklist when you finish a screen, to confirm nothing
> the old app did got dropped on the way. Both must end green.

How each widget gets built, and what will break if I'm careless. Follows
[`DESIGN_STYLE.md`](./DESIGN_STYLE.md); tokens referenced by name, never re-specified here.

## Data reality check — read before building anything

| Source | Status | Gives us |
|---|---|---|
| `sdoc-hackathon-bundle/inbox/email_*.json` | ✅ on disk | `email_id`, `from`, `subject`, `body`, `attachments[]` |
| `sdoc-hackathon-bundle/attachments/*` | ✅ on disk | `.txt` and `.xlsx` SI/BL pairs |
| `sdoc-hackathon-bundle/sample_submission.json` | ✅ on disk | the exact result shape: `category`, `status`, `review_reason`, `has_defect`, `defect_fields[]` |
| `GET /api/v1/cases` | ✅ live | cases, but `fields[]` always empty |
| `GET /api/v1/cases/{id}/attachments/{i}` | ✅ live | the file |
| `POST /api/v1/ingestion` | ⚠️ exists, unused | `VerificationResult` with real `fields[]` |
| approve / escalate / submit | ❌ missing | — |
| persisted audit log, auth, `/me` | ❌ missing | — |
| historical time series (per-day counts) | ❌ **does not exist** | — |

**Four rules that follow from that table, and they drive every widget below:**

1. **Every widget derives from one client-side selector over `Case[]`.** One
   `useMemo(() => summarise(cases), [cases])` in `lib/metrics.ts` feeds the whole
   Overview. No widget fetches for itself, no widget holds its own copy of the numbers.
2. **The status vocabulary is the bundle's, everywhere**: `BL_COMPARISON` `SI_REQUEST`
   `INVOICE_QUERY` `GENERAL` `SPAM` / `OK` `MISMATCH` `NEEDS_REVIEW` / `wrong_doc_type`
   `missing_attachment` `unreadable` `missing_value`. No invented labels, ever — the
   submission JSON is scored on exactly these strings.
3. **Anything time-based is synthetic until the backend stores a timestamp.** Every
   such widget carries a visible `Demo data` chip. Fabricating a trend line and letting a
   judge assume it's real is the one thing that would actually sink us.
4. **Everything is scoped to the active Google account.** The selector keys on the active
   account id, and switching accounts clears it before anything re-renders. One mailbox's
   count shown under another mailbox's name is the worst bug this app can ship, because
   the operator acts on it. See §0.3.

---

## 0. Shell

### 0.0 Route map — the merge (decided)

`/` and `/verification` are **merged into one app**. They currently duplicate the queue,
approve, escalate and the audit trail across two design languages and two incompatible
field types; keeping both means every fix gets made twice and the demo has to explain why
there are two dashboards.

| Route | Is | Comes from |
|---|---|---|
| `/` | Overview — greeting, KPI row, charts, queue preview, activity feed | today's `app/page.tsx`, restyled |
| `/inbox` | The work screen — queue rail + case pane + comparison matrix | today's `/verification` components, restyled |
| `/documents` | Attachment grid | today's Documents *view* inside `page.tsx` |
| `/audit` | Full audit timeline | today's `AuditTrailPanel`, promoted to a page |
| `/verification` | `redirect('/inbox')` | permanent redirect, no UI |
| `/login` | Google sign-in, read-only scope disclosure | new (§0.3) |
| `/auth/callback` | OAuth return, no UI beyond a spinner | new |

What the merge actually deletes: the second app shell, the second header, the second
status-badge vocabulary, the second queue implementation, and `Field` vs `ComparisonField`
(one type survives — the backend's `{key,label,si,bl,confidence}`, with match status
*derived*, never stored). What it keeps: **all of App B's logic**, which is the better of
the two implementations. This is a restyle plus a route move, not a rewrite.

- **Watch for:** the four views are currently a `view` state variable inside one component,
  not routes — splitting them means the sidebar's active state comes from `usePathname()`
  and deep links finally work (`/inbox?case=email_004` is what the demo video should use);
  the modals live at the route that owns them, not in a shared tree; `redirect()` on
  `/verification` so any link already shared still lands somewhere.

### 0.1 Topbar
- **Is:** 64px sticky bar. Left: breadcrumb `Dashboard › Overview`. Centre-right: `⌘K`
  search. Right: notification bell, then the **signed-in Google account chip** (photo +
  email, chevron — this is the account switcher, §0.3), then the **DocuVerify logo
  lockup** (mark + `SHIPPING DOCUMENTATION` in `label` style beneath) at the far right,
  per your decision. A 2px `#E78823` rule sits above the whole bar.
- **Build:** one `<header>` in `app/layout.tsx`, `position: sticky; top: 0; z-index: 40`.
  Breadcrumb driven by `usePathname()`, not props — nothing to keep in sync.
- **Watch for:** the logo being the last tab stop on a page (put it in the DOM last but
  give the search a skip-target); the orange rule disappearing against dark theme (it
  keeps `#E78823` in both — that's the point); breadcrumb overflow on mobile → collapse
  to just the view name under 640.

### 0.2 Sidebar
- **Is:** 248px. Top = **mailbox status strip** in ref 3's block shape — Gmail mark, the
  active mailbox address, and `Synced 2m ago` beneath, with a sync icon button. It is
  *not* a second switcher (§0.3 explains why the switcher lives top-right instead); it is
  the answer to "which inbox am I looking at, and is it current?". Then `MAIN` → Overview ·
  Verification inbox (with review-count badge) · Documents · Audit trail. Then `PIPELINE`
  → Run pipeline · Integrations · Pipeline settings. Bottom = profile chip.
- **Build:** `<nav>` with `aria-current="page"`; active item = `--burgundy-tint` fill +
  2px burgundy left bar + burgundy icon. Collapse toggle persists to
  `localStorage["docuverify-sidebar"]`; at ≤900px it becomes a `<dialog>` drawer with a
  blurred backdrop.
- **Watch for:** the review badge going stale — it reads the same selector as KPI 2, never
  its own count; icon-only mode losing its label for screen readers (keep the text in a
  `.sr-only` span, not a `title`); long addresses (`shipping.docs.apac@aprilasia.com`)
  must truncate from the middle, not the end, or every account looks identical;
  `Synced 2m ago` needs a 60s tick or it freezes for the whole demo.

### 0.3 Sign-in and account switching (Google OAuth)

The switcher is **real**: it swaps which connected Gmail account DocuVerify is reading.
That makes it an *account* switcher, not a team switcher, so it uses the pattern every
user already knows from Gmail — **the avatar chip at the top right**, not a sidebar block.
One switcher, in the place people reach for it. The sidebar keeps the mailbox status strip
(§0.2) so the active inbox is always visible without opening a menu.

**One mailbox at a time** — no combined view. Switching is a context change, not a filter:
the whole screen belongs to one account, which is what makes rule 4 checkable by eye
(every number on screen should agree with the address in the sidebar strip).

- **`/login`:** centred card on `--paper`. Logo lockup, one line of what this is
  (`Reads your shipping inbox, checks every draft BL against its SI`), the Google button,
  and — directly under it — the scope disclosure: **`Read-only access. DocuVerify never
  sends, deletes or replies.`** That sentence is a trust argument, and for a judge it is
  the difference between "they wired an API" and "they thought about the user". Footer:
  `DocuVerify · built for AVERIS SDOC`.
- **Account chip (topbar right):** photo (or initials on `--burgundy-tint`), email
  truncated from the middle, chevron. Menu: connected accounts with a check on the active
  one, `Add another account`, `Sync now`, `Settings`, `Sign out`. Active account carries
  the `label`-style caption `ACTIVE MAILBOX`.
- **Build:** one `useAccount()` over an `/api/v1/me`-shaped response
  (`email`, `name`, `given_name`, `picture`, `accounts[]`). Server holds the tokens;
  the client never sees a refresh token. Route guard: no session → `redirect('/login')`
  with `?next=` preserved.
- **Watch for — the switch itself is the dangerous part:**
  - **Every number on screen is account-scoped.** The metrics selector keys on the active
    account id, and a switch clears the cache before it renders. A stale `14 need you`
    from the previous mailbox is the worst bug this app can ship — the operator acts on it.
  - Switching while a case is open → back to `/` with a toast, not into someone else's
    `email_004`. Deep links carry the account id and 404 honestly if it doesn't match.
  - **Token expiry mid-shift.** `Reconnect this account` inline in the mailbox strip —
    orange, not a full-page logout that discards unsaved corrections.
  - Google photos fail to load often enough to matter → initials fallback, always.
  - The consent screen is unverified during a hackathon; Google shows a scary interstitial.
    Say so on `/login` in one quiet line rather than letting a judge hit it cold.
  - `credentials.json` / `token.json` stay out of git (already in `Resource.md` §5).
  - Demo path must survive **no network**: a `Continue with the sample inbox` link under
    the Google button loads the bundle's 500 emails. If Wi-Fi dies mid-presentation, the
    demo still runs. This is the single highest-value hour in the whole build.

### 0.4 Theme + density
- **Build:** `data-theme` on `<html>`, `localStorage["docuverify-theme"]`, falls back to
  `prefers-color-scheme`. Set it in a blocking inline script in `<head>`.
- **Watch for:** the flash of light theme before hydration — that inline script is the
  only fix; chart colours must come from CSS vars read at render, not hardcoded hex,
  or dark mode ships burgundy nobody can see.

---

## 1. Greeting + pipeline progress (ref 5)

- **Is:** `Hello, Najiha` in `display`, one line of context under it, a **segmented
  progress bar** showing where the inbox currently sits, and three bare numbers beside it
  in `metric-sm`.
- **Segments:** Classified → Extracted → Compared → Cleared, each a share of total emails,
  in `--b-900 / --b-700 / --b-500 / --b-300`, with the not-yet-processed remainder in
  `--surface-2` with a hatched fill.
- **Numbers:** `128 processed · 14 need you · 96 auto-cleared`.
- **Build:** flex row of `<div>`s with `flex-grow: {share}` inside one 28px rounded
  track — no chart library for a stacked bar. Percent labels inline when a segment is
  ≥ 12% wide, in a tooltip otherwise. `role="img"` + `aria-label` with the full sentence.
- **Name:** from the signed-in Google profile — `given_name`, falling back to the local
  part of the email title-cased (`shipping.docs` → `Shipping Docs`), falling back to
  `Hello` alone. Never a hardcoded name, and never `Hello, undefined`. One `useAccount()`
  (§0.3) — the same hook the topbar chip reads, so the greeting and the account chip can
  never disagree about who is signed in.
- **Watch for:** segments under ~3% collapsing into invisible slivers → floor them at 4px
  and mark the bar approximate; a long `given_name` (or a name in a non-Latin script)
  must not push the three numbers off the row — the greeting truncates, the numbers never
  do; label contrast on `--b-300` (use `--ink`, not white); the greeting re-renders on an
  account switch, so it must not animate its count-up a second time.

---

## 2. The four KPI cards (your "front four widgets")

**Decided: no sparklines.** There is no per-day history to draw, and the current dashboard
ships one hardcoded SVG curve on all four cards. Four identical curves is the kind of
detail a judge notices, and once they do they stop trusting every other number on screen.
The cards carry a **second real number** in that slot instead — a breakdown that the same
selector can actually prove.

| # | Label | Value | Second line (real, derived) | Accent |
|---|---|---|---|---|
| 1 | `EMAILS PROCESSED` | `cases.length` | `128 of 128 classified` | neutral |
| 2 | `NEEDS YOUR REVIEW` | `status === NEEDS_REVIEW` | `3 unreadable · 1 missing doc` | **orange, filled card** |
| 3 | `DEFECTS CAUGHT` | `status === MISMATCH` | `across 5 of 7 fields` | burgundy |
| 4 | `STRAIGHT-THROUGH` | `OK / total` as % | `96 cleared without a human` | green |

- **Build:** one `<KpiCard>` — icon chip top-right (ref 4), `label`, `metric` number, then
  the second line in `meta`. No chart inside the card. Ref 1's trick of filling exactly
  one card is what makes the row scan: card 2 is the filled one, and it's the only orange
  fill on the page. Numbers count up 600ms on first mount only.
- **Watch for:** the second line is a *composition* of the same number, never a
  comparison over time — the moment it says "vs yesterday" it's fabricated again; card 2
  stays orange at zero (it reads `0 — nothing needs you`, not a greyed-out card); card 4's
  % needs `tabular-nums` or it jitters while counting; the four cards must stay the same
  height when one second-line wraps and the others don't (fixed min-height, not `auto`).
- **Reversal condition:** if a `received_at` per email ever lands, sparklines come back —
  four *different* curves from real per-day counts, 32px tall, no axes. Until then the
  slot stays honest.

---

## 3. Classification trend (ref 3's pixel-block chart — the "fun" one)

- **Is:** full-width card. Emails per day, stacked by the 5 categories, drawn as a grid of
  small blocks rather than smooth bars, each category in its fixed ramp shade.
- **Build:** pure SVG `<rect>` grid, ~4×8px blocks with 2px gaps; unfilled cells get
  `--b-050` so the grid reads as a texture (that's the ref-3 effect). Weekly/Monthly/Yearly
  segmented control. Hover a column → dark tooltip chip listing all 5 categories with
  counts. Direct labels at the right end of the ramp; no legend block.
- **Watch for:** block count exploding — cap the grid at ~40 columns and bucket beyond
  that, or it's thousands of DOM nodes and the tab janks; the hover target must be one
  invisible full-height column `<rect>`, not the individual blocks; `SPAM` at `--b-100`
  vanishing on white — give every block a `0.5px` `--line` stroke; and this is the widget
  most likely to need the `Demo data` chip — it needs per-day timestamps we don't store.

---

## 4. Category mix (donut)

- **Is:** 5-slice donut in the ramp, centre holds total email count + `EMAILS`, legend
  right with count and % per category (ref 2's traffic-sources card).
- **Build:** SVG circle with `stroke-dasharray` — 5 slices does not justify a chart
  library. Click a slice → filters the queue table below and pushes `?category=` to the
  URL.
- **Watch for:** slices under 2% being unclickable → minimum 6° arc plus the legend row is
  always the real hit target; the centre number must be the same `cases.length` as KPI 1
  (same selector, or they will disagree on screen and that's the most embarrassing
  possible bug); announce the filter change in the live region.

---

## 5. Field defect rate (7 fields)

- **Is:** which of the 7 fields fails most — `shipper`, `consignee`, `notify_party`,
  `port_of_loading`, `port_of_discharge`, `container_count`, `gross_weight_kg`. Horizontal
  bars in the burgundy ramp, sorted descending, count + % at the end of each.
- **Build:** counts from `defect_fields[]` across all `MISMATCH` cases. Plain flexbox
  bars, no SVG needed. Click a field → queue filtered to cases with that defect.
- **Watch for:** field labels must be human ("Port of loading"), while the tooltip and any
  copy-to-clipboard give the raw key — the operator reads prose, the engineer debugging
  the submission needs the key; zero-defect fields still render at 0 (a field never
  failing is information, not something to hide); percentages are of *mismatched cases*,
  not of all emails — label the denominator or it's a lie.

---

## 6. Verification queue table (ref 3's transactions table)

- **Is:** the work list. Columns: checkbox · `EMAIL ID` (mono) · `SUBJECT` · `SENDER` ·
  `CATEGORY` (outline pill) · `STATUS` (tint pill) · `CONFIDENCE` · `⋯`.
- **Build:** search (matches id + subject + sender), category filter, status filter,
  sortable heads, 10/page pagination, sticky head. Row click → `/inbox?case={email_id}`;
  the `⋯` menu stops propagation. Bulk approve from the header checkbox only once a bulk
  endpoint exists — until then the checkbox column doesn't render at all.
- **One component, two homes:** `/` renders it capped at 5 rows with a `View all` footer;
  `/inbox` renders the full thing in the queue rail. Same component, a `limit` prop —
  not two tables that drift apart.
- **Watch for:** subject lines are long and full of underscores
  (`TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ …`) → clamp to one line with
  `text-overflow: ellipsis`, full text in `title` and in the row detail, and never let it
  push the status column off-screen; `NEEDS_REVIEW` rows sort to the top by default;
  confidence renders as a number **plus** a bar, and anything under 0.85 picks up the
  orange treatment (that's the HITL threshold from the architecture, so it must be one
  constant, not a literal repeated in three files); empty search state offers "clear
  filters", not a shrug.

---

## 7. Needs-review alert bar

- **Is:** one orange-tinted strip above the queue when `NEEDS_REVIEW > 0`:
  *"14 emails need a human. 4 have been waiting over 24 hours."* + `Review oldest first`.
- **Build:** conditional render, `role="status"`. Reasons grouped by `review_reason` as
  small counts (`3 unreadable · 1 missing attachment`).
- **Watch for:** it must vanish completely at zero, not turn into a green "all clear"
  banner that burns a row of screen forever; the 24h figure needs a real received
  timestamp — if there isn't one, drop that clause rather than invent it.

---

## 8. Recent activity / audit feed

- **Is:** ref 2's team-activity list. Avatar · actor · action · target · relative time.
  *"Najiha corrected consignee on email_004 · 2m ago"*.
- **Build:** reads the existing `lib/auditTrailStore.ts` via `useAuditTrail()` — that
  store already works, has 8 action types and a `useSyncExternalStore` subscription.
  Reuse it; do not write a second one. Top 6 entries + `View all` → `/audit`.
- **Watch for:** it's in-memory and wipes on refresh — the card footer says so in one
  quiet line (`Session only — not yet persisted`) rather than pretending; relative
  timestamps need a 60s tick or they freeze at "just now" for the whole demo.

---

## 9. Verification inbox (`/inbox`) — the actual work screen

- **Is:** queue rail left, case pane right. Case pane = email header card (sender,
  subject, received, status, attachment launchers), quick-metrics row, then two tabs:
  **SI vs BL comparison matrix** and **Side-by-side documents**.
- **Comparison matrix:** 7 rows — `FIELD · SI VALUE · BL VALUE · STATUS · ACTION`. Values
  mono. Matching rows stay quiet; mismatched rows get a burgundy left bar, tint, and the
  **differing characters highlighted inside the value** (diff at character level, not
  just a red row).
- **Build:** move `ShippingVerificationView` + `FieldCorrectionModal` + `HumanReviewModal`
  + `DocumentAttachmentModal` + `ReportModal` to `/inbox` and restyle to the new tokens.
  Their logic is already the better implementation of the two apps — this is a restyle and
  a route move, not a rewrite. Two real code changes come with the merge (§0.0): the type
  reconciliation (settle on the backend's `{key,label,si,bl,confidence}` and *derive*
  match status — don't store it in two shapes), and swapping the mock
  `data/mockShippingData.ts` for the live `GET /api/v1/cases` with the mock kept only as
  the offline fallback for the demo.
- **Watch for:** SI is the source of truth — the wording is always "BL differs from SI on
  *field*", never a neutral "these differ", or the operator can't tell which document to
  fix; normalisation must be visible (`5,000 kg` vs `11023 lbs` matching is correct but
  looks wrong — show the normalised value with the original underneath, or the operator
  overrides a correct machine call); Approve stays disabled while any row is unresolved,
  and the button says *why* it's disabled; every attachment is `.txt`, `.xlsx` or missing
  — the missing case is a first-class state (`review_reason: missing_attachment`), not an
  error toast.

---

## 10. Documents and Audit trail views

- **Documents:** card grid over cases with pending attachments — filename, type chip,
  size, case link, preview button. `.xlsx` needs a table preview, not a download prompt.
- **Audit trail:** full timeline. Search, action-type filter, email filter, sort toggle,
  per-entry metadata expand, Export JSON. All of this exists in `AuditTrailPanel` today —
  restyle, move to a full page, keep every control.
- **Watch for:** Export JSON is the most likely thing a judge clicks — make sure the file
  name includes a timestamp and the payload is pretty-printed; the audit list needs
  virtualisation only past ~500 rows, so don't add it now (`ponytail:` plain map until a
  real log exists).

---

## 11. Search (`⌘K`)

- **Is:** one palette over emails, cases, fields and nav destinations. Grouped results,
  arrow keys, Enter navigates.
- **Build:** `<dialog>` + a client-side filter over the same `cases` array. No search
  library, no index, ~500 records.
- **Watch for:** `⌘K` must also be `Ctrl+K` and must not fire inside an input; the trigger
  in the topbar shows the shortcut hint (ref 3 does this and it's why people discover it);
  focus returns to the trigger on close.

---

## 12. Cross-cutting — the states people forget

- [ ] **Loading** — skeletons in card shapes, not a centred spinner. Never shift layout.
- [ ] **Empty** — every list and chart has copy that says what it means and what to do.
- [ ] **Error** — message + Retry, per-card, never a whole-page blank.
- [ ] **Zero data** — 0 emails must look intentional, not broken.
- [ ] **Long strings** — 90-char subjects, 60-char consignee names, addresses with
      newlines. Test with `email_001` (its subject is 78 chars) before calling anything done.
- [ ] **Demo-data chips** on every widget whose numbers aren't backend-backed.
- [ ] **1366×768** — the whole Overview above the fold except the queue table.
- [ ] **Print** — the report modal already uses `window.print()`; give it a print
      stylesheet, since a certificate that prints with a black sidebar wastes toner and
      looks amateur.
- [ ] **Keyboard pass** — tab the entire Overview and the entire review flow with the
      mouse unplugged. If anything is unreachable, it isn't finished.
- [ ] **Contrast pass** — every token pair in both themes.

---

## 13. Build order

1. Route split + tokens + theme + shell (0.0–0.4) — the merge lands first, because
   restyling components that are about to move is work done twice. `useAccount()` is part
   of this step even if OAuth isn't wired yet: it returns the sample-inbox identity until
   it doesn't, and nothing downstream has to change when the real thing lands.
2. `lib/metrics.ts` — the one selector. Every number on the Overview comes from here.
3. KPI row (§2) + greeting bar (§1) — the screenshot that carries the deck.
4. Queue table (§6) + alert bar (§7) — the actual job.
5. Charts (§3–§5).
6. Restyle the verification workspace (§9) — biggest surface, least new thinking.
7. Documents, audit, search (§10–§11).
8. §12 sweep.

Steps 1–4 are the demo. If the clock runs out, 5–7 can ship rough; 12 cannot be skipped.

---

## Settled

- ✅ **No KPI sparklines.** Second real number in the slot instead (§2). Comes back only if
  a per-email `received_at` lands.
- ✅ **One app.** `/` Overview, `/inbox` workspace, `/documents`, `/audit`,
  `/verification` → redirect (§0.0). One design language, one field type.
- ✅ **The switcher is real** — Google OAuth, swapping which Gmail account is being read.
  It lives in the topbar account chip (Gmail's own pattern), the sidebar keeps a mailbox
  status strip, and every number is account-scoped (§0.3).
- ✅ **Greeting name comes from the Google profile**, same hook as the account chip (§1).
- ✅ **One mailbox at a time.** No combined "all mailboxes" view. Every number on screen
  belongs to exactly one account, which is what makes rule 4 enforceable and what lets the
  KPI row stay four plain numbers with no per-account breakdown hiding inside them.

## Parked

**Does the demo video open on a real Google sign-in, or on the sample inbox?**
`Resource.md` §3b calls Gmail OAuth an *extra feature*, and the organizers' bundle may make
it unnecessary for scoring. **Parked — not a blocker.** Nothing in this file waits on it:
`/login` ships both paths side by side, `useAccount()` returns the sample-inbox identity
until OAuth is wired, and no widget downstream can tell the difference. Decide it when the
video gets storyboarded.

Everything else in this file is decided.
