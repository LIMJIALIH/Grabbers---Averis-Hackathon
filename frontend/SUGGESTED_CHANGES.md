# DocuVerify — UI audit and suggested changes

> Reviewed 20 Sep 2026 against branch `New_UI`, running locally on `:3100` with the
> FastAPI backend live on `:8000`. Read alongside
> [`DESIGN_STYLE.md`](./DESIGN_STYLE.md) (what it looks like) and
> [`NEW_UI_BUILD_CHECKLIST.md`](./NEW_UI_BUILD_CHECKLIST.md) (what was intended).
>
> **Verdict up front.** The visual system is genuinely good — one hue family, tokens
> for everything, real empty states, native `<dialog>`, contrast already nudged for AA,
> a character-level diff that shows real domain understanding. The problem is not
> taste. The problem is **shape**: the app is laid out as a *dashboard product* when
> the user's job is a *queue job*. Analytics sit where work should be, the queue exists
> twice in two different visual languages, and the one screen the operator actually
> lives on is the most cramped one. Everything below follows from that.

---

## Part 0 — The 10-second test

A separate model was given the running app and **nothing else** — no repo, no README, no
brief — and asked for its gut reaction to each screen inside 10 seconds. Its scores:

| Screen | "I could do my job with this without training" |
|---|---|
| `/login` | **5** / 10 |
| `/` Overview | **5** / 10 |
| `/inbox` | **6** / 10 — *"genuinely reasonable once you're in it"* |
| `/documents` | **3** / 10 — *"I could not tell you what job this screen does that the inbox doesn't already do better"* |
| `/audit` | unratable (empty state, and the empty state was praised) |

**Its #1 confusion, which this audit had missed entirely:**

> *"BL / SI / SDOC jargon is never defined anywhere in the UI, yet the entire product's
> reason for existing is stated in terms of it, starting from the very first sentence on
> the login screen."*

That is correct and it is serious. `/login` opens with *"Reads your shipping inbox,
checks every draft BL against its SI"* and *"520 emails from the SDOC bundle"* — three
undefined acronyms before the user has clicked anything. A hackathon judge is not a
shipping operator. **This is the cheapest high-value fix in the whole document** and it
is item 0 in Part 3.

Its other independent findings are folded into the sections below and tagged
**[clean-room]**. Two are worth pulling up here because they contradict assumptions the
build made:

- It read **"Continue with Google"** as the primary CTA and the working button as the
  fallback — position beat fill. The code makes the sample-inbox button `btn-primary`;
  it still lost, because it is below the fold-line of attention.
- It described the load as *"I initially assumed it was frozen."*

---

## Part 1 — Audit

### 1.1 Blockers — these break the demo, not just the design

| # | What | Where | Why it matters |
|---|---|---|---|
| **B1** | **First load blocks for 70 seconds.** `GET /api/v1/cases` measured at **70.2 s** for 520 cases (942 KB). The app shows a skeleton the whole time, captioned *"…it can take a moment."* | `lib/app-state.tsx:47-56`, `app/page.tsx:15-23` | 70 s is 21% of a 5 m 29 s demo video spent on a shimmer. And the copy under-promises by an order of magnitude. |
| **B2** | **No timeout on that fetch.** `fetchCases()` only has `.catch`. If the backend hangs instead of erroring, `load` stays `"loading"` forever and the offline sample **never** engages. | `lib/app-state.tsx:47-56` | The offline fallback — the thing built specifically so the demo survives — only fires on a fast failure, not on the failure mode that actually happens. |
| **B3** | **"Print report" prints a blank page.** `@media print` sets `[data-chrome] { display: none !important }`. The report `<dialog>` is a descendant of that div, so it is removed from the box tree along with the chrome. | `app/globals.css` (print block), `components/shell/Shell.tsx:89`, `CasePane.tsx` `ReportModal` | The only artefact the operator can hand to anyone is the printed report. |
| **B4** | **The app cannot express `wrong_doc_type`.** The bundle README requires all four `review_reason` values. `derive()` emits only three — `missing_attachment`, `unreadable`, `missing_value`. | `lib/cases.ts` `derive()`; dead entries in `widgets.tsx:REASON_WORDS` and `CasePane` reason map | A required output value has no code path and no UI. Scored gap, not cosmetic. |
| **B5** | **`straight-through` counts spam as success.** `derive()` assigns `status: "OK"` to every non-`BL_COMPARISON` email, then `straightThrough = ok / total`. 394 of the 520 bundle emails have **zero attachments**, so the headline "% straight-through" is mostly *emails we never looked at*. | `lib/cases.ts` `derive()` + `summarise()`; `KpiRow` card 4 | The one number that proves the product works is inflated by the emails it doesn't process. A judge who asks "straight-through of what?" wins. |
| **B6** | **The work badge under-counts the work.** Sidebar badge and the bell both use `NEEDS_REVIEW` only. `summary.open` (= `NEEDS_REVIEW` + unresolved `MISMATCH`) is computed and **never rendered anywhere**. | `Shell.tsx:159` and `Bell_()`; `cases.ts:summarise` | The operator's actual queue depth is never shown. The number they navigate by is wrong. |
| **B7** | **Drill-down from the donut loses the filter.** Donut → `/?category=X#queue` filters the Overview's 5-row preview. Its footer link is a bare `/inbox` — the category is dropped. | `widgets.tsx` `CategoryDonut.open`, `app/page.tsx:35` | The primary analytics→work gesture dead-ends. |
| **B8** | **The queue is keyboard-unreachable.** Rows are `<tr onClick>` with no `tabIndex` or key handler; the inner `<a>` is `preventDefault`ed, so it looks like a link and isn't one. | `QueueTable.tsx:129-131` | An operator who clears 200 emails a shift works from the keyboard. Also an a11y failure on the main table. |
| **B9** | **A raw HTTP status code is shown to the user.** Measured live: under concurrent load the backend 500s after **26 s**, and the app renders *"Showing the offline sample inbox. **Backend answered 500**."* across the top of every page. **[clean-room]** ranked this its #3 confusion. | `lib/app-state.tsx` `catch` → `ErrorNote` in `page.tsx` / `inbox/page.tsx` | Two distinct failure modes both look bad: 70 s to succeed, or 26 s to show a stack-trace fragment. The banner sits above the demo for its entire runtime. |
| **B10** | **No progress indication during the 70 s load.** One static sentence, no spinner, no count, no bar. **[clean-room]**: *"I initially assumed it was frozen."* | `app/page.tsx:15-23` | The skeleton shimmers but the *message* never changes, so nothing signals liveness. |

### 1.2 Flow problems — the "scattered" complaint, specifically

**F1 — The queue exists twice, in two different visual languages.**
`/` renders `<QueueTable limit={5}>` — a table. `/inbox` renders a 360 px card rail —
a list. Same objects, same sort, two layouts, two sets of hit targets, two things to
learn. The build checklist merged two apps to kill exactly this kind of duplication;
it survived inside the merged app.

**F2 — Two neighbouring widgets send the same gesture to two different places.**
`CategoryDonut` → `/?category=…#queue` (stay here, filter the preview).
`DefectBars` → `/inbox?field=…` (leave, filter the real queue).
They sit in the same column. There is no way for a user to form a rule.

**F3 — Analytics occupy the operator's landing page; work is one click away.**
Reading order on `/` is: greeting → segmented bar → alert bar → 4 KPI cards → trend
chart → donut → *then* five rows of actual work. At 1366×768 the first actionable
row is below the fold. The person who opens this app 5 days a week to clear a queue
has to scroll past a chart to reach their job.

**F4 — The same three numbers are printed three times before any work appears.**
`Greeting` shows Processed / Need you / Auto-cleared. `AlertBar` restates *Need you*
with the same reason string. `KpiRow` restates all three again (`Emails processed`,
`Needs your review` — identical `reasons` string, third time — and `Auto-cleared`
as the sub-line of `Straight-through`). Three widgets, ~420 px of vertical space,
zero new information.

**F5 — `Documents` is a nav item with no job.**
It is a flat grid of every attachment in the mailbox, searchable by filename, and its
only outbound action is **"Open case"** — i.e. it exists to send you back to `/inbox`.
`Resource.md` §3b specified it as *"attachments of emails whose status is still
pending"*; it is not filtered to pending at all. An SDOC operator never browses
attachments; they open a case and look at its SI and BL. The one real use — *find the
case by filename* — is already a `⌘K` query.

**F6 — The case screen buries the decision under restated numbers.**
Order inside `CasePane`: header card → **4 stat tiles** (`Fields matched 6/7`,
`Defects 1`, `Lowest confidence 62`, `Category BL comparison`) → maybe an alert →
tabs → sticky actions. Every one of those four tiles restates something the table
directly below it already shows, and the operator must pass all of them to reach
the answer to their only question: *what's wrong, and do I approve?*

**F7 — Evidence and comparison are mutually exclusive.**
`SI vs BL comparison` and `Side-by-side documents` are **tabs**. Human-in-the-loop
means checking the machine's claim against the source. Putting the claim and the
source in two tabs means the operator cannot do the one thing the screen is for
without toggling and holding values in their head.

**F8 — Three controls, three labels, one behaviour.**
Sidebar `Pipeline ▸ Run pipeline`, sidebar mailbox `Sync now`, and account menu
`Sync now` all call the identical `reload()`. "Run pipeline" implies triggering
classification and extraction. It refetches.

**F9 — The audit trail records navigation as if it were work.**
`OPEN_EMAIL` fires from a `useEffect` on every `CasePane` mount, and `/inbox`
auto-selects `rows[0]`, so *merely arriving on the page* writes an audit entry.
`REVIEW_COMPARISON` fires on a tab click. `GENERATE_REPORT` fires when the modal
*opens*, before anything is generated. Arrow through 20 cases and the trail is 20
lines of noise around the 1 line that mattered.

**F10 — The audit trail has a user-facing Clear button.**
`Trash2 ▸ Clear`, plus *"Not persisted."* A trail the operator can wipe is not an
audit trail — and the audit trail is the reason a client like Averis signs.

### 1.3 Vocabulary — one concept, many names

The single worst source of confusion, because the operator cannot build a model.

| Concept | Names it goes by on screen |
|---|---|
| A case that passed | `Verified` (filter, pill) · `Cleared` (pill, non-BL) · `Auto-cleared` (Greeting) · `Straight-through` (KPI) · `OK` (code/report) |
| A case with a field difference | `Defect` (pill, filter) · `Defects open` (Greeting) · `Defects caught` (KPI) · `MISMATCH` (code, report `state` column) |
| Needing a human | `Needs review` (pill) · `Needs your review` (KPI) · `Need you` (Greeting tile) · `needs a human` (alert bar) **[clean-room]** |
| Sending it to a human | `Escalate` (button) · `Request human review` (audit label) · `Send to review` (modal submit) |
| The list of work | `Verification inbox` (nav, `/inbox` heading) · `Verification queue` (Overview section heading) **[clean-room]** |
| **The thing itself** | **`Email`** (everywhere: `email_005`, "8 emails") · **`Case`** (`Open case` button, `?case=email_002`) **[clean-room]** |
| The comparison itself | `BL comparison` (category pill) · `SI vs BL comparison` (tab) · `Verification` (route, report) |

The `Email` / `Case` split is the worst of these, because it is not just a synonym — it
raises a data-model question the UI never answers. **[clean-room]**: *"unclear if a
'case' could ever differ from an 'email' — could one email have multiple cases?"*

Also: the `Report` modal's `Result` column prints the raw internal state strings
(`match`, `defect`, `missing`, `corrected`) into a document meant for a human.

And a plain grammar bug: `Greeting` renders `` `${s.needsOpen} need you.` `` → **"1 need
you."** **[clean-room]** flagged it unprompted.

### 1.4 Honesty labels — right instinct, four different executions

`DESIGN_STYLE.md` §1.3 is emphatic: *never assert what the model guessed.* The
implementation says so four different ways, in four voices, and misses the biggest case:

- `TrendChart` → a `Demo data` chip.
- `ActivityFeed` → *"Session only — not yet persisted"*.
- `/audit` → *"Not persisted."*
- `CasePane` non-BL → *"Category is provisional until the classifier is connected."*
- **`CategoryDonut` → nothing.** Yet `categorise()` in `lib/cases.ts` is a **client-side
  regex**, not the classifier. Over the real bundle it assigns **208 of 520 (40%)** to
  `INVOICE_QUERY` on the keywords `invoice|payment|remittance|…`. The app's most
  prominent "our AI read your inbox" visual is regex output, presented as fact, on the
  one card with no caveat.

### 1.5 Domain logic that will not survive a question

- **`matches()` hard-codes one port alias.**
  ```ts
  (f.key === "port_of_loading" && f.si === "MYTPP" && norm(f.bl) === "tanjung pelepas")
  ```
  The bundle README calls out alias handling as *the* comparison problem
  (`Port of Loading` vs `Load Port`, code vs name). One literal string pair is standing
  in for it, inside the function the whole product depends on. This is the single most
  "vibe-coded"-looking line in the repo and it is in the core.
- **`classified: total`** → the KPI sub-line reads *"520 of 520 classified"*, always,
  by construction. A tautology dressed as a metric.
- **`Confidence` is the *minimum* field confidence**, labelled just `Confidence`.
  Confidence in what is never stated.
- **`Confidence` is `hidden md:table-cell`.** The single "should I trust this" signal
  disappears on a narrow window.
- **`TrendChart` assigns days by array index** (`buckets[i % cols]`). Correctly chipped
  as demo data — but it is the largest element on the landing page. The most
  eye-catching thing in the app is the most fabricated thing in the app.

### 1.6 Layout and density

- **The comparison table horizontally scrolls on the primary work screen — measured.**
  Constraining the content box to a 1366 px viewport's width and reading the DOM:

  ```
  case pane clientWidth        690 px
  table computed min-width     720 px
  scroll container             clientWidth 689 · scrollWidth 720
  → 31 px hidden behind an unsignalled horizontal scrollbar
  ```

  The 7-field comparison — the product — scrolls sideways inside its card on the most
  common office laptop. **[clean-room]** hit the same class of problem on the Overview
  queue table: *"598 px of content in a 300 px cell… its own internal horizontal
  scrollbar, which is not visually signalled."*
- **The queue rail shows ~4 cards.** `max-h-[calc(100dvh-320px)]` at 768 px tall
  leaves ≈ 448 px of list. Four cases visible out of 126 real ones.
- **Breakpoints are viewport-based, not container-based.** `xl:` (1280) fires on the
  viewport while the content box is 1118 px, so at 1366 the Overview splits 2-up into
  ~530 px columns and `TrendChart` has to fit a fixed `w-44` legend plus 14 columns in
  ~330 px.
- **Two orange blocks stack.** `AlertBar` (orange border + tint) sits directly above
  `KpiRow`'s solid `bg-review` card. §2.2 says orange *"never competes"* — here it
  competes with itself, and "exactly one unmissable thing" becomes two.
- **`SPAM` category pill looks broken.** `CategoryPill` uses `CATEGORY_SHADE` as its
  border; `SPAM` is `--b-100` `#ebd2d7`, a near-white pink on white. The pill reads as
  a rendering bug.
- **`ink-3` on `surface-2` is 4.05:1 — fails AA.** Used for the sidebar
  *"Synced 2m ago"* and for the `DemoChip` at 11 px. Both are honesty labels, i.e. the
  text the design doc says matters most, and both are the least legible text in the app.
- **Three truncation lengths for one string.** `midTruncate(email, 24)` in the sidebar,
  `22` in the account chip, `28` in the account menu — the same address elides at three
  different points depending on where you look.

### 1.6b Things only a first-time user sees — all **[clean-room]**

- **The segmented progress bar has no legend, and one of its segments is unnamed.**
  The bar reads `63% / 25% / 13%`; the three tiles beside it read `PROCESSED 8`,
  `NEED YOU 1`, `AUTO-CLEARED 5`. They do not correspond: one tile is a raw count, and
  the **25% segment — defects — has no matching label anywhere near the chart**. The
  fourth segment (`Resolved by you`) only appears once you have resolved something.
  Verbatim: *"the middle 25% segment has literally no matching label anywhere nearby."*
- **`Report` and `Escalate` sit side by side and sound identical.** *"Both sound like
  'flag this to someone'."*
- **`Correct` is ambiguous.** *"Does it auto-correct the BL value to match the SI, or
  let you type a correction?"* It opens a dialog — but nothing on the button says so,
  and the tester declined to click it for fear of an irreversible change.
- **The case pane opens on the least useful case.** `/inbox` auto-selects `rows[0]`,
  which sorts `NEEDS_REVIEW` first — i.e. the app's first impression of its own core
  feature is a case whose documents *could not be read*, with an empty comparison.
- **Confidence has no unit and no scale.** *"Bare numbers like 71 / 64 / 96"*, and
  *"'Below 85: could be wrong' introduces a threshold never explained — why 85, out of
  what range?"*
- **`Documents`: the cards have dead space that looks interactive.** Only the two small
  buttons are clickable; the card body is not.
- **`Documents`: the `Text` type badge is information-free** — every file in the bundle
  is `.txt`, so the badge never contrasts with anything.
- **`Documents` shows no defect signal at all** — ten identical cards, no way to tell
  which document belongs to a failing case.
- **`/audit`'s "Not persisted" raises the wrong question.** *"If nothing is saved, what
  is this screen for in real use?"* The honesty is right; the framing makes the app's
  compliance story sound optional.
- **Deep links feel broken.** Every direct URL load re-runs the full fetch, so opening
  `/inbox?case=…` from outside the app costs the whole wait again. The demo video's
  deep link is the slowest path in the product.

### 1.7 Smaller things, worth a line each

- `<h1>` on `/` is **"Hello, Shipping Docs"** — the page's top-level heading is a
  greeting, and the name is derived from the *mailbox* local part, so the app greets the
  operator by the inbox's name. **[clean-room]**: *"feels like a template bug."*
- `/login` leads with a primary-looking **"Continue with Google"** that does nothing but
  print a disclaimer, then two more caveats, before the button that works. The first
  screen a judge sees front-loads what isn't built.
- **Nothing in the app shows the scored submission object.** `sample_submission.json` is
  `{category, status, review_reason, defect_fields, has_defect}` per email — the thing
  the hackathon grades. `/audit` exports the *audit trail*; the report modal prints a
  table. The deliverable itself is invisible.
- The same `<pre>` document viewer is written out **three times** (Documents modal,
  CasePane doc modal, CasePane documents tab).
- `lib/auditTrailStore.ts` is in a different dialect from the rest of the codebase
  (single quotes, verbose JSDoc, `NO localStorage, NO database` banner) — visibly
  inherited, not written to the current standard.
- `CasePane` documents tab does `attachments.slice(0, 2)`. Safe for this bundle (max 2)
  but silently drops the rest once real Gmail lands.
- `relTime` tops out at hours, so a stale sync reads *"Synced 27h ago"*.
- `AlertBar` and `KpiRow` build the identical `reasons` string from the identical
  `REASON_WORDS` map, inline, twice.

---

## Part 2 — How it should be arranged

### 2.1 The principle

The operator's shift has exactly one shape:

> **How much is mine? → work one case → decide → prove it later.**

So the app should be one vertical spine — **Queue → Case → Proof** — with analytics
*beside* it for the team lead, never *in front of* it for the operator. Right now
analytics are in front, the queue is duplicated, and a file browser sits in the middle
of the path.

### 2.2 Navigation: 4 items → 3, and the order inverts

| Now | Proposed | Why |
|---|---|---|
| `Overview` (`/`) | **`Queue`** (`/`) — the work surface, no charts | The operator lands on work. This is the whole change. |
| `Verification inbox` (`/inbox`) | *merged into* `Queue`; the case gets its own route `/case/[id]` | Kills the duplicate queue (F1). A case deserves a URL. |
| `Documents` (`/documents`) | **deleted as a nav item** → a `?doc=` filter on the Queue + a `⌘K` scope | It had no job (F5). |
| `Audit trail` (`/audit`) | **`Audit`** (`/audit`) — unchanged position, append-only | It is the compliance artefact. |
| — | **`Insights`** (`/insights`) — trend, mix, field defect rate, throughput | The team lead's screen. Out of the operator's path. |

Result: **Queue · Insights · Audit**. Charts still exist, still demo well, and are
*better* for having a page to themselves. They just stop standing between the operator
and their queue.

### 2.3 `/` — Queue, top to bottom

```
┌────────────────────────────────────────────────────────────────────────┐
│ 126 to verify   ·   18 need you   ·   7 defects open   ·   101 cleared │  ← ONE row.
│                                          synced 2m ago  ⟳              │    Each count
├────────────────────────────────────────────────────────────────────────┤    is a filter
│ [search…]  [category ▾]  [status ▾]  [× field: port_of_loading]        │    chip.
├────────────────────────────────────────────────────────────────────────┤
│ ID        Subject              Sender      Category   Status   Conf ▾  │
│ email_014 MV KOTA … draft BL   maersk.com  BL comp.   ▲ Defect   62 ▁▁ │  ← the work.
│ …                                                                      │    Starts
└────────────────────────────────────────────────────────────────────────┘    ~150px down.
```

1. **One status row, 48 px.** Every count is a filter chip. This replaces `Greeting`,
   `AlertBar` *and* `KpiRow` — three widgets, one row, and it fixes F4 by construction:
   a number can only appear once if there is only one place for numbers.
2. **Filters.** Keep exactly as built; they already live in the URL, which is right.
3. **The list, as a table** — one presentation, not two (F1). Sorted `NEEDS_REVIEW` →
   `MISMATCH` → `OK`, as it already is. `Confidence` always visible, never `hidden`.
4. **Nothing else.** No chart on this page.

### 2.4 `/case/[id]` — the case, top to bottom

Its own route, deep-linkable, `J`/`K` to move through the filtered queue without
returning to the list.

```
┌──────────────────────────────────────────────────────────────┬─────────────┐
│ email_014 · MV KOTA NAGA · ops@maersk.com · BL comparison     │  DECIDE     │
├──────────────────────────────────────────────────────────────┤             │
│ ▲ BL differs from SI on port of loading and container count.  │ 2 fields    │  ← rail is
│                                                              │ block this. │    pinned,
├────────────────────┬──────────────┬──────────────┬───────────┤ ─────────── │    always
│ Field              │ SI (truth)   │ BL (draft)   │ Conf      │ [Approve]   │    visible.
│ ▲ Port of loading  │ MYTPP        │ MYT͟P͟T͟       │  62 ▁▁▁▁  │ [Escalate]  │
│ ● Shipper          │ APRIL ASIA   │ APRIL ASIA   │  98 ▇▇▇▇  │ ─────────── │
│ …                  │              │              │           │ Submission  │
├────────────────────┴──────────────┴──────────────┴───────────┤ {category…} │
│  SI source  (email_014_SI.txt)  │  BL source (email_014_BL)  │             │  ← evidence,
│  Port of Loading: MYTPP         │  Load Port: MYTPT          │             │    not a tab
└─────────────────────────────────┴────────────────────────────┴─────────────┘
```

1. **Identity strip** — one line. Not a card with a collapsed email body inside it.
2. **The verdict, in a sentence, first.** *"BL differs from SI on port of loading and
   container count."* / *"An attachment is missing."* This is the answer to the
   operator's only question and today it is below four stat tiles (F6). **Delete the
   four tiles** — every one of them restates the table.
3. **The 7-field table**, defect rows first, character-diff on the BL value.
4. **Evidence, side by side, on the same screen** — not behind a tab (F7).
5. **Decision rail, pinned right.** Approve / Escalate, the blocker count linked to the
   rows that cause it, and the live submission object underneath.

### 2.5 `/insights` — the team-lead screen, top to bottom

Ordered by *what a decision gets made from*, not by what looks good:

1. **Straight-through rate**, correctly scoped: `OK / BL_COMPARISON`, not `OK / total`
   (fixes B5). This is the number that proves the product pays for itself.
2. **Field defect rate** — which of the 7 fields fails most. The only chart here that
   changes what anyone *does* (it tells ops what to fix upstream with the carrier).
3. **Category mix** — with an honest provenance chip (§1.4).
4. **Trend — last, or not at all until `received_at` exists.** It is the biggest and
   least real thing in the app; it does not belong at the top of anything.

### 2.6 `/audit` — unchanged shape, three fixes

Keep the layout; it is the best-behaved page in the app. Remove `Clear`, stop logging
navigation (F9/F10), add per-case filtering and CSV next to JSON — CSV is what an
auditor asks for.

---

## Part 3 — Exact changes

Ordered by ratio of *demo impact* to *hours*. Everything in P0 is a same-day change.

### P0 — do these first

| # | Change | How |
|---|---|---|
| **0** | **Define SI, BL and SDOC on first contact.** The highest value-per-hour change in this document. | `/login` subtitle → *"Reads your shipping inbox and checks every draft **Bill of Lading (BL)** against the **Shipping Instruction (SI)** it came from."* Add a one-line definition under the case-pane verdict: *"The SI is the shipper's request. The carrier drafts the BL from it — so the BL must match the SI."* Add `title=` on every `SI`/`BL` abbreviation via an `<abbr>`. Drop "SDOC bundle" from user copy; say *"520 sample emails."* Fixes the **[clean-room]** #1 confusion. |
| 1 | **Delete `Greeting` + `AlertBar` + `KpiRow`; ship one 48 px status row.** | New `QueueStatusRow` reading the same `summary`. Four counts, each a `<button>` that calls `qs.set({status})`. Delete `widgets.tsx` §1/§2/§7 — which also deletes the unlabelled segmented bar (§1.6b) and the "1 need you" grammar bug. Fixes F3, F4, and the double-orange (§1.6). |
| 2 | **Make `/` the queue.** | Move `QueueTable` (unlimited) to `/`, drop `limit`/`footer`. `/inbox` → `redirect('/')`, same pattern as the existing `/verification` redirect. Fixes F1, B7. |
| 3 | **Give the case a route.** | `app/case/[id]/page.tsx` renders `CasePane` full width. `/inbox?case=X` → redirect. Add `J`/`K` over the current filtered+sorted row list. Fixes F1, F7 crowding, B8 partially. |
| 4 | **Fix `straightThrough`.** | `const bl = cases.filter(c => c.category === "BL_COMPARISON")` → `straightThrough = bl.length ? round(blOk/bl.length*100) : 0`. Sub-line: *"of 126 BL comparisons"*. Fixes **B5**. |
| 5 | **Show real queue depth.** | Sidebar badge and `Bell_` use `summary.open`, not `needsOpen`. Fixes **B6**. |
| 6 | **Cap the fetch, shorten the wait, and show progress.** | `AbortSignal.timeout(20_000)` in `fetchCases`; on abort, fall back to `SAMPLE_CASES` exactly as the `catch` already does. Caption becomes *"Reading 520 emails and extracting every attachment — about a minute on first load,"* with an elapsed counter so it visibly ticks. Fixes **B1 copy, B2, B10**. |
| 6b | **Never print a status code at the user.** | `ErrorNote` message → *"Couldn't reach the mailbox service — showing the 520-email sample inbox instead."* Keep `Backend answered 500` in `console.error` only. Fixes **B9**. |
| 7 | **Un-break print.** | Change the print rule from `[data-chrome]{display:none}` to hiding `[data-chrome] > *:not(dialog)` plus `.no-print`, or portal the report `<dialog>` to `<body>`. Verify by printing to PDF. Fixes **B3**. |
| 8 | **Make the queue keyboard-operable.** | Row gets `tabIndex={0}` + `onKeyDown` Enter/Space; drop the fake `<a>`. Fixes **B8**. |
| 9 | **Label the donut's provenance.** | Reuse `DemoChip` with the text `Rule-based` and the title *"Keyword rules, not the classifier — 40% land in Invoice query."* Fixes §1.4's gap. |
| 10 | **One name per concept.** | Pick `Verified` / `Defect` / `Needs review` / `Escalate` and use those four words everywhere, including `ACTION_DEFAULT_LABELS` and the report's `Result` column (map `match→Verified`, never print `match`). **Pick `Email` or `Case` and delete the other** — including the `?case=` param. Fixes §1.3. |
| 10b | **Disambiguate the three case actions.** | `Correct` → `Correct…` (ellipsis = opens a dialog). `Report` → `Export record` and move it out of the decision group. `Escalate` keeps the only red-adjacent treatment. Fixes §1.6b. |
| 10c | **Land on the most useful case, not the first.** | Auto-select the first case the operator can actually *act* on (`MISMATCH` with a populated comparison) rather than `rows[0]`; fall back to `rows[0]` when there is none. Fixes §1.6b. |

### P1 — the reorganisation

| # | Change | How |
|---|---|---|
| 11 | **Create `/insights`.** | Move `TrendChart`, `CategoryDonut`, `DefectBars` there in the §2.5 order. Nav becomes Queue · Insights · Audit. |
| 12 | **Delete `/documents`.** | Add a `⌘K` scope over attachment filenames → `/case/[id]`, and a queue filter for unreadable/missing attachments. Delete `app/documents/page.tsx`. Fixes F5. |
| 13 | **Rebuild the case pane in §2.4 order.** | Delete the 4 stat tiles. Promote the verdict sentence to the top. Replace the `Tabs` with a two-row layout: comparison above, evidence below, both always visible. Fixes F6, F7. |
| 14 | **Attach the blocker to its rows.** | Footer reads *"2 fields block approval"* as a button that scrolls to the first blocking row; each blocking row carries the same marker. Fixes §1.1 note on the disabled CTA. |
| 15 | **Stop logging navigation.** | Delete the `OPEN_EMAIL` `useEffect` and the `REVIEW_COMPARISON` tab handler. Move `GENERATE_REPORT` to the print action. Fixes F9. |
| 16 | **Make the trail append-only.** | Remove `clearAuditTrail` from the UI (keep the function for tests). Add CSV export. Fixes F10. |
| 17 | **One sync control.** | Keep the mailbox `⟳`. Delete sidebar `Pipeline ▸ Run pipeline` and the account-menu `Sync now`, or make `Run pipeline` actually `POST /api/v1/ingestion`. Fixes F8. |
| 18 | **Implement `wrong_doc_type`.** | In `derive()`: if both attachments are present and readable but neither parses as SI/BL (no field labels found), return `review("wrong_doc_type")`. Fixes **B4**. |

### P2 — polish

| # | Change | How |
|---|---|---|
| 19 | **Fix the 1366 overflow.** | Comparison table `min-w-[720px]` → `min-w-0` with `Field` sticky and a two-line cell at narrow widths. Verify at 1366×768. |
| 20 | **Container queries.** | `@container` on the main content box; swap `xl:` → `@xl:` so columns respond to the box, not the viewport. |
| 21 | **Fix AA on honesty text.** | `ink-3` on `surface-2` is 4.05:1. Add `--ink-3-on-2: #6b625d` (≈4.6:1) and use it for sync status + `DemoChip`. |
| 22 | **Fix the `SPAM` pill.** | `CategoryPill` border uses `--line-strong` with the shade only in the dot, or give `SPAM` a dedicated `--b-100-edge`. |
| 23 | **One truncation length.** | `midTruncate(email)` — drop the three call-site overrides. |
| 24 | **Page heading, not a greeting.** | `<h1>Queue</h1>`; the greeting becomes secondary text or goes. Never greet by the mailbox name. |
| 25 | **Lead `/login` with the button that works.** | Sample inbox first and primary; Google second, `disabled`, with one caption. Move the "unverified app" note behind the Google button, not above the fold. |
| 26 | **One document viewer.** | Extract the `<pre>` viewer used in 3 places into `<DocumentText a={att} />`. |
| 27 | **Kill dead metrics.** | Delete `classified` (always `total`). Label `Confidence` as `Lowest field conf.`. |
| 28 | **Rewrite `auditTrailStore.ts` in house style.** | Double quotes, drop the JSDoc essays and the `NO localStorage` banner. |
| 29 | **`relTime` past 24 h.** | Add a days branch. |
| 30 | **Hoist `REASON_WORDS`** into `lib/cases.ts` — it is built inline twice. |

---

## Part 4 — The five intentional features

Each is a claim about **how shipping documentation actually works**, visible in the UI,
and cheap. These are the five to name out loud in the demo video.

### 1. The SI is the source of truth, and the layout is asymmetric about it

Not "two values, pick one". The **SI column is fixed and never marked**; the **BL column
is the only one that gets diffed**; every defect sentence reads *"BL differs from SI on
X"*; and the correction dialog pre-fills the **SI** value. A symmetric diff would be
easier to build and would be wrong.

**Why:** the shipper issues the SI; the carrier drafts the BL *from* it. The BL must
trace back to the SI — never the reverse. A symmetric "these two disagree" view invites
the operator to correct the SI, which is the one edit they must never make.

*Status: `matches()` and the diff already do this; the layout does not yet show it.*

### 2. Confidence is never shown without the threshold it is judged against

Every confidence value renders with the **85 gate drawn on it** — as a tick on the bar,
not as prose — labelled once per screen as *"extraction confidence, 0–100; under 85 goes
to a human."* A value below the gate never renders as a plain number. The constant lives
in one place (`HITL_THRESHOLD`) and the UI reads it, so the gate can move without a UI
change.

*The clean-room tester asked exactly the right question of the current build — "why 85,
out of what range?" — and could not answer it from the screen. The number is only
meaningful next to its threshold.*

**Why:** the entire product promise is *"we escalate what we are not sure about."* A bare
`62` asserts a fact. `62`, visibly under the line, is an admission — and the admission is
what earns the operator's trust. Hiding uncertainty is the one way to lose a
human-in-the-loop user permanently.

*Status: partially built (`Confidence`, `Below 85: could be wrong`). Make it universal
and draw the gate.*

### 3. Character-level diff, because the defect is one character

One wrong digit in `MEDUUD104S32`. `MYTPP` vs `MYTPT`. `24000` vs `2400`. Row-level
"mismatch" tells the operator nothing they can act on; they still have to scan two
strings by eye, which is exactly the manual work the product exists to remove. So the
**differing characters are marked in the BL value**, and the field-level alias problem
is handled by a real **normalisation layer** — unit conversion, port code ↔ port name,
party-name fuzzy match — not by the one hard-coded `MYTPP`/`Tanjung Pelepas` pair that
stands in for it today.

**Why:** in this industry the defect classes *are* single-character: container numbers,
weights, and UN/LOCODE port codes. The bundle README says it outright — *align by
meaning, not by header text.* An app that shows a red row is a spreadsheet. An app that
shows the wrong character is a tool.

*Status: `diffSpan` exists and is good. The normalisation layer is one hard-coded pair —
this is the highest-value single fix in the repo.*

### 4. Approval is blocked by construction, and the blocker is attached to its cause

`Approve & submit` is unreachable while any field is unresolved. But the reason is not a
grey sentence in a footer — the footer says **"2 fields block approval"** as a control
that scrolls to the first blocking row, and each blocking row carries the same marker.
The operator can always answer *"why can't I approve?"* in one click.

**Why:** an approval on a shipping document is a near-legal act — it is what gets
submitted downstream and what an auditor later asks about. It must be impossible to
approve past an unresolved field, and it must be impossible to wonder why. Today the
gate is right and the explanation is 13 px of grey text 600 px away from the cause.

*Status: the gate (`why`) is built. The link to the cause is not.*

### 5. The audit trail is append-only and the operator cannot touch it

No `Clear` button. Navigation is not logged — only the four acts that change an outcome
(correct, approve, escalate, submit). Every correction carries a mandatory **reason**,
and every entry records **who, when, from → to**. Export as CSV as well as JSON.

**Why:** the audit trail is not a debug log for the operator; it is the deliverable for
the client's compliance team, and it is the reason a company like Averis signs a
documentation-services contract. A trail the operator can wipe is worth zero, and a trail
padded with `OPEN_EMAIL` on every arrow-key press is worth nearly zero — the one line
that mattered is buried in twenty that didn't.

**Why CSV:** auditors ask for CSV. Nobody has ever asked for JSON.

*Status: the recorder, the mandatory reason and the JSON export are built. The
append-only guarantee and the signal-to-noise are not.*

---

## Appendix A — what was measured, and how

Nothing in this document is a matter of taste except the choice to put the queue first,
and that one follows from the user `DESIGN_STYLE.md` §1 already commits to: *"Clears
60–200 emails a shift, 8h on one screen."* Everything else is either a number taken on
this machine or a line in a named file.

| Claim | Method | Result |
|---|---|---|
| B1 — first load | timed `GET /api/v1/cases` | **70.2 s**, 942 KB, 520 cases, `fields[]` populated (7) |
| B9 — 500 under load | live app, concurrent requests | failed after **26 s**; banner read *"Backend answered 500"* |
| B5 — spam counted as cleared | parsed `sdoc-hackathon-bundle/inbox/*.json` | **394 of 520** emails have **0 attachments** → all `status: OK` |
| §1.4 — donut is regex output | re-ran `categorise()` over the bundle | **208 / 520 (40%)** → `INVOICE_QUERY` |
| §1.6 — comparison overflows | DOM read, content box constrained to 1366 px | pane **690 px** vs table `min-width` **720 px** → **31 px** hidden |
| B3 — blank print | DOM containment + resolved `@media print` rules | report `<dialog>` **is** a descendant of `[data-chrome]`, which print sets `display:none !important` |
| §1.6 — AA failure | WCAG contrast, `--ink-3` `#7c736e` on `--surface-2` `#f3efec` | **4.05 : 1** (needs 4.5) |

Two things this pass could **not** verify and someone should:

1. **A genuine 1366×768 window.** Neither the clean-room tester's nor this session's
   `resize_window` actually changed the rendered viewport (`innerWidth` stayed 1707 and
   2560 respectively). The 690/720 overflow above was proven by constraining the content
   box — which is faithful, because the `lg:` breakpoints that build that layout fire
   identically at both widths — but a real 1366×768 window may surface more.
2. **The blank print**, end to end. The containment is proven and the CSS rule is
   proven; print it to PDF once to close it out.

## Appendix B — the 5 features, one line each, for the video

1. **The SI is the source of truth and the layout is asymmetric about it** — only the BL
   gets marked, and corrections pre-fill the SI.
2. **Confidence always shows the 85 gate it is judged against** — the model's doubt is
   visible, never rounded away.
3. **Character-level diff** — `MYTPP` vs `MYTP̲T̲`, because in this industry the defect
   *is* one character.
4. **Approval is blocked by construction, and the blocker links to its cause.**
5. **Append-only audit trail** — no Clear button, navigation not logged, CSV export.
