# DocuVerify — Design Style

> **Three files, three questions.**
> | File | Answers | Written against |
> |---|---|---|
> | **this file** | *What does it look like?* | tokens and rules |
> | [`NEW_UI_BUILD_CHECKLIST.md`](./NEW_UI_BUILD_CHECKLIST.md) | *What gets built, and how?* | the **new** design |
> | [`NEW_UI_CHECKLIST.md`](./NEW_UI_CHECKLIST.md) | *What must not be lost?* | the code that exists **today** |

The single source of truth for the `New_UI` redesign. Everything built after this file
should be traceable to a token or a rule below. If something here fights the product,
change this file first — not the component.

- **Product:** DocuVerify — classifies a shipping-operations inbox, extracts 7 fields from
  the SI and the draft BL, compares them, and escalates the uncertain ones to a human.
- **Sponsor:** Averis (Global Business Services, Kuala Lumpur — their *Shipping
  Documentation Services* line is literally this product's user).
- **Decided:** light-first theme, logo top-right, orange = status only. Log in §9.

---

## 1. Who this is for

| | |
|---|---|
| **Primary user** | SDOC operator. Clears 60–200 emails a shift, 8h on one screen, usually a 1366×768 or 1920×1080 office laptop. Not a designer. Not a data scientist. |
| **Their job** | *"Which of these actually need me, and what exactly is wrong with them?"* |
| **Secondary user** | Ops team lead — throughput, defect rate, who approved what. |
| **Third user (this week)** | **A hackathon judge, in a 5m29s video.** The dashboard must read at 720p in 8 seconds. |

Three consequences, non-negotiable:

1. **Density over decoration.** A shift's work fits without hunting. No widget exists
   unless it changes what the operator does next.
2. **One unmissable colour.** `NEEDS_REVIEW` is the only thing that costs money when
   missed. Exactly one hue carries it (orange), and nothing else may use that hue.
3. **Never assert what the model guessed.** Confidence, source span and an "it could be
   wrong" affordance travel with every extracted value. This is a human-in-the-loop
   product; hiding uncertainty is the one way to lose the user permanently.

---

## 2. Colour

### 2.1 Foundation (the palette you gave)

| Role | Hex | Notes |
|---|---|---|
| Black | `#000000` | Display headings and logo; buttons use `#0A0A0A` (softer on paper, same read) |
| Burgundy | `#6D001A` | Brand. Active nav, chart ramp, defect state |
| White | `#FFFFFF` | Card surfaces |

### 2.2 Averis tie-in (pulled from averis.com, verified)

| Role | Hex | Source |
|---|---|---|
| Averis orange | `#E78823` | `averis-master-logo.svg` fill + 53 occurrences in their site CSS |
| Averis ink | `#141410` | logo wordmark fill |
| Averis body grey | `#606060` | their body copy |
| Averis type | Lato | `fonts.googleapis.com/css2?family=Lato` on averis.com |

Orange and burgundy are both warm reds — side by side at equal weight they vibrate and
neither wins. So they are split by **job, not by taste**:

```
BURGUNDY #6D001A  →  identity + data    active nav · chart ramp · MISMATCH · logo
ORANGE   #E78823  →  attention only     NEEDS_REVIEW badge · attention KPI · alert bar
BLACK    #0A0A0A  →  action             primary buttons, hover → burgundy
GREEN    #1F7A4D  →  resolved           OK · approved (small, never a full fill)
```

Orange appears on every screen — the sponsor is visible — but never competes, because on
this dashboard orange means exactly one thing: *a human is needed here.*

### 2.3 Light tokens (default)

```css
:root {
  /* surfaces — warm paper, per UI ref 2 and 3 */
  --paper:       #FAF8F6;
  --surface:     #FFFFFF;
  --surface-2:   #F3EFEC;   /* sunken rows, hover, table zebra */
  --line:        #E7E1DC;   /* hairline — the workhorse, not shadow */
  --line-strong: #D6CEC7;

  /* ink */
  --ink:    #0A0A0A;
  --ink-2:  #4A4441;        /* secondary copy */
  --ink-3:  #8A817C;        /* labels, meta, axis */

  /* brand */
  --burgundy:       #6D001A;
  --burgundy-hover: #550014;
  --burgundy-tint:  #F4E6E9;

  /* status */
  --review: #E78823;  --review-tint: #FDF1E2;   /* Averis orange */
  --ok:     #1F7A4D;  --ok-tint:     #E6F2EC;
  --defect: #6D001A;  --defect-tint: #F4E6E9;   /* = burgundy, deliberate */
  --spam:   #8A817C;  --spam-tint:   #F1EDEA;

  --focus: #6D001A;
}
```

### 2.4 The burgundy ramp — the "fun" chart colour from ref 3

Every multi-series chart uses one hue at five values. No rainbow, ever.

```css
--b-900: #3D000E;   /* BL_COMPARISON — the class that matters most, darkest */
--b-700: #6D001A;   /* SI_REQUEST */
--b-500: #97243D;   /* INVOICE_QUERY */
--b-300: #C4707F;   /* GENERAL */
--b-100: #EBD2D7;   /* SPAM — lightest, visually dismissed */
--b-050: #F7EEF0;   /* empty cells of the ref-3 pixel grid */
```

Category → shade is **fixed forever**. The operator learns "dark = real work, pale =
noise" once, then reads every chart pre-attentively. Adjacent pairs clear 3:1 against
each other, so the ramp survives greyscale printing, and because it is a single-hue
lightness ramp it is colour-vision-deficiency safe by construction.

### 2.5 Dark tokens

Dark is a real theme, not an inversion. `#6D001A` on black fails contrast, so it lifts.

```css
[data-theme="dark"] {
  --paper: #0B0A0A;  --surface: #141212;  --surface-2: #1C1919;
  --line: #2A2624;   --line-strong: #3A3431;
  --ink: #F7F4F2;    --ink-2: #B8AFAA;    --ink-3: #857C77;
  --burgundy: #A81233;  --burgundy-hover: #C21B40;  --burgundy-tint: #24090E;
  --review: #F2A24E;    --review-tint: #2B1D0C;
  --ok:     #3FA876;    --ok-tint:     #0E2119;
  --defect: #A81233;    --defect-tint: #24090E;
  --b-900:#5C0016; --b-700:#8E0022; --b-500:#B3405A;
  --b-300:#D08D99; --b-100:#E8C9CF; --b-050:#1E1A1A;
}
```

### 2.6 Rules

- Never colour a value **only**. Status = colour **+** dot/shape **+** word.
- Tints fill; solids stroke and set text. No large saturated fill except the hero KPI and
  the primary button.
- Body text ≥ 4.5:1, large text and UI edges ≥ 3:1. `--ink-3` on `--surface-2` passes at
  4.6:1 — do not let it drift lighter.
- One accent per card. If a card needs two, it is two cards.

---

## 3. Type

**UI and display: Inter** (variable). **Numbers, IDs, document values: JetBrains Mono.**

Mono is not a style choice here, it is the feature. `MEDUUD104332` vs `MEDUUD104S32` is
invisible in a proportional face and obvious in a monospaced one. Every SI/BL value,
container count, weight, port code and `email_id` renders mono with `tabular-nums`.

Averis's own face is Lato. It is used in exactly one place — the `× AVERIS` footer credit
and the sponsor lockup — so the tie-in is present without dragging a humanist sans
through a data-dense UI.

| Token | Size / LH / Weight | Tracking | Use |
|---|---|---|---|
| `display` | 36 / 40 / 500 | −0.02em | "Hello, Najiha" — once per page, top only |
| `h1` | 24 / 30 / 600 | −0.01em | View title |
| `h2` | 18 / 24 / 600 | −0.01em | Card / section title |
| `h3` | 15 / 20 / 600 | 0 | Sub-block, modal heading |
| `body` | 14 / 20 / 400 | 0 | Default |
| `body-sm` | 13 / 18 / 400 | 0 | Table cells, email body |
| `meta` | 12 / 16 / 400 | 0 | Timestamps, helper text — `--ink-3` |
| `label` | 11 / 14 / 600 | **0.08em, UPPERCASE** | KPI labels, table heads, eyebrows |
| `metric` | 40 / 44 / 600 | −0.03em | KPI number — mono, tabular |
| `metric-sm` | 28 / 32 / 600 | −0.02em | Secondary numbers |

The `label` style is the signature of the whole UI — it is what makes refs 2 and 3 feel
engineered rather than decorated. Use it for every column head and KPI caption. Never for
a sentence.

---

## 4. Layout, shape, depth

```
┌──────────────┬────────────────────────────────────────────────────────────┐
│ TEAM ▾       │  Dashboard › Overview      [ ⌘K search ]      ◆ DocuVerify  │ 64px topbar
│  248px       │                                    [🔔] [JR]   SHIPPING DOC │
│  sidebar     ├────────────────────────────────────────────────────────────┤
│              │  Hello, Najiha                     [Today ▾]  [Export ⤓]    │
│ ▸ Overview   │  ▓▓▓▓▓▓▓░░░ pipeline progress      128    14    96          │
│ ▸ Inbox  ⑭   │  ┌────────┬────────┬────────┬────────┐                      │
│ ▸ Documents  │  │ KPI 1  │ KPI 2  │ KPI 3  │ KPI 4  │                      │
│ ▸ Audit      │  └────────┴────────┴────────┴────────┘                      │
│              │  ┌───────────────────────────┬──────────────────┐           │
│ ── PIPELINE  │  │ Classification trend   8  │ Category mix  4  │           │
│              │  └───────────────────────────┴──────────────────┘           │
│ [JR] Najiha  │  ┌───────────────────────────────────────────────┐          │
└──────────────┴────────────────────────────────────────────────────────────┘
```

- **Grid** 12 col · 20px gutter · content max-width 1440 · page padding 24 (16 under 640).
- **Sidebar** 248px, collapses to 72px (icon-only, tooltip on hover), persisted to
  `localStorage["docuverify-sidebar"]`. Becomes an overlay drawer at ≤ 900px.
- **Topbar** 64px, sticky, `--surface`, `--line` bottom edge, and a **2px `#E78823` rule
  along the very top of the app** — the only full-width orange, and the sponsor signature.
- **Radius** card 14 · control 10 · input 10 · pill 999 · modal 18.
- **Spacing** 4pt base. Card padding 20 (24 for the hero). Card gap 20. Never invent a
  value outside `4 8 12 16 20 24 32 40 56`.
- **Depth is the hairline, not the shadow.** Cards: `1px solid var(--line)` plus at most
  `0 1px 2px rgba(0,0,0,.04)`. Real shadow (`0 12px 32px rgba(0,0,0,.12)`) is reserved for
  popovers, dropdowns and modals — so elevation always means "this is temporary".
- **Breakpoints** 1440 / 1200 (KPI 4→2 col) / 900 (sidebar → drawer, charts stack) / 640
  (single column, tables become stacked cards).

---

## 5. Components

### Buttons

| Variant | Fill | Text | Use |
|---|---|---|---|
| Primary | `--ink` → hover `--burgundy` | white | Approve & submit, Run pipeline |
| Secondary | `--surface`, 1px `--line-strong` | `--ink` | Export, filters |
| Ghost | none | `--ink-2` | Tertiary, in-card actions |
| Escalate | `--surface`, 1px `--review` | `--review` | Send to human review |

40px tall (32 compact / in-table), 10px radius, 14/500. Focus `2px solid var(--focus)`
with 2px offset. Nothing relies on hover alone.

### Status system — locked to the bundle's vocabulary

| Token | Colour | Shape | Word |
|---|---|---|---|
| `OK` | green tint | ● | Verified |
| `MISMATCH` | burgundy tint | ▲ | Defect · *n* fields |
| `NEEDS_REVIEW` | **orange tint** | ◆ | Needs review |
| `SPAM` | grey tint | ○ | Spam |
| processing | grey tint | ◌ spinning | Extracting… |

Categories (`BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL`, `SPAM`) render as
**outline** pills in their ramp shade. Statuses render as **filled tint** pills. Two
different shapes, so a category is never misread as a verdict.

### Cards

Title (`h2`) left, control (dropdown / "View all") right, on one 40px row → `--line`
divider → content. Every card uses this same header. That repetition is what makes the
grid feel calm.

### Tables

13px, 44px rows, sticky head in `label` style, hairline row separators (no vertical rules;
zebra only past 12 rows), numeric columns right-aligned and mono, row hover `--surface-2`,
one `⋯` menu at the end. Sortable heads show ⇅ at 40% opacity until hover.

### Charts

Colour per §2.4. Axes `--ink-3` at 11px, horizontal gridlines only in `--line`, tooltip =
dark chip (`--ink` bg, white text, 8px radius) exactly as ref 3. Never a legend where a
direct label fits.

---

## 6. Motion

Fast, cheap, mostly absent. `120ms` hover and colour, `180ms ease-out` popovers and card
entrance, `240ms` modals, `400ms` chart draw-in on first mount only. Easing
`cubic-bezier(.2,.8,.2,1)`. All of it inside `@media (prefers-reduced-motion: reduce)` →
`0.01ms`.

One flourish: KPI numbers count up over 600ms on first load. It reads well in the demo
video, costs nothing, and never repeats on re-render.

---

## 7. Voice — the "wording theme" from refs 2 and 5

Warm at the top of the page, clinical everywhere data lives.

| Where | Pattern | Example |
|---|---|---|
| Breadcrumb | `Section › View` | `Dashboard › Overview` |
| Greeting | `Hello, {Google given_name}` + one line of context | `Hello, Najiha` / `128 emails came in overnight. 14 need you.` |
| Permission copy | plain, absolute, no hedging | `Read-only access. DocuVerify never sends, deletes or replies.` |
| KPI label | UPPERCASE, 2–3 words | `NEEDS YOUR REVIEW` |
| KPI delta | arrow + % + period, always | `↑ 12.5% vs yesterday` |
| Section title | Sentence case noun phrase | `Classification trend`, `Field defect rate` |
| Empty state | What it means + what to do | `Nothing needs you right now. 96 cleared automatically today.` |
| Error | What broke + the way out | `Couldn't read this attachment. Open the original, or mark it unreadable.` |
| Footer | quiet credit | `DocuVerify · built for AVERIS SDOC` |

Banned: "Oops", "Awesome!", "Crushing it", exclamation marks anywhere but the greeting
emoji, and any phrasing implying the AI is certain ("Detected" → "Reads as"; "Error" →
"Couldn't read").

**Say "defect", "mismatch", "SI", "BL", "port of loading".** Shipping ops have their own
vocabulary; using it is what makes a judge believe the team talked to a user.

---

## 8. Accessibility — not optional

- Colour never alone: dot/shape + word on every status (§5).
- Focus visible on every interactive node. The whole review flow is keyboard-operable:
  `j`/`k` move the queue, `Enter` opens, `A` approves, `E` escalates, `⌘K` searches.
- `<dialog>` for modals: ESC, backdrop click, focus trap, focus returns to the trigger.
- The queue count and the toast are `aria-live="polite"`. Nothing is `assertive` — it
  interrupts screen-reader users mid-row.
- Every chart carries a `<table class="sr-only">` with the same numbers.
- Hit targets ≥ 40×40, including the table `⋯`.
- Text zoom to 200% with no horizontal scroll.

---

## 9. Decisions on the record

| Decision | Why |
|---|---|
| Light default, dark shipped | Operators read dense tables all shift; light wins. Dark exists because the demo room will be dark. |
| Logo **top-right** | Your ref-2 note — "logo top right is a great touch" — wins the far right of the topbar. |
| The switcher is a **Google account switcher**, in the topbar chip | It swaps which Gmail account is being read, so it follows Gmail's own pattern: avatar top-right. One switcher only. The sidebar top instead shows the **active mailbox + last sync**, which answers "what am I looking at" without a menu. |
| Greeting name from the **Google profile** | `given_name` → email local part → bare `Hello`. Same hook as the account chip, so the two can never disagree about who is signed in. |
| Orange = status only | Sponsor colour on every screen, never fighting burgundy, and `NEEDS_REVIEW` stays unmissable. |
| Primary button is **black**, not burgundy | Refs 2 and 3 both use a black CTA, and it frees burgundy to mean "defect" in the data without teaching the user two meanings for one colour. |
| One hue, five shades for every chart | The thing you liked in ref 3 — and CVD- and greyscale-safe for free. |
| Mono for all document values | The product's entire job is spotting a one-character difference. |
| **One app, not two** | `/` Overview · `/inbox` workspace · `/documents` · `/audit`; `/verification` redirects. Two shells meant two design languages, two queues and two field types — every fix made twice. |
| **No sparklines in the KPI cards** | There is no per-day history to draw. Four identical fake curves is exactly the detail that makes a judge doubt every real number beside it. The slot holds a second *derived* number instead. |

---

## 10. Reference credits

| Ref | What we took |
|---|---|
| 1 | `Hello, Carlic` greeting + subtitle block; pill search with a dark circular button; one dark-filled KPI among light ones |
| 2 | The whole calm grid, warm paper, uppercase micro-labels, the `↑12.5% vs last month` delta line, sparkline-in-KPI, black CTA, and the wording |
| 3 | Breadcrumb `Dashboard › Overview`, team switcher block, the pixel-block trend chart in one hue, `⌘K` search, dense transaction table |
| 4 | Icon-topped quick-stat tiles — reused for the 7-field defect strip |
| 5 | `Hello Valentina` scale, the segmented progress bar, and the three bare numbers beside it |
