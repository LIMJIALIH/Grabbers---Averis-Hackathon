# DocuVerify — New UI 2 research

> Branch `New_ui_2`, written 24 Sep 2026. Read after
> [`DESIGN_STYLE.md`](./DESIGN_STYLE.md) (how it looks) and
> [`SUGGESTED_CHANGES.md`](./SUGGESTED_CHANGES.md) (the 20 Sep audit, mostly shipped:
> Queue · Insights · Audit, `/case/[id]`, verdict sentence, blocker link, CSV audit).
>
> This file answers a different question: **what does a shipping-documentation team
> actually need to see, and which charts would earn a place?** Everything here is either
> sourced (see §10) or traced to a file in this repo. Nothing is built yet.

---

## 0. The short version — 8 changes, ranked by value per hour

| # | Change | Why it matters to the user | Data exists today? |
|---|---|---|---|
| 1 | **Shipment identity strip** on every case: BL no. · booking ref · vessel/voyage · POL → POD lane · customer · commodity | Ops people think in *shipments*, not `email_014`. They search by BL number and booking ref. | ✅ In every BL/SI attachment and most subjects |
| 2 | **Two-model agreement dots** per field (Gemini A / Gemini B agreed · disagreed · missing) | Our real differentiator — "two models must agree" — is computed in the backend and **invisible** in the UI. | ✅ `field_checks` in `extraction_consensus.py`, not sent by `/cases` |
| 3 | **Click a field → jump to the source line** in the SI/BL text, highlighted | The single biggest time saver in every HITL tool studied. Turns review into confirm-or-correct. | ✅ `SourceSegment` in ingestion; needs a span per field |
| 4 | **Pipeline flow (Sankey)** on Insights: emails → category → compared → verified / defect / needs review → resolved | Shows the whole product in one picture. Best 8-second chart for the demo video. | ✅ All from `summarise()` |
| 5 | **Defect heatmap: customer × field** | Tells the team lead *who to call* ("Safqa's notify party is wrong 4 times"). Upstream fixes are where the money is. | ✅ sender domain + `defects[]` |
| 6 | **Confidence histogram with the 85 gate drawn on it** | Proves the threshold is sensible and shows how much goes to a human, honestly. | ✅ field confidences |
| 7 | **"Amendments avoided" estimate** with its assumption on screen | Translates defects caught into the language a client signs for: money and days. | ✅ count; the $ rate is an editable assumption |
| 8 | **Reply-to-carrier draft** from a defect ("BL differs from SI on port of loading: SI MYTPP / BL MYTPT") | Finishes the job. Today the operator finds the defect and then has to write the email by hand. | ✅ verdict + fields already build this sentence |

Two things **not** to build yet: a world map of lanes, and any time-trend chart. Why in §7.

---

## 1. Who uses this, and what they ask

Three real users plus the judge. The same screens serve all of them, so each question
below must be answerable in one glance from one place.

| User | Moment | The question in their head | Where it should be answered |
|---|---|---|---|
| **SDOC operator** (Averis Shipping Documentation Services — Najiha in the bundle's emails) | Start of shift | *How much is mine, and what is most urgent?* | Queue status row |
| | Opening a case | *Which shipment is this, and what exactly is wrong?* | Identity strip + verdict sentence |
| | Checking a flagged field | *Is the machine right? Show me where it read that.* | Field row → source highlight + agreement dots |
| | After deciding | *Now tell the carrier / shipper.* | Reply draft |
| **Team lead** | Daily / weekly | *Are we keeping up? Where do defects come from? Is the AI trustworthy?* | Insights |
| **Client / compliance** (the shipper Averis serves) | Monthly, or after a dispute | *Who approved this BL, when, and what did they change?* | Audit + exported case record |
| **Hackathon judge** | 5 m 29 s video | *Does it work, and do they understand shipping?* | The Sankey, one case end-to-end, the agreement dots |

The operator's shift still has one shape (from `SUGGESTED_CHANGES.md` §2.1):
**how much is mine → work one case → decide → prove it later.** Everything below slots
into that spine; nothing new goes in front of the queue.

---

## 2. Industry context the UI should reflect

### 2.1 The document lifecycle

```
Booking ──► SI (shipper's instruction) ──► Draft BL (carrier) ──► SDOC check ──► Approve ──► Final BL issued
                                  ▲                                     │
                                  └──────── amendment request ◄─────────┘  (defect found)
```

- The **SI is the source of truth**; the carrier drafts the BL from it. Already reflected
  in our asymmetric diff (only the BL gets marked) — keep that.
- Shippers submit the SI **24–72 h before the documentation (SI) cut-off**, which is
  usually the *earliest* deadline of a voyage — typically 48–72 h before vessel departure
  (ETD). VGM cut-off follows 24–48 h before ETD. [§10: STU, SeaFreightGo, Terminal49]
- **Corrections before sailing are usually free or nominal** ($0–50). **After** the BL is
  released / the vessel sails, carriers charge **$30–200 per change per BL** (MSC: USD 75
  on US exports), plus **1.5–3 h of internal labour** per amendment cycle, and a delayed
  release can add **$500–1,500** in port charges. [§10: Tier2, MSC/AJOT, Hansatic]
- Most common amended items: party names/addresses (consignee, notify), container numbers,
  port changes, container count, weights. **These map almost exactly onto our 7 fields** —
  worth saying out loud in the demo.

**What this means for the UI**

1. **The unit of urgency is time-to-cut-off, not time-received.** A defect found 60 h
   before cut-off is free to fix; the same defect found after sailing costs money. The
   queue should eventually sort by cut-off (needs ETD — §8).
2. **The value of the product is "amendments avoided".** Every defect caught pre-release is
   a fee + hours not spent. That is the headline number for a client, not "accuracy %".
3. **Defects have an upstream cause.** A lead wants to know *which customer / which carrier
   / which field* produces them, so they can fix it at the source.

### 2.2 Standards the UI can lean on (cheap credibility)

| Standard | What it is | UI use |
|---|---|---|
| **UN/LOCODE** | 5-char port code: 2-letter country + 3-letter place (`MYPKG`, `PECLL`) | Show code **and** name (`PECLL · Callao, Peru`); flag a code that doesn't exist. Replaces the hand-kept `PORT_ALIASES` table in `lib/cases.ts` (already marked `ponytail:` for this). |
| **ISO 6346** | Container number `MSKU1234565` — owner code + serial + mod-11 check digit | If container numbers are extracted later, a failed check digit is a *certain* typo — a validator, not a guess. ~10 lines of code. |
| **DCSA Bill of Lading 3.0** | Industry data standard for SI → draft BL → approval → eBL | Name-drop in the architecture slide; our 7 fields are a subset of it. Future: export the approved record in DCSA-shaped JSON. |
| **SOLAS VGM** | Verified gross mass must be declared before loading | Explains why `gross_weight_kg` defects matter more than a typo in an address. |

---

## 3. Information needed — what to show, per screen

"Now" = derivable from data already in the bundle/backend. "Needs" = new field required.

### 3.1 Queue (`/`)

| Column / element | Now shows | Should show | Status |
|---|---|---|---|
| Identifier | `email_014` | **BL no.** (`MEDUUD104332`) primary, email id secondary | Now — BL no. is in the subject and the BL text |
| Customer | sender address | **Customer name** from sender domain / SI shipper (`APRIL Fine Paper`) | Now |
| Lane | — | `MYPKG → PECLL` in mono | Now, after extraction |
| Status | pill | keep | ✅ |
| Confidence | lowest field score | keep, **with gate tick** | ✅ partially |
| Model agreement | — | `6/7 agreed` mini dots | Needs `/cases` to return `field_checks` |
| Due | — | **Hours to SI cut-off** (sort key) | Needs ETD / cut-off |
| Search | subject, id | + BL no., booking ref, vessel | Now |

### 3.2 Case (`/case/[id]`)

Top to bottom (keeps the shipped layout, adds three things):

1. **Identity strip (new)** — `BL MEDUUD104332 · Booking MSDUL0942518196 · MMSS 2507 V.11S · MYPKG → PECLL · APRIL Fine Paper → MOORIM SP · Copier paper · Prepaid`. One line, mono for codes, wraps on narrow screens. Every value is already printed in the BL attachment (`email_001_BL.txt`).
2. **Verdict sentence** — shipped. Keep.
3. **7-field table** — shipped. Add per row:
   - **Agreement dots** `●●` (both models agreed) / `●○` (disagreed) / `○○` (missing). Tooltip: *"Gemini A read 21,577 kg · Gemini B read 21,577 kg."*
   - **Normalisation note** when a value was converted: *"47,570 lbs → 21,577 kg"*, *"Load Port → Port of loading"*. This is where we show we understood the alias problem.
   - **Source link** — click the row → evidence pane scrolls to and highlights the exact line.
4. **Evidence, side by side** — shipped. Add the highlight from (3).
5. **Decision rail** — shipped. Add: **"Draft reply to carrier"** (only on `MISMATCH`), and a **correction reason picker** (`Carrier typo` · `Shipper changed instruction` · `Extraction error` · `Other`) instead of a free-text-only reason. The picked reason feeds §4 chart 6.

### 3.3 Insights (`/insights`)

Order by *what a decision gets made from* (keeps the rule from `SUGGESTED_CHANGES.md` §2.5):

1. Straight-through rate — shipped.
2. **Pipeline flow (Sankey)** — new.
3. Field defect rate — shipped → becomes the **customer × field heatmap**.
4. **Amendments avoided** — new, one number.
5. **Confidence histogram + gate** and **model agreement by field** — new, as a "Can we trust the AI?" section.
6. Category mix — shipped, keep the provenance chip.

### 3.4 Audit (`/audit`)

Shipped and in good shape. Add: filter by **BL no.**, and a **per-case "record" export**
(PDF/print) that bundles verdict + fields + corrections + who/when — the artefact a client
asks for in a dispute.

---

## 4. Data visualisations — the shortlist

Every chart below answers one named question for one named user and uses only the
burgundy ramp + orange-for-review rule in `DESIGN_STYLE.md` §2. `recharts` is already
installed and has `Sankey`, `BarChart`, `ReferenceLine` — **no new dependency needed.**
The heatmap is a CSS grid.

| # | Chart | Question it answers | User | Data today | Build |
|---|---|---|---|---|---|
| 1 | **Pipeline Sankey** — 520 emails → 5 categories → BL comparisons → Verified / Defect / Needs review → Approved / Escalated / Open | *What happened to everything that came in?* | Lead, judge | ✅ `summarise()` + resolutions | recharts `Sankey`, ~60 lines |
| 2 | **Customer × field heatmap** — rows = top 10 sender companies, cols = 7 fields, cell = defect count (burgundy ramp), click → filtered queue | *Who keeps sending bad documents, and on which field?* | Lead | ✅ sender domain + `defects[]` | CSS grid, ~50 lines |
| 3 | **Confidence histogram** — field confidence in 5-pt bins, vertical line at `HITL_THRESHOLD` (85), bins left of the line in orange-tint | *Is 85 the right gate? How much goes to a human?* | Lead, judge | ✅ `fields[].confidence` | recharts `BarChart` + `ReferenceLine` |
| 4 | **Model agreement by field** — 100% stacked bar per field: agreed / disagreed / missing | *Which field does the AI struggle with?* (e.g. notify party vs container count) | Lead, ML team | ⚠️ needs `field_checks` in `/cases` | stacked `BarChart` |
| 5 | **Review reason bar** — missing attachment / unreadable / wrong doc / missing value / classification uncertain | *Why do things land on a human?* Most are upstream (sender) problems, not AI failures | Lead | ✅ `summary.reasons` | horizontal bars, reuse `DefectBars` |
| 6 | **Correction reason split** — carrier typo vs shipper change vs extraction error | *Are we fixing carriers' mistakes or our own?* | Lead | ⚠️ needs the reason picker (§3.2) | small bar |
| 7 | **Amendments avoided** — one big number: `defects caught × $X` and `× 2 h`, rate editable, label says *"estimate"* | *What is this worth?* | Client, judge | ✅ count; $ is an assumption | stat tile |

**Per-case micro-visuals** (no chart library, just marks):

- Confidence bar with the **85 tick drawn on it** (partly shipped as `FieldScore`).
- **Agreement dots** `●●` / `●○` / `○○`.
- **Character diff** — shipped (`diffSpan`). Upgrade to LCS only if multi-edit defects appear.

### How each should look (in words, so it matches the system)

- **Sankey**: left-to-right, one reading direction. Node colours = category ramp
  (`--b-900`…`--b-100`); the "Needs review" node is the **only orange** thing on the chart;
  "Verified" uses `--ok`. Direct labels with counts on nodes, no legend.
- **Heatmap**: 7 columns fixed in `FIELDS` order, rows sorted by total defects. Empty cell
  `--b-050`; ramp to `--b-900`. Number printed in the cell (colour never alone). `<table
  class="sr-only">` twin, per `DESIGN_STYLE.md` §8.
- **Histogram**: gate line labelled once, *"85 — below goes to a human"*. Y axis = number of
  fields, not cases; say so in the card subtitle.
- **Amendments avoided**: `$X` and `hours` side by side, subtitle *"Estimate: 34 defects
  caught before release × $75 carrier fee (MSC, US exports) × 2 h staff time. Change rate ⚙"*.
  Never presented as measured savings.

---

## 5. How it should be done — interaction patterns from HITL tools

Pulled from HITL/IDP guidance (Parseur, Docsumo, LandingAI, RedHub, Microsoft) and
checked against what we already have.

| Pattern | Industry practice | DocuVerify today | Action |
|---|---|---|---|
| Source grounding | Selecting a field jumps the viewer to the exact source region | Evidence side by side, no jump | **Add** (§3.2 item 3) |
| Show flagged fields first | Reviewer sees only flagged fields; the rest collapsed | Defect rows sorted first | Keep; collapse the green rows behind *"6 fields verified ▸"* on `MISMATCH` cases |
| Per-field threshold | Thresholds per field, not per document | One global 85 | Later: weights & container count stricter than names (a wrong weight is a SOLAS issue) |
| Keyboard-first | No mouse-only flow; batch submit | `J`/`K` shipped | Add `A` approve, `E` escalate, `R` reply, `?` shortcut sheet |
| Batch approve | One click for all-green items | Per-case only | **"Approve 12 verified BLs"** on the queue — only for `OK` + both models agreed on all 7 |
| Queue ageing / SLA | Show age; target resolve within 1 business day | None | Needs `received_at` → age chip; later cut-off countdown |
| Corrections feed back | Corrections become training / audit data | Stored in session with reason | Reason picker → chart 6; export as labelled data for BERT |
| Sample audit of auto-accepted | Spot-check a fixed % of straight-through items | None | Later: "5 random verified cases to spot-check" card on Insights |

---

## 6. Suggested build order for `New_ui_2`

| Step | What | Files | Depends on |
|---|---|---|---|
| 1 | Parse shipment identity (BL no., booking, vessel/voyage, lane, commodity) | small parser in `lib/cases.ts` (regex over BL/SI text — the bundle is template-generated) | nothing |
| 2 | Identity strip on case + BL no./lane in queue + ⌘K search by BL no. | `CasePane.tsx`, `QueueTable.tsx`, `SearchPalette.tsx` | 1 |
| 3 | Sankey + heatmap + histogram on Insights | `components/overview/widgets.tsx`, `app/insights/page.tsx` | nothing |
| 4 | Amendments-avoided tile | `widgets.tsx` | nothing |
| 5 | Reply-to-carrier draft (copy to clipboard / `mailto:`) | `CasePane.tsx` | nothing |
| 6 | Backend: return `field_checks` + per-field source line in `/cases` | `backend/app/schemas/verification_upload.py`, cases route | backend team |
| 7 | Agreement dots + source jump + agreement chart | `CasePane.tsx`, `widgets.tsx` | 6 |
| 8 | Correction reason picker + chart 6 | `CasePane.tsx`, `auditTrailStore.ts` | nothing |

Steps 1–5 are frontend-only and need no new dependency.

---

## 7. What not to build (and why)

- **World map of lanes.** Looks great, answers nothing a sorted lane list doesn't; heavy
  dependency; the bundle has about a dozen ports. A "Top lanes" list is enough.
- **Any time-trend line** (volume per day, defects per week). The bundle has no
  timestamps; `received_at` is optional and unset. A fabricated trend was already removed
  once (`SUGGESTED_CHANGES.md` §1.5) — don't bring it back until real timestamps exist.
- **KPI sparklines.** Same reason; locked decision in `DESIGN_STYLE.md` §9.
- **Reviewer leaderboards / gamification.** Wrong tone for a compliance product, and the
  audit trail isn't persisted yet.
- **Accuracy % vs ground truth** in the UI. The organizer answer key must stay private
  (README warning), and the corpus is synthetic.

---

## 8. Data gaps (backend asks)

| Gap | Unlocks | Effort |
|---|---|---|
| `received_at` per email | Queue age, SLA, any trend | Small — Gmail gives it; bundle can use file order |
| ETD / SI cut-off per shipment | Sort by urgency, cut-off countdown — the #1 industry need | Medium — not in the bundle; would come from booking data or the email body |
| `field_checks` (two-model agreement) in `/cases` | Agreement dots, chart 4 | Small — already computed in `extraction_consensus.py` |
| Per-field source line/offset | Click-to-source highlight | Small–medium — segments exist, need field → segment mapping |
| Extra shipment fields (BL no., booking, vessel, voyage, commodity) | Identity strip, search | Frontend regex now; add to extraction schema later (not scored) |
| Persisted audit + resolutions | Throughput per reviewer, sample audits | Medium — needs a store |

---

## 9. Decisions (24 Sep 2026) and what was built

| Question | Decision |
|---|---|
| Who is the user? | **All internal logistics personnel** doing the check. The reply goes back to whoever sent the SI + draft BL. |
| Amendment fee | **Malaysian carrier range, RM 50–250 per BL** (Hapag-Lloyd RM 50 · RCL RM 100 · Maersk RM 200 · CMA CGM RM 250 after sailing; free before sailing). Staff time 1.5–3 h per amendment. |
| Shipment identity source | **Frontend parser now** over the attachment text (the bundle is template-generated); move into the extraction schema later. |
| Sankey or heatmap | Both built. |

**Built on `New_ui_2`** (style, tokens and motion reused, no new dependency):

| Piece | Where | Notes |
|---|---|---|
| Shipment parser: BL no., booking, vessel, voyage, cargo, freight, carrier (SCAC), lane | `lib/cases.ts` `shipment()` | Carrier from the BL prefix, else the booking prefix (ONE prints `ONEY` only on the booking). Covers 100/126 BL cases' BL no. Self-check: `node --experimental-strip-types scripts/check-shipment.mts` |
| Shared search haystack | `searchText()` → queue filter + ⌘K | Search by BL no., booking, vessel, carrier, port |
| Queue "Shipment" column | `QueueTable.tsx` | BL no. over `POL → POD`; sender moved to the subject tooltip |
| Case identity strip | `CasePane.tsx` `Identity` | Staggered rise, mono values |
| Draft reply | `CasePane.tsx` `ReplyModal` | Editable, Copy / Open in email (`mailto:`), nothing sent by the app; logged as `DRAFT_REPLY` in the audit trail |
| Insights: amendment cost avoided | `widgets.tsx` `AmendmentsAvoided` | Range + "Estimate" chip + "How this is worked out" |
| Insights: pipeline Sankey | `widgets.tsx` `PipelineFlow` | Bands draw left→right on the count-up beat; nodes click through to the filtered queue |
| Insights: carrier × field heatmap | `widgets.tsx` `CarrierHeatmap` | Replaces `DefectBars` (its totals row is the old chart). Aggregate row is unshaded so a sum never out-shouts a carrier |
| Insights: classifier certainty | `widgets.tsx` `ClassifierCertainty` | One dot per email, per-category gate tick (mirrors backend `.env` gates) |

**First finding worth saying in the demo:** on the bundle, **notify party is wrong in 41 of
65 defective drafts** — more than every other field combined.

Still open from §6: two-model agreement dots and click-to-source (need backend step 6),
correction reason picker (step 8).

---

## 10. Sources

- Terminal49 — [Shipping instructions glossary](https://terminal49.com/glossary/shipping-instructions)
- Tier2 Systems — [Bill of Lading amendment: an ops team's guide](https://tier2systems.com/en/blog/bl-amendment-ops-guide/)
- Hansatic — [BL amendment process](https://hansatic.com/en/guides/bl-amendment-process)
- AJOT — [MSC fee updates (USD 75 BL amendment fee)](https://www.ajot.com/news/msc-announcement-fee-updates)
- STU Supply Chain — [Container shipping deadlines explained](https://stusupplychain.com/container-shipping-deadlines-explained-cut-off-time-si-deadline-vanning-time-customs-release-cut-off.html)
- SeaFreightGo — [SI vs VGM vs CY cut-off](https://seafreightgo.com/what-is-cy-cut-off-shipping-meaning/)
- DCSA — [Cut-off times in container shipping](https://dcsa.org/newsroom/cut-off-times-in-shipping), [Bill of Lading 3.0 use cases](https://dcsa.org/standards/bill-of-lading/documentation-bill-of-lading-3/bill-of-lading-3-use-cases), [eBL standard](https://dcsa.org/standards/bill-of-lading)
- Smart Maritime Network — [DCSA Booking 2.0 / BL 3.0 release](https://smartmaritimenetwork.com/2025/02/21/dcsa-releases-updated-booking-and-ebl-data-exchange-standards/)
- Wikipedia — [ISO 6346](https://en.wikipedia.org/wiki/ISO_6346)
- UNECE — [UN/LOCODE code list](https://unece.org/trade/cefact/unlocode-code-list-country-and-territory)
- RedHub — [Human-in-the-loop document processing, done right](https://blog.redhub.ai/human-in-the-loop-document-processing)
- Parseur — [HITL best practices](https://parseur.com/blog/hitl-best-practices)
- Docsumo — [Human-in-the-loop systems](https://www.docsumo.com/blog/human-in-the-loop-systems)
- LandingAI — [HITL review workflows for document AI](https://landing.ai/llms/building-human-in-the-loop-review-workflows-for-document-ai)
- Microsoft Learn — [Confidence and grounding in document analysis](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/document/analyzer-improvement)
- Extend — [HITL document processing platforms](https://www.extend.ai/resources/best-hitl-document-processing-platforms)
- SCMR — [Cutting shipping document turnaround by 99%](https://www.scmr.com/article/we-cut-shipping-document-costs-by-98-and-turnaround-time-by-99-heres-how/procurement)
