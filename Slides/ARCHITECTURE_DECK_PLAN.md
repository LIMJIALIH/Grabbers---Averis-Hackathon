# The architecture deck — plan for `showcase.html`

What changed, why, and what every slide has to earn. Written before the rebuild
so the deck can be argued with, not just looked at.

---

## 1. The brief, in one line

> "I like the burgundy deck's style and animation but not its info. I like the
> orange deck's info, but it is too focused on BERT and overshadows the rest of
> the app. This is a competition for a **solution**, not a data analysis. We are
> promoting **DocuVerify as an app**. Focus on the **tech architecture**."

So:

| Keep from | What |
|---|---|
| **Burgundy (`pitch.html`)** | The whole visual + motion system: dark tokens, pinned eyebrow/headline, `.fx` stagger, `countUp`, the orange sponsor rule, foot + progress bar, keyboard nav, `?still` export mode. |
| **Orange (`showcase.html`)** | The *product* framing — plain verbs, one idea per slide, the "what it does" story rather than the "what the corpus contains" story. |
| **Neither** | The 520-square noise field, the 903-comparison staircase, the defects-by-field bar chart, the `64 ÷ 7 = 9.1` arithmetic. That is dataset analysis. It proves we read a CSV, not that we built a system. |

`pitch.html` is **not touched**. It stays as the burgundy deck, first in the
running order. This plan rebuilds `showcase.html` only.

---

## 2. What the reference actually asks for

`Slides/refrence/…Preliminary Judging Rubric.pdf` — 100 pts, **Technical 70 /
Product & Impact 30**:

| # | Criterion | Max | Where this deck carries it |
|---|---|---|---|
| 1 | System Design & Architecture | **15** | Slides 4, 5 — primary |
| 2 | Working Core Prototype | **25** | Slides 3, 9 support it; won by the video + live link, not by slides |
| 3 | Technology Integration | **15** | Slides 6, 7 — primary |
| 4 | Technical Feasibility & Validation | **15** | Slides 9, 10 — primary |
| 5 | Problem Statement Understanding | 10 | Slide 2 |
| 6 | Innovation & Solution Approach | 10 | Slides 7, 8 |
| 7 | Practical Value & Potential | 10 | Slides 3, 11 |

**45 of the 70 technical points are architecture, integration and validation.**
That is the whole argument for this rebuild: the burgundy deck spends four of its
ten slides on corpus statistics, which the rubric does not score anywhere.

`Rules and Regulations.pdf` p.7 also makes four sections **mandatory**:
Technical Architecture · Implementation Details · Challenges Faced · Future
Roadmap. The old orange deck has no Challenges slide and no Roadmap slide. Both
are added.

Judges are told **not to reward the same evidence twice** — so one number appears
on exactly one slide. The old decks quote `45` on three slides each.

---

## 3. Fixing "BERT overshadows the app"

BERT is **one stage of five**, and it is no longer even the only model in the
system. The current backend runs two AI layers:

- **Stage 3 — routing.** Fine-tuned BERT (`transformers` + `torch`, local
  `model/email_multiclass_classifier`) reads the *body* and picks one of five
  categories. `app/services/email_classifier.py`.
- **Stage 5 — extraction.** **Two different Gemini models**
  (`gemini-3.8-flash` and `gemini-3.7-flash`) read each document *independently*.
  A field is only accepted when both normalise to the same value; disagreement
  leaves the field `null` and sends the case to a human.
  `app/services/extraction_consensus.py`, `app/integrations/gemini_extractor.py`.

Slide 7 presents them as a **pair**, side by side, one panel each. That single
layout choice demotes BERT from "the thing we built" to "the router", which is
what it actually is — and it hands the Innovation criterion a much better story:
*the system disagrees with itself on purpose.*

### Corrections to stale claims in both existing decks

| Old claim | Reality |
|---|---|
| "20 rules + BERT" | BERT classifies; the rule pass is a data-prep artefact, not the runtime path. |
| "pytesseract / OCR fires per page" | **No Tesseract.** PDFs go to Gemini native PDF vision, scanned ones included. `pypdfium2` is used for document-*type* detection only. |
| "Pint / RapidFuzz" | Not installed. Normalisation is plain Python in `field_normalization.py`. |
| "Pydantic, schema-enforced" | True, and worth keeping — `app/schemas/`. |

Putting a library on a slide that is not in `requirements.txt` is the fastest way
to lose the Technology Integration criterion in Q&A.

---

## 4. Slide-by-slide

12 slides. **One slide, one claim, one animated figure.** If a sentence runs past
twelve words it is a script note, not a slide — the presenter says the prose, the
slide shows the number arriving.

| # | Title | Rubric | Figure | What moves |
|---|---|---|---|---|
| 1 | **Title** | — | `5 · 2 · 7` | Three counters: stages, AI layers, fields |
| 2 | **The problem** `01` | #5 | `520 → 129 → 64 → 1` | The descending staircase, each figure counting up in turn |
| 3 | **The product** `02` | #7 #2 | 4 screens | Cards stagger in; one route each, four words each |
| 4 | **The architecture** `03` | **#1** | `520 · 1 · 5 · 4 · 7` | **The rail draws left to right and each stage dot pops as it arrives.** The deck's most important slide |
| 5 | **Why this shape** `04` | **#1** | `5 owners · 2 may guess · 1 read` | Three big counters, one line of justification each |
| 6 | **The stack** `05` | **#3** | 16 chips | Chips land one at a time, so each layer assembles rather than appears |
| 7 | **Two models, two jobs** `06` | **#3 #6** | 7 field cards | **Six tick green, one lands amber `≠`** — the consensus check, animated. BERT is one panel of two |
| 8 | **Human in the loop** `07` | **#6** | `20 · 4 · 1` | **The one slide where the machine is not the subject.** Left: what it hands over. Right: the card the operator decides on, assembled row by row — both values, both model readings, accept / override / send back, logged to `/audit` |
| 9 | **How we know it works** `08` | **#4** | `64 / 45 / 20` then `0` | The segmented bar grows; the zero lands last |
| 10 | **What was hard** `09` | **#4** | `64 · 5 · 0 · 2 · 91` | `[MANDATORY]` Number first, fix second. The 91 is the judgement call |
| 11 | **Roadmap** `10` | **#7** | 3 legs | `[MANDATORY]` Gmail + deploy → persistence → the correction loop |
| 12 | **Close** | — | `5 · 2 · 0` | Counters land on the last line |

### Slides deliberately cut

- **The 520-square field.** Beautiful, and it argues "the inbox is noisy" — a
  point slide 2 makes in one sentence. 4.5 s of animation for a premise.
- **The cost staircase (129 → 903 → 71 → 1).** Pure arithmetic on their dataset.
- **Defects by field.** Interesting to us, scored by nothing.
- **`64 ÷ 7 = 9.1`.** The 64 spellings survive as a *challenge* on slide 10,
  where they are evidence of engineering, not of counting.

---

## 5. Motion

The burgundy deck's system, kept and extended — it is the part of the brief that
does not change.

Inherited:

- `.fx` entrance staggered along the reading path, `--i` × 55 ms + 50 ms.
- `countUp` on every figure, timer-backed so a hidden tab cannot strand a number
  part-counted (`visibilitychange` replays the slide on return).
- The descending staircase on the problem slide, and the segmented outcome bar
  that grows to width on the validation slide.

Added, because "more numbers" only works if the numbers arrive:

- **Pipeline rail draw** — `scaleX(0 → 1)` over 550 ms on slide 4, with each
  stage dot popping `scale(0 → 1)` on its own `--i` delay. The flow is the
  argument, so the flow moves.
- **Chip cascade** — each stack chip lands on a `--c` delay, so a layer assembles
  instead of appearing.
- **Agreement strip** — the seven field cards on slide 7 land in sequence, six
  green ticks and one amber `≠`. It shows the consensus rule rather than
  describing it.

Budget: every slide still settles inside **`--cap` = 1000 ms**. Worst case is the
rail, 80 ms + 550 ms = 630 ms. The 4.5 s grid sweep is gone with its slide, so
this deck has **no exception** to the budget.

`?still` and `prefers-reduced-motion` land every slide on its finished state for
PDF export — the new rail, dots, chips and field cards are all in both overrides.

---

## 6. Sources

Every claim on a slide resolves to one of these:

| What | Where |
|---|---|
| Mandatory sections, AI + cloud rule | `Slides/refrence/Averis x Monash Hackathon Rules and Regulations.pdf` |
| 7 criteria, weights, bands | `Slides/refrence/…Preliminary Judging Rubric.pdf` |
| Problem framing, four capabilities | `Refrence/Shipping Document Verification Use Case.pdf` |
| Five stages, contracts, owners | `docuverify_5_stage_architecture.md` |
| Dual-Gemini consensus, field checks | `backend/app/services/extraction_consensus.py` |
| BERT routing | `backend/app/services/email_classifier.py` |
| Models, timeouts, limits | `backend/app/core/config.py` |
| Runtime dependencies | `backend/requirements.txt`, `frontend/package.json` |
| Corpus numbers, judgement calls | `backend/data_prep/FINDINGS.md` |
| Deck rules and open risks | `Slides/SLIDE_CHECKLIST.md` |

---

## 7. Still open

These are product gaps, not slide gaps — the deck must not paper over them:

- **No public prototype link.** The rubric scores a slides-only core as *Weak* on
  the 25-point criterion. Slide 3 shows the app; only a live link scores it.
- **Cloud.** The rules require meaningful cloud infrastructure. Gemini is a cloud
  API and counts for AI; nothing is *deployed* yet. The roadmap slide says so
  plainly rather than implying otherwise.
- **`bundle_dir` default.** `backend/app/core/config.py` points at
  `backend/resources/sdoc-hackathon-bundle`; the bundle lives at the repo root, so
  a fresh clone fails 7 tests. One-line fix, and a judge following the README hits
  it immediately.
