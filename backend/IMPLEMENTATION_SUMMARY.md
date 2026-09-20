# Implementation Summary

This document describes the current backend document-comparison and LLM-verification workflow. The deterministic extractor produces SI/BL field candidates; the LLM layer independently checks those candidates against source evidence. It does not replace SI/BL comparison.

## Current status

Implemented:

- Attachment extraction for TXT, XLSX, DOCX, and text-layer PDFs.
- Deterministic extraction and normalization of seven SI/BL fields.
- Bundle-level extraction export.
- OCR recovery for scanned PDFs, including rendered evidence images and per-field confidence.
- Independent OpenAI verifier adapters (two models) with structured evidence responses.
- Model-C adjudication on genuine A/B disagreements, using the OpenAI API with a different model.
- HITL queue with source evidence and reason; a person can confirm or correct a field, then the comparison report refreshes from that decision.
- Pre-routing, HITL routing, field-level decisions, audit output, and batch metrics.

Not yet implemented:

- A dashboard UI wired to the HITL API; operators can use the review API or apply_hitl.py until that is connected.
- Automatic repair for malformed PDFs. They are recorded as `ocr_failed` and remain in HITL/OCR recovery.

## Core extraction pipeline

### Attachment text extraction

[`app/services/attachment_text.py`](app/services/attachment_text.py) extracts readable text from `.txt`, `.xlsx`, `.docx`, and text-layer `.pdf` files. A scanned PDF with no readable text becomes `error: "ocr_needed"` in the first export; it is not silently treated as blank.

### Seven-field candidate extraction

[`app/services/document_fields.py`](app/services/document_fields.py) extracts:

- Shipper
- Consignee
- Notify Party
- Port of Loading
- Port of Discharge
- Container Count
- Gross Weight (kg)

It recognizes aliases such as `POL`, `POD`, `P/D`, and `Gross Wt`, then normalizes whitespace, container counts, and weight units. The original `confidence` is an SI/BL comparison score, **not** an LLM confidence or probability:

| Score | Meaning |
|---:|---|
| 100 | SI and BL normalized values match |
| 70 | Both values exist but differ |
| 60 | Only one side has a value |
| 0 | Both sides are blank |

### Initial bundle export

[`scripts/export_extractions.py`](scripts/export_extractions.py) reads `resources/inbox`, resolves safe paths under `resources/attachments`, extracts attachment text, and writes the baseline JSON export.

## LLM checker

### Design

The checker is evidence-grounded and fail-closed:

1. [`scripts/plan_llm_verification.py`](scripts/plan_llm_verification.py) routes every field before any provider call.
2. Two OpenAI models receive the same batched document request independently; neither sees the other verifier's response.
3. Each verifier confirms the requested label and candidate value, supplies source quote/location, and returns `verified`, `incorrect`, `mislabeled`, `not_found`, `ambiguous`, or `unreadable`.
4. [`app/services/llm_verification.py`](app/services/llm_verification.py) makes deterministic decisions. Mixed A/B verdicts go to Model-C, not silent approval. Agreed missing/unreadable/ambiguous cases stay in HITL.
5. Model-C reuses `DOCUVERIFY_OPENAI_API_KEY` with `DOCUVERIFY_OPENAI_ADJUDICATOR_MODEL` (default `gpt-5.4`, distinct from A and B). It only runs on disputed field-sides and must cite source evidence. Incomplete C remains HITL.
6. [`scripts/run_llm_verification.py`](scripts/run_llm_verification.py) writes the audit. It sends only `dual_side` and `single_side` records and requires an explicit `--live` flag.

Provider adapters are in [`app/integrations/llm_verifiers.py`](app/integrations/llm_verifiers.py). Keep credentials only in local `.env`:

- `DOCUVERIFY_OPENAI_API_KEY` / `DOCUVERIFY_OPENAI_VERIFIER_MODEL` (A, default `gpt-5.4-mini`)
- `DOCUVERIFY_OPENAI_VERIFIER_B_MODEL` (B, default `gpt-4.1-mini`; same OpenAI key, different model)
- `DOCUVERIFY_OPENAI_ADJUDICATOR_MODEL` (C, default `gpt-5.4`; same OpenAI key, different from A and B)

Use [`.env.example`](.env.example) as the safe template. `.env` is Git-ignored and must never be committed.

### Pre-routing rules

| Condition | Route | Provider call? |
|---|---|---|
| SI or BL attachment missing | `hitl` / `missing` | No |
| Both values blank after clean extraction | `hitl` / `missing` | No |
| PDF unreadable or `ocr_needed` | `ocr_recovery` | No, until OCR succeeds |
| One side cleanly blank but its attachment exists | `single_side` | Verify the present side with both models |
| Both values present | `dual_side` | Verify SI and BL with both models |

A verified `single_side` value becomes `document_mismatch`, not an extraction error. A **missing attachment** always goes to HITL.

### OCR recovery and image evidence

[`app/services/ocr_recovery.py`](app/services/ocr_recovery.py) renders scanned PDF pages with PDFium, runs Tesseract OCR, saves the page PNG, and records recovered text, page confidence, and per-field confidence. [`scripts/recover_ocr_extractions.py`](scripts/recover_ocr_extractions.py) applies this to every `ocr_needed` PDF.

If a field's OCR confidence is below the plan threshold (default `85`), `requires_source_image` is `true`. Both verifiers receive the original page image and OCR text, preventing agreement on the same OCR misread. Malformed PDFs are stored as `ocr_failed: <exception>` and do not stop the rest of the batch.

## `backend/exports` artifact relationship

Exports are sequential handoffs. Use the OCR-enriched extraction for all later LLM stages.

```text
resources/inbox + resources/attachments
             |
             v
attachment_extraction.json
             |
             |  recover_ocr_extractions.py
             v
attachment_extraction_ocr.json + exports/ocr_pages/
             |
             |  plan_llm_verification.py
             v
llm_verification_plan.json
             |
             |  run_llm_verification.py --live
             v
llm_verification_audit.json
             |
             |  report_llm_verification.py
             v
llm_verification_metrics.json
```

| File/directory | Created by | Purpose |
|---|---|---|
| `attachment_extraction.json` | `export_extractions.py` | Baseline attachment text, errors, and deterministic seven-field SI/BL candidates. |
| `attachment_extraction_ocr.json` | `recover_ocr_extractions.py` | Baseline export enriched with recovered PDF text and OCR metadata. |
| `ocr_pages/<email>/<attachment>/page_N.png` | `recover_ocr_extractions.py` | Local visual evidence sent only when a field requires original-page evidence. |
| `llm_verification_plan.json` | `plan_llm_verification.py` | No-cost plan: raw/normalized candidates, rules applied, route, reason, and image requirement. |
| `llm_verification_audit.json` | `run_llm_verification.py` | Provider verdicts/evidence, final decision, suggested resolution, and HITL flag. |
| `llm_verification_metrics.json` | `report_llm_verification.py` | Aggregate decision/route counts, approval rate, and human-review queue. |

Generated exports, page images, attachments, and local credentials are ignored by Git.

## Current bundle progress

On the most recent OCR run against the supplied bundle:

- 8 PDF attachments were attempted;
- 6 attachments were recovered (`email_512`, `email_513`, `email_514`, SI and BL pairs);
- 2 malformed PDFs were recorded as `ocr_failed: PdfiumError`;
- the plan routes 805 fields as `dual_side`, 45 as `single_side`, 18 directly to HITL, and 14 to remaining OCR recovery;
- 23 fields require page-image evidence because their field confidence is below threshold.

These generated-data counts change when the bundle or OCR threshold changes.

## How to run

From `backend/`:

```bash
# 1. Baseline deterministic extraction
.venv/bin/python scripts/export_extractions.py \
  --bundle-dir resources \
  --output exports/attachment_extraction.json

# 2. Recover scanned PDFs and persist visual evidence
.venv/bin/python scripts/recover_ocr_extractions.py \
  exports/attachment_extraction.json \
  --bundle-dir resources \
  --output exports/attachment_extraction_ocr.json

# 3. Make the no-cost routing plan
.venv/bin/python scripts/plan_llm_verification.py \
  exports/attachment_extraction_ocr.json \
  --output exports/llm_verification_plan.json

# 4. Controlled live calibration; only eligible documents count toward --limit
.venv/bin/python scripts/run_llm_verification.py \
  exports/llm_verification_plan.json \
  exports/attachment_extraction_ocr.json \
  --limit 20 --live \
  --output exports/llm_verification_audit.json

# 5. Summarize decisions and the HITL queue
.venv/bin/python scripts/report_llm_verification.py \
  exports/llm_verification_audit.json

# 6. Export review items (evidence + reason) and render reports
.venv/bin/python scripts/export_hitl_queue.py exports/llm_verification_audit.json
.venv/bin/python scripts/render_verification_report.py exports/llm_verification_audit.json

# 7. Person confirms or corrects one field, then the report refreshes
.venv/bin/python scripts/apply_hitl.py exports/llm_verification_audit.json \
  --email-id email_001 --key consignee --action confirm \
  --note "SI and BL both show the same consignee."
```

Run focused deterministic tests with:

```bash
.venv/bin/python -m pytest tests/test_llm_verification.py tests/test_hitl.py -q
```

Before a full live run, inspect the calibration audit for evidence quality, `needs_review` rate, `document_mismatch` results, and provider errors. Never auto-approve `ocr_failed`, HITL, or disagreement cases.
