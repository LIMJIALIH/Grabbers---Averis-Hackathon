"""SDOC bundle -> one labelled CSV (BERT fine-tuning + SI/BL comparison) + submission.json.

The inbox is template-generated, so classification is rules, not an LLM: every rule
below was read off a body-template cluster of the 520 emails. `rule` is written to
the CSV so any row's label can be traced back to the rule that produced it.

    python backend/data_prep/build_dataset.py [--bundle PATH] [--out PATH]
"""
import argparse, csv, json, random, re, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract import extract
from fields import FIELDS, canon, parse, same

LABEL_ID = {"BL_COMPARISON": 0, "SI_REQUEST": 1, "INVOICE_QUERY": 2, "GENERAL": 3, "SPAM": 4}

# (rule name, category, body regex) -- first match wins, so order is the priority.
RULES = [
    ("spam_prize",      "SPAM", r"monthly draw|gift card|brand new iPhone|weird trick"),
    ("spam_phish",      "SPAM", r"unpaid customs fee|exceeded its storage limit|avoid deactivation"),
    ("spam_advance_fee","SPAM", r"bank officer with an urgent|business proposal involving USD"),
    ("spam_promo",      "SPAM", r"logistics automation suite|LIMITED TIME OFFER"),
    ("cmp_attached",    "BL_COMPARISON", r"Attached (are the )?SI and (the )?draft BL"),
    ("cmp_attached2",   "BL_COMPARISON", r"attached the shipping instruction and the draft bill"),
    ("cmp_check",       "BL_COMPARISON", r"check the draft BL against the SI"),
    ("cmp_compare",     "BL_COMPARISON", r"compare the SI and draft BL"),
    ("cmp_confirm_bl",  "BL_COMPARISON", r"Kindly confirm the BL is in order"),
    ("si_inline",       "SI_REQUEST", r"Please find Shipping instruction for"),
    ("si_draft_bl_req", "SI_REQUEST", r"assist to send the draft BL"),
    ("inv_gr",          "INVOICE_QUERY", r"GR is still missing"),
    ("inv_thc",         "INVOICE_QUERY", r"THC / local charge"),
    ("inv_dd",          "INVOICE_QUERY", r"D&D / detention charges"),
    ("inv_cancel",      "INVOICE_QUERY", r"cancel invoice"),
    ("gen_outstanding", "GENERAL", r"list of outstanding BL|Reminder: Please submit SI"),
    ("gen_berthing",    "GENERAL", r"berthing report"),
    ("gen_rpa",         "GENERAL", r"automated notification"),
    ("gen_summary",     "GENERAL", r"update summary for"),
    ("gen_greeting",    "GENERAL", r"happy and prosperous New Year"),
]
WRONG_DOC = r"PACKING LIST|COMMERCIAL INVOICE|CERTIFICATE OF ORIGIN|DELIVERY ORDER"


def classify(email):
    body = email["body"]
    for name, cat, pat in RULES:
        if re.search(pat, body, re.I):
            return cat, name
    if email.get("attachments"):
        return "BL_COMPARISON", "fallback_has_attachments"
    return "GENERAL", "fallback_default"


def is_doc(text, kind):
    """Does this text look like the SI / BL it was attached as?"""
    head = "\n".join(text.splitlines()[:6]).upper()
    if re.search(WRONG_DOC, head):
        return False
    if kind == "SI":
        return bool(re.search(r"SHIPPING INSTRUCTION|B/?L INSTRUCTION|BILL OF LADING INSTRUCTION", text.upper()))
    return bool(re.search(r"BILL OF LADING", text.upper())) and not re.search(
        r"BILL OF LADING INSTRUCTION|BL INSTRUCTION", head)


def compare(si, bl):
    """-> (status, review_reason, defect_fields)."""
    missing = [f for f in FIELDS if si.get(f) is None or bl.get(f) is None]
    if missing:
        return "NEEDS_REVIEW", "missing_value", []
    bad = [f for f in FIELDS if not same(si[f], bl[f])]
    return ("MISMATCH", None, bad) if bad else ("OK", None, [])


def build(bundle, out_dir, holdout_n, seed):
    bundle, out_dir = Path(bundle), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []

    for f in sorted(bundle.glob("inbox/*.json")):
        e = json.loads(f.read_text(encoding="utf-8"))
        cat, rule = classify(e)
        atts = e.get("attachments") or []
        slot = {k: next((bundle / a for a in atts if f"_{k}." in a), None) for k in ("SI", "BL")}
        text = {k: extract(p) if p else "" for k, p in slot.items()}
        raw = {k: parse(t) for k, t in text.items()}
        vals = {k: {fl: canon(fl, d.get(fl)) for fl in FIELDS} for k, d in raw.items()}

        status, reason, defects = "OK", None, []
        if cat == "BL_COMPARISON":
            if not slot["SI"] or not slot["BL"]:
                status, reason = "NEEDS_REVIEW", "missing_attachment"
            elif not text["SI"] or not text["BL"]:
                status, reason = "NEEDS_REVIEW", "unreadable"
            elif not is_doc(text["SI"], "SI") or not is_doc(text["BL"], "BL"):
                status, reason = "NEEDS_REVIEW", "wrong_doc_type"
            else:
                status, reason, defects = compare(vals["SI"], vals["BL"])

        row = {
            "email_id": e["email_id"], "split": "train",
            "category": cat, "label_id": LABEL_ID[cat], "rule": rule,
            "from": e.get("from", ""), "subject": e["subject"], "body": e["body"],
            "bert_text": f"{e['subject']}\n{e['body']}".strip(),
            "n_attachments": len(atts), "has_attachments": bool(atts),
            "si_file": slot["SI"].name if slot["SI"] else "",
            "bl_file": slot["BL"].name if slot["BL"] else "",
            "si_text": text["SI"], "bl_text": text["BL"],
            "status": status, "review_reason": reason or "",
            "has_defect": status == "MISMATCH",
            "defect_fields": "|".join(defects),
        }
        for k in ("si", "bl"):
            for fl in FIELDS:
                v = vals[k.upper()][fl]
                row[f"{k}_{fl}"] = "" if v is None else v
        rows.append(row)

    # stratified holdout, seeded. The planted edge cases (501-520) stay in train:
    # they are the only examples of each review_reason and are worth more there.
    rng = random.Random(seed)
    pool = {}
    for r in rows:
        if int(r["email_id"].split("_")[1]) <= 500:
            pool.setdefault(r["category"], []).append(r)
    per = max(1, holdout_n // len(pool))
    for cat, rs in pool.items():
        for r in rng.sample(rs, min(per, len(rs))):
            r["split"] = "holdout"

    # holdout copy: json + attachments, so the 20 can be eyeballed without the CSV
    hold = out_dir / "holdout"
    shutil.rmtree(hold, ignore_errors=True)
    hold.mkdir()
    for r in rows:
        if r["split"] != "holdout":
            continue
        shutil.copy(bundle / "inbox" / f"{r['email_id']}.json", hold)
        for k in ("si_file", "bl_file"):
            if r[k]:
                shutil.copy(bundle / "attachments" / r[k], hold)

    def dump(name, subset):
        with (out_dir / name).open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(subset)

    dump("dataset.csv", rows)                                        # full record
    dump("train.csv", [r for r in rows if r["split"] == "train"])    # -> the BERT teammate
    dump("test.csv", [r for r in rows if r["split"] == "holdout"])            # sealed
    (out_dir / "submission.json").write_text(json.dumps({
        r["email_id"]: {"category": r["category"], "status": r["status"],
                        "review_reason": r["review_reason"] or None,
                        "defect_fields": defs.split("|") if (defs := r["defect_fields"]) else [],
                        "has_defect": r["has_defect"]} for r in rows}, indent=2), encoding="utf-8")
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", type=Path, default=Path(__file__).resolve().parents[1] / "resources" / "sdoc-hackathon-bundle")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "out")
    ap.add_argument("--holdout", type=int, default=20)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    rows = build(a.bundle, a.out, a.holdout, a.seed)

    import collections
    print(f"{len(rows)} emails -> {a.out}/dataset.csv")
    for k, v in collections.Counter(r["category"] for r in rows).most_common():
        print(f"  {k:<15} {v}")
    print("status:", dict(collections.Counter(r["status"] for r in rows)))
    print("review:", dict(collections.Counter(r["review_reason"] for r in rows if r["review_reason"])))
    print("holdout:", sum(r["split"] == "holdout" for r in rows))
