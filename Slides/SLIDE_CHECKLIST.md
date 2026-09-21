# DocuVerify — Slide Deck Checklist

Plan for the preliminary-round deck. Every claim below is grounded in a file in
this repo or an organizer PDF; sources are cited so nothing goes on a slide we
cannot defend.

Use `(Flagged)` beside any item that needs follow-up.

---

## 1. The hard requirements

From **Rules & Regulations, p.7** — the deck is one of six mandatory Google Form
fields, and it must cover exactly four things:

- [ ] **Technical Architecture**
- [ ] **Implementation Details**
- [ ] **Challenges Faced**
- [ ] **Future Roadmap**

Delivery: a **publicly accessible link** — Google Slides, PDF on Drive, Notion,
or a GitHub README all qualify. No page limit, no template, no format constraint.

**Deadline: 22 September 2026, 12:00 PM.** Submission window opened 18 Sep.

### Two corrections to `Resource.md`

- [ ] Video max is **5 minutes**, not 5 min 29 s (`Rules`, p.6). 1 mark per 30 s over.
- [ ] The rubric is no longer unreadable — `Slides/refrence/…Preliminary Judging Rubric.pdf`
      confirms the proposal's table is **exactly right**. Update `Resource.md:64`.

---

## 2. What the deck is scored against

Confirmed from the rubric PDF (100 pts: Technical 70 / Product & Impact 30):

| # | Criterion | Max | Deck carries it? |
|---|---|---|---|
| 1 | System Design & Architecture | 15 | **Yes — primary** |
| 2 | Working Core Prototype | 25 | Video + live link; deck supports |
| 3 | Technology Integration | 15 | **Yes — primary** |
| 4 | Technical Feasibility & Validation | 15 | **Yes — primary** |
| 5 | Problem Statement Understanding | 10 | **Yes — primary** |
| 6 | Innovation & Solution Approach | 10 | **Yes — primary** |
| 7 | Practical Value & Potential | 10 | **Yes — primary** |

The deck is the main or only evidence for **75 of 100 points**. Prototype (25) is
won by the video and the deployed link, not by slides — the rubric explicitly
scores "only shown through slides or mock-ups" as **Weak**.

Band boundaries worth knowing: a 15-pt criterion needs **12+** for Excellent, the
25-pt needs **19+**. Judges are told to score each criterion independently and
**not to reward the same evidence twice** — so each slide needs its *own* evidence,
not a restatement of the previous one.

---

## 3. Deck plan — 16 slides

Rubric target in brackets. `[MANDATORY]` = named in the submission rules.

### Opening

- [ ] **1. Title** — Team Grabbers · DocuVerify · "From email inbox to discrepancy
      report." Names + the four links (repo, live, video, deck).

- [ ] **2. The problem** `[#5 · 10 pts]` — the three problems verbatim from the
      organizers' use case: requests are *missed* in a mixed inbox; manual
      comparison is *repetitive and error-prone*; the same field is *labelled
      differently* ("Port of Loading" vs "Load Port"). Quoting their framing back
      is the cheapest way to show we understood the brief.

- [ ] **3. Who it affects** `[#5]` — shipping ops staff reading every message;
      the carrier issuing the draft BL; the customer wearing the cost of a wrong
      BL. Name the stake: a missed discrepancy means corrections, delays, rework.

- [ ] **4. What DocuVerify does** — one sentence, then the organizers' four
      capabilities as four icons: **Classify · Extract · Compare · Ask for help**.

### Technical Architecture `[MANDATORY]`

- [ ] **5. The pipeline** `[#1 · 15 pts]` — the 5-stage flow diagram, left to
      right, with the JSON contract shown on each arrow. Source:
      `docuverify_5_stage_architecture.md`. This is the single most important
      slide in the deck.

- [ ] **6. Why it is cut this way** `[#1]` — the rubric wants architecture
      *"coherent, well justified"*, not just drawn. Justify: five frozen contracts
      let five people build in parallel and test against mocked upstream input;
      deterministic logic is isolated from probabilistic logic so failures are
      attributable. Cite the real seam: `ingest_email` reads attachments once,
      `extract_ingested_fields` consumes the parsed text — no double read.

- [ ] **7. Stack & integration** `[#3 · 15 pts]` — Next.js 16 / React 19 /
      Tailwind 4 / Base UI / Recharts frontend; FastAPI + Uvicorn backend;
      pypdfium2 + pytesseract + python-docx + openpyxl + pypdf for ingestion.
      **Say what each one earns us** — the rubric marks "superficial or cosmetic"
      integration as Weak. ⚠️ See §5 risk 1 before writing this slide.

### Implementation Details `[MANDATORY]`

- [ ] **8. Stage 3 — classification** `[#2 #4]` — 20 body regexes classify all
      520 emails with **zero fallbacks**; `test_pipeline.py` fails if one email
      falls through. Two findings that show real data understanding:
      **attachment presence predicts BL_COMPARISON with 100% precision**, and
      **subjects are deliberately misleading** so we classify on the body only.
      (`backend/data_prep/FINDINGS.md` §2a, §2c)

- [ ] **9. Stage 4 — ingestion** `[#2 #3]` — one code path for `.txt` / `.pdf` /
      `.docx` / `.xlsx`; OCR fires automatically on pages under 40 non-whitespace
      characters, so mixed digital/scanned PDFs work page by page. Failures return
      a status, never a crash. (`app/services/ingestion.py`, `attachment_text.py`)

- [ ] **10. Stage 5 — extraction & comparison** `[#2 #3]` — the headline
      engineering detail: **the same 7 fields appear under 64 different labels**,
      including bilingual CJK glosses (`毛重(KGS)`, `装货港`). Show the table. Then
      the two layout traps we hit and fixed: BL PDFs repeat `GROSS WEIGHT (KG)` as
      a per-container header so we take the **last** match; party fields keep only
      the **first line** or two different companies sharing an address look 90%
      alike. (`FINDINGS.md` §2d, §2f)

- [ ] **11. Human-in-the-loop** `[#6 · 10 pts]` — our differentiator. The system
      refuses to guess. Four explicit reasons — `wrong_doc_type`,
      `missing_attachment`, `unreadable`, `missing_value` — each escalated *with
      its source evidence*. Blank placeholders (`____MT`, `TBA`, `N/A`) route to
      `missing_value`, never to a false mismatch: that one rule alone turns 5
      false alarms into 5 correct review requests. (`FINDINGS.md` §2g)

- [ ] **12. The dashboard** `[#7 · 10 pts]` — screenshots: inbox queue, the
      side-by-side case view, audit trail. Argue the operational point — a script
      that prints JSON is not a tool an ops team can use; a queue they can work
      through is.

### Validation

- [ ] **13. Results** `[#4 · 15 pts]` — the numbers, framed as **precision**:
      - 520 emails classified, 0 unclassified
      - 129 comparison cases → 64 OK / 45 MISMATCH / 20 NEEDS_REVIEW
      - **45 mismatches inspected by hand, no false positives**
      - 20 planted edge cases land exactly **5/5/5/5** across the four review
        reasons — the strongest evidence the comparison logic is right
      - 71 defects by field (container_count 19 is the most common)

      ⚠️ **Do not put BERT validation accuracy on this slide.** 520 emails contain
      only 177 distinct templates and 15 byte-identical rows; the number is
      inflated by memorisation and a judge who asks one question will find that
      out. (`FINDINGS.md` §5 item 4)

### Challenges Faced `[MANDATORY]`

- [ ] **14. What was actually hard** `[#4]` — five real ones, each with its
      resolution. The rubric rewards *"important limitations are understood"*, so
      honesty scores better than a clean story:
      1. 64 label spellings across 7 fields, plus CJK — solved by normalise-then-match
         against ordered patterns (`NOTIFY` must be tested before `CONSIGNEE`, or
         `Notify Party/Intermediate Consignee` lands on the wrong field).
      2. The PDF per-container table header trap.
      3. Telling a *reading* failure apart from a *real* discrepancy — the
         placeholder rule.
      4. Misleading subjects forcing body-only classification.
      5. The **judgement call**: 91 emails (17% of the corpus) reading "please
         assist to send the draft BL for checking", no attachment. We label them
         `SI_REQUEST` because there is nothing to check. State it as a reasoned
         decision — the organizers explicitly say *"if your decision is reasonable,
         record the reason."* (Use Case PDF, p.4)

### Future Roadmap `[MANDATORY]`

- [ ] **15. Roadmap** `[#7]` — near term: Gmail OAuth ingestion so it runs on a
      live inbox; LLM extraction behind the existing deterministic layer;
      persistence for the audit log. Longer: the self-learning loop — human
      corrections become training examples behind a promotion gate that only
      accepts a candidate model beating the incumbent by a set F1 margin, with
      one-click rollback. Already prototyped at `/admin` as a simulation.
      ⚠️ Label it as a simulation on the slide. Do not imply it trains today.

- [ ] **16. Close** — one-line recap + the four links again.

---

## 4. Assets to produce

- [ ] Architecture diagram, rendered (not an ASCII block in a screenshot)
- [ ] Field-label table — the 64-spellings exhibit
- [ ] Dashboard screenshots ×3, seeded with realistic data, light mode
- [ ] Results chart — 64 / 45 / 20 outcome split + defects by field
- [ ] `POST /submit` score, if we have run it `(Flagged)`
- [ ] Decide deck branding — Averis orange `#E78823` + Lato, per the brand memory.
      The `Colour scheme.jpg` in `Refrence/` is a black/burgundy logo board for an
      unrelated project and should **not** drive this deck `(Flagged)`

---

## 5. Risks the deck cannot paper over

1. **⚠️ AI + cloud is a stated rule, and we currently satisfy neither.**
   *Rules & Regulations, p.2:* submissions **must** incorporate AI **and utilize
   cloud infrastructure**; solutions that do not *"meaningfully integrate cloud
   infrastructure may receive significantly reduced scores."*
   Today the working pipeline is **entirely deterministic** —
   `IMPLEMENTATION_SUMMARY.md:98` says so outright. `langchain` and
   `langchain-openai` are declared in `pyproject.toml` but **imported nowhere in
   `app/`**. Nothing is deployed.
   This is the highest-value fix available before the deadline and it is a
   *product* decision, not a slide decision. Options: wire one real LLM
   extraction call as the fallback path behind the deterministic extractor, and
   deploy the frontend somewhere public. `(Flagged)`

2. **No live prototype link.** Mandatory field on the form, and the rubric
   scores a slides-only core as Weak on the 25-point criterion. `(Flagged)`

3. **Backend tests fail on a fresh clone — 7 failed, 23 passed.** Every failure
   is `FileNotFoundError`: `app/core/config.py:16` defaults `bundle_dir` to
   `backend/resources/sdoc-hackathon-bundle`, but the bundle lives at the repo
   root and is untracked. A judge following our README hits this immediately.
   One-line fix. `(Flagged)`

4. **Judgement call #1 is unverified.** It moves 17% of the corpus and swings
   macro-F1 more than anything else. `POST /submit` is the only external check
   and is free to run. Do it before the deck quotes any accuracy figure.

5. **Repo is private.** The form wants a *public* link with a README containing
   setup instructions.

---

## 6. Sources

| What | Where |
|---|---|
| Deck's four required sections, submission structure, AI/cloud rule | `Slides/refrence/Averis x Monash Hackathon Rules and Regulations.pdf` |
| 7 criteria, point split, performance bands | `Slides/refrence/…Preliminary Judging Rubric.pdf` |
| Problem framing, 4 capabilities, advanced stage | `Refrence/Shipping Document Verification Use Case.pdf` |
| Timeline, prizes | `Slides/refrence/Averis Hackathon Participant Infopack.pdf` |
| Dataset numbers, label spellings, judgement calls | `backend/data_prep/FINDINGS.md` |
| 5-stage contracts and owners | `docuverify_5_stage_architecture.md` |
| What is actually built | `backend/IMPLEMENTATION_SUMMARY.md`, `backend/README.md` |
| Category + status schema | `sdoc-hackathon-bundle/README.md` |
| Feature coverage | `Slides/refrence/core-feature_checklist.md` |
