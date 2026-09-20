# DocuVerify Resource (reference file for all project tasks)

Averis x Monash Hackathon 2026. Working branch: `Data_Prep`.
Sources summarised here: the team submission doc, the DocuVerify proposal, the architecture drawio, the GitHub repo, the v0 frontend link, and the rubric link (see "Not readable").

## 1. Problem and solution
- **Problem:** Shipping ops teams manually read emails, spot document-check requests, and compare Shipping Instructions (SI) against draft Bills of Lading (BL). It is slow, error-prone, and formats vary ("Load Port" vs "Port of Loading").
- **Solution (DocuVerify):** Pipeline that classifies incoming emails, extracts 7 fields from SI and BL, compares them, and escalates uncertain cases to a human-in-the-loop (HITL) dashboard.
- **SI vs BL:** SI is the shipper's request and the source of truth. The carrier issues the draft BL from it. The BL must trace back to the SI. Report mismatches as "BL differs from SI on field X".
- **7 fields:** shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count (int), gross_weight_kg (float).

## 2. Submission (deadline 22 Sep 2026, 12 pm, via Google Form https://forms.gle/nnam5eXrf5cjXdf3)
All unchecked as of 20 Sep 2026:
- [ ] **Project description:** brief summary with name, purpose and problem statement.
- [ ] **Demo video (Drive or YouTube), max 5 min 29 s** (each extra 30 s costs 1 mark). Order: quick intro (team + project name), the problem (who it affects, why it matters), tech stack, live demo of the working prototype, impact (metrics, results, user feedback).
- [ ] **GitHub repo link.** It must include a README with setup instructions.
- [ ] **Deployed project link.** None exists yet.
- [ ] **Slide deck.** Must include technical architecture, implementation details, challenges faced and future roadmap.

## 3. Architecture

### 3a. Proposal pipeline (Stages 1-5)
1. **Intent classifier:** LLM call or fine-tuned classifier into DOCUMENT_COMPARISON, NEW_SI_REQUEST, INVOICE_QUERY, GENERAL, SPAM. Non-comparison requests are logged and skipped.
2. **Multi-modal ingestion:** plain text/docx go to Docling or pdfplumber. Scanned or image PDFs go to a vision LLM (e.g. Gemini) that preserves table structure.
3. **Schema-enforced extraction:** Instructor + Pydantic force JSON for the 7 fields, plus confidence scores and source text spans.
4. **Normalization and comparison:** Pint for units (lbs/tons to kg), RapidFuzz for party names and port aliases. Output "No mismatch detected", or `SI: [val] / BL: [val]` per mismatch.
5. **HITL gateway:** if confidence < 0.85, or a document is unreadable or a field is missing, flag it. The operator sees the source document and the AI's guess side by side, corrects it, and clicks "Approve & Submit". Everything ends at the JSON output evaluator, then `POST /submit`.

Stack: Next.js + Tailwind + shadcn UI + React-PDF (frontend); Python FastAPI, Instructor, LiteLLM (Gemini/others), Docling, pdfplumber, RapidFuzz, Pint (backend).

### 3b. Team drawio diagram ("Grabbers - Averis Hackathon.drawio", decoded)
- **User login with email (Google OAuth + Gmail API).** Treated as an *extra feature*: in industry the system would keep receiving email rather than using a fixed local email set.
- **Fetch user emails.**
- **LLM or fine-tuned classifier** categorizes each email into general / spam / SI / etc.
- **HITL and email resend.** Assume everything is a PDF first. Extract the attachment content into something machine-readable (use OCR).
- **Feed to LLM to extract the required fields.** Can run two models (one Gemini, one GPT) to avoid hallucination.
- **Field value normalization and cleaning.**
- **Generate report.**
- **Sidebar design:** Overview = main user workspace. Verification Inbox = where emails are stored after HITL. Documents = attachments of emails whose status is still pending. Audit Trail = every user action with timestamps (who reviewed which email, when it was approved).
- Name labels on the diagram (meaning unclear, possibly task owners): "Cheng", "JL", "Kaihern", "P4", "P5", next to "Data Preprocessing".

## 4. Repo and frontend
- **GitHub:** https://github.com/LIMJIALIH/Grabbers---Averis-Hackathon (PRIVATE, default branch `main`). Local branch `Data_Prep` is not on `origin` (only `origin/main`).
- **v0 frontend:** https://v0.app/limjialihs-projects/chat/maritime-document-verification-dashboard-uFGNKcpkLzr (login-gated, contents not readable from here).
- **Layout:** `frontend/` (Next.js dashboard; demo data only), `backend/` (FastAPI scaffold, only `GET /api/v1/health`), `DocuVerify Hackathon Proposal.md`. See `README.md` and `frontend/FRONTEND.md`.
- **Not built:** classification, extraction, comparison, persistence, auth, `/submit` integration.
- The organizers' bundle (`backend/resources/sdoc-hackathon-bundle`, `sdoc-hackathon-docker`) is missing from the checkout. Its schema uses `BL_COMPARISON`, `SI_REQUEST`, etc., which differ from the proposal's labels. Use the organizers' names.

## 5. Data and ML notes
- Dataset ~500 emails (unconfirmed).
- 5 classes with numeric labels: BL_COMPARISON=0, SI_REQUEST=1, INVOICE_QUERY=2, GENERAL=3, SPAM=4 (check spellings against the bundle schema).
- Joining query: join emails to their attachments (meaning unconfirmed).
- Attachment encoding (Microsoft): handle .docx, Outlook .msg, winmail.dat (meaning unconfirmed).
- Random sampling of the dataset (seed it; consider per-class balance).
- New entries (incoming emails) are inference only, never added to training/labeled data.
- Gmail API needs OAuth 2.0 (scope `gmail.readonly`); keep `credentials.json` and `token.json` out of git.

## 6. Pending work
- Settle the slides. An empty Slides artifact exists: https://claude.ai/artifact/FQMA7GaVzFpdTFNZMuJvmM (private, no content yet).
- Better frontend design.
- Everything in section 2.

## 7. Not readable (as of 20 Sep 2026)
- **Judging rubric doc** (`1EiI_mqJYeMN0D-dtZ_npCavVGXVcePFmcZ7O4d4ygQI`): the Drive read returned an empty result (possibly image-only content or a permissions issue). The submission doc also says "Important Note for Judging Criteria" with an image, which was not readable. The proposal's own criteria table lists Working Core Prototype 25, System Design 15, Technology Integration 15, Technical Feasibility 15, Innovation 10, Problem Understanding 10, Practical Value 10 (total 100). Confirm against the real rubric.
- **v0 chat:** needs a login.
