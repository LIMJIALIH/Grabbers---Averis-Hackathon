---
name: sdoc-classify
description: Classify shipping-operations emails into the 5 SDOC categories (BL_COMPARISON, SI_REQUEST, INVOICE_QUERY, GENERAL, SPAM). Use when labelling the DocuVerify / SDOC hackathon inbox by LLM instead of the rule pipeline or the fine-tuned BERT — for emails the rules do not match, for auditing existing labels, or as the fallback classifier if BERT underperforms. Also use when asked to classify a single incoming email at inference time.
---

# SDOC email classification

Fallback for `backend/data_prep/build_dataset.py`, which classifies the 520-email bundle
by regex. Use this when an LLM must do the same job: new emails the rules miss,
auditing, or replacing BERT.

**Produce the same labels the rules produce.** This procedure is written to be
deterministic — same email in, same label out. Do not improvise categories.

## Categories

| id | category | meaning |
|---|---|---|
| 0 | `BL_COMPARISON` | Asks someone to check a draft BL against an SI. **Only these continue to the comparison step.** |
| 1 | `SI_REQUEST` | Supplies or requests shipping-instruction / draft-BL paperwork for a specific shipment. |
| 2 | `INVOICE_QUERY` | Anything about money: invoices, charges, GR postings, credit notes. |
| 3 | `GENERAL` | Operational notices, reports, automated messages, greetings. No action on a specific document. |
| 4 | `SPAM` | Unsolicited commercial mail, phishing, advance-fee fraud, prize scams. |

## Two hard rules

**1. Classify on the body, never the subject.** Subjects in this corpus are
deliberately misleading — the brief lists this as an intentional difficulty. A
subject reading `RE_ TO CONFIRM DOCS … SIN525534192` sits on a body asking about a
completely different booking. Subject shapes are shared across categories and
carry no separating signal.

**2. Ignore quoted reply chains.** 37% of bodies carry a trailer after `______`
or `From: … Sent: … Subject:`. Its content is always filler ("Please follow the
previous instruction"). Classify on the *top* message only.

## Decision procedure — stop at the first match

Work down this list in order. Order is the priority; earlier wins.

**1 → SPAM.** Prize draws, gift cards, "weird trick", unpaid-customs-fee
demands, mailbox-storage phishing, advance-fee / bank-officer proposals,
discounted-software promos. Check this first — spam can mention shipping terms.

**2 → BL_COMPARISON.** The sender is asking for a check *of documents they are
referring to as present*:
- "Attached are the SI and draft BL…"
- "attached the shipping instruction and the draft bill of lading…"
- "check the draft BL against the SI"
- "Please compare the SI and draft BL for X"
- "Kindly confirm the BL is in order"

Applies **even when the attachments are missing or unreadable** — those become
`NEEDS_REVIEW`, not a different category. The category describes the request; the
status describes whether it could be fulfilled.

**3 → SI_REQUEST.**
- "Please find Shipping instruction for X" followed by inline POL/POD/Shipper details
- "Please assist to send the draft BL for X for checking asap" *(see judgement call below)*

**4 → INVOICE_QUERY.** GR still missing, THC / local charge breakdown, D&D or
detention charges, invoice cancellation and PGI reversal.

**5 → GENERAL.** Automated / RPA notifications, berthing reports, outstanding-BL
lists, bulk "please submit SI" reminders, loading summaries, seasonal greetings.

**6 → no match.** Fall back to `GENERAL` if there are no attachments,
`BL_COMPARISON` if there are. Then **flag it** — on the original 520 nothing
reaches this branch, so hitting it means the email is genuinely new.

## Settled judgement calls — follow these, do not re-litigate

| Case | Label | Reason |
|---|---|---|
| "Please assist to send the draft BL for X for checking asap", **no attachment** | `SI_REQUEST` | Only comparison requests continue to the checking step; there is nothing here to check. 91 emails move together on this. |
| "Reminder: please submit SI & AED for all pending shipments" | `GENERAL` | Bulk reminder, not a shipment-specific request. |
| Legible but image-only scanned attachments | `BL_COMPARISON` + `NEEDS_REVIEW / unreadable` | Category is unaffected by readability. |

## Structural signal the text does not carry

**Every email with an attachment is `BL_COMPARISON` — 126 of 126, 100% precision.**
The only comparison requests without attachments are the 3 that say outright the
files were dropped in transit.

**The body decides the category; the attachment list only confirms it.** These
cannot disagree on real data — every attachment-bearing email also carries a
comparison phrase in its body. If you ever see them disagree, the body wins and
the email is worth flagging as genuinely new.

A text-only classifier (BERT) cannot use this signal at all, which is the main
reason a rule layer should sit in front of the model.

## Output

One JSON object keyed by `email_id`, matching `sample_submission.json`. Every
email in the dataset must appear.

```json
{
  "email_004": {
    "category": "BL_COMPARISON",
    "status": "MISMATCH",
    "review_reason": null,
    "has_defect": true,
    "defect_fields": ["consignee", "notify_party"]
  }
}
```

For non-`BL_COMPARISON` emails: `status` is `"OK"`, `review_reason` is `null`,
`has_defect` is `false`, `defect_fields` is `[]`.

**Which shape to emit:**

- Asked for a submission, or asked to process `BL_COMPARISON` emails end to end →
  the full object above. Run the status decision tree even if the request only said
  "classify".
- Asked only to label categories, or told comparison is out of scope → emit
  `email_id`, `category`, `label_id`, and a short `why` quoting the phrase that
  decided it. Nothing else.
- Unsure → emit the full object. The extra fields are harmless; missing ones are not.

Always include `why`. The quote makes a batch auditable — without it, a wrong
label is unfindable in a run of 500.

## Which attachment is the SI and which is the BL

Never trust the filename. The bundle happens to name files `*_SI.txt` / `*_BL.txt`,
but live mail arrives as `draft bl final.pdf`, `SI 5ALT-01226.xlsx`, or `scan002.pdf`.
Decide by **content**, reading the first few lines:

| Contains | Role |
|---|---|
| `SHIPPING INSTRUCTION`, `BL INSTRUCTION`, `BILL OF LADING INSTRUCTION` | SI |
| `BILL OF LADING` (and *not* the instruction variants above) | BL |
| `PACKING LIST`, `COMMERCIAL INVOICE`, `CERTIFICATE OF ORIGIN`, `DELIVERY ORDER` | neither → `wrong_doc_type` |

Note the trap: "BILL OF LADING **INSTRUCTION**" is an SI, not a BL — it is the
instruction to *produce* a BL. Test for the instruction variants first.

If you cannot identify one of each role, the case is `NEEDS_REVIEW`, not a guess.
`backend/data_prep/build_dataset.py:is_doc()` implements exactly this.

## If you are also running the comparison

Don't reimplement it. `backend/data_prep/fields.py` already handles 64 label spellings
across the 7 fields, bilingual CJK glosses, four file layouts, and the PDF trap
where bills of lading repeat `GROSS WEIGHT (KG)` per container row before the
total. Import `parse`, `canon` and `same` from it.

The status decision tree, in order:

1. SI or BL file absent → `NEEDS_REVIEW / missing_attachment`
2. Either file yields no text → `NEEDS_REVIEW / unreadable`
3. Either file is the wrong document (Packing List, Commercial Invoice, Certificate of Origin) → `NEEDS_REVIEW / wrong_doc_type`
4. Any of the 7 fields missing on either side → `NEEDS_REVIEW / missing_value`
5. Otherwise compare → `MISMATCH` with `defect_fields`, or `OK`

The 7 fields: `shipper`, `consignee`, `notify_party`, `port_of_loading`,
`port_of_discharge`, `container_count` (int), `gross_weight_kg` (float).
The SI is the source of truth; report differences as "BL differs from SI on X".

**Blank placeholders are missing, not mismatched.** `____MT`, `_______ MTS`,
`???`, `TBA`, `N/A` mean the customer left the field blank → `missing_value`.
Treating them as values turns 5 review cases into 5 false alarms.

**Compare party names, not address blocks.** Take the first line only. `EAST
BRIGHT FZ-LLC` and `UAB NOVAKOPA` share an address — keep the address and a real
defect gets swallowed by the similarity check.

## Sanity check

Against the original 520-email bundle this procedure must reproduce:

```
SI_REQUEST 216 | BL_COMPARISON 129 | INVOICE_QUERY 75 | GENERAL 60 | SPAM 40
OK 455 | MISMATCH 45 | NEEDS_REVIEW 20
review_reason: 5 each of wrong_doc_type / missing_attachment / unreadable / missing_value
```

The 5/5/5/5 symmetry is the tell that the review logic is right — the organizers
planted exactly five of each. If your run is lopsided, the bug is in the status
tree, not the classifier.
