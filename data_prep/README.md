# data_prep — labelling the SDOC inbox

```bash
python data_prep/build_dataset.py      # -> data_prep/out/
python data_prep/test_pipeline.py      # self-check, must print "ok: 520 emails"
```

Outputs in `data_prep/out/`:

| file | what |
|---|---|
| `dataset.csv` | 520 rows, one per email. BERT training set **and** the SI/BL comparison table. |
| `submission.json` | the organisers' format, every email_id present. |
| `holdout/` | the 20 held-out emails + their attachments, for hand-checking. |

## dataset.csv columns

`email_id, split, category, label_id, rule` — label plus the rule that produced it.
`from, subject, body, bert_text` — `bert_text` (subject + body) is the classifier input.
`n_attachments, has_attachments, si_file, bl_file, si_text, bl_text` — attachments parsed to text.
`si_<field>` / `bl_<field>` for the 7 compared fields, canonicalised (ints, floats, normalised names).
`status, review_reason, has_defect, defect_fields` — the comparison verdict.

`label_id`: BL_COMPARISON=0, SI_REQUEST=1, INVOICE_QUERY=2, GENERAL=3, SPAM=4.

## Why rules and not an LLM

The 520 bodies come from ~20 templates. Twenty regexes in `build_dataset.py:RULES`
label all of them, every row carries the `rule` that fired, and `test_pipeline.py`
fails if any email falls through to a fallback. No LLM call, no rate limit, rerunnable
in two seconds. Spend the model budget on auditing `holdout/` instead.

## Two labels that were judgement calls, now decided

- `si_draft_bl_req` (91 rows, 17% of the set): *"Please assist to send the draft BL
  for X for checking asap"*, no attachment. **Decided: `SI_REQUEST`.** The official
  brief says only document-comparison requests continue to the checking step, and
  these have nothing to check. Their subjects often look like comparison threads —
  the brief lists "misleading email subjects" as a deliberate difficulty, so the
  body is the source of truth. Revisit only if the self-evaluation disagrees.
- `gen_outstanding` (21 rows): *"Reminder: please submit SI & AED"* called `GENERAL`,
  not `SI_REQUEST`, because it is a bulk reminder rather than a shipment-specific request.

- `email_512/513/514` are image-only scans that OCR *could* read. **Decided: leave them
  `NEEDS_REVIEW / unreadable`** rather than build an OCR path for 3 of 520 emails.
  The brief's reliability axis asks for exactly this when a document cannot be read.

## Attachments

No OCR: all 250 attachments are digital text (`.txt`, ReportLab `.pdf`,
`.xlsx`, `.docx`) — except `email_512/513/514` SI+BL, which are image-only scans, and
`email_511_BL` / `email_515_BL`, which are corrupt. `extract.py` returns `""` for all
six; they become the 5 planted `unreadable` cases. Not a parser bug.
