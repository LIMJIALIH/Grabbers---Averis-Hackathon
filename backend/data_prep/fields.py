"""Pull the 7 compared fields out of an SI or BL, whatever layout it arrived in.

Three layouts appear in the bundle and one scanner handles all of them:
  txt   "Port of Loading (POL): SINGAPORE"
  xlsx  "Port of Loading (POL) | SINGAPORE"
  pdf/docx   "PORT OF LOADING" then the value on the following line(s)
"""
import re
from difflib import SequenceMatcher

FIELDS = ["shipper", "consignee", "notify_party", "port_of_loading",
          "port_of_discharge", "container_count", "gross_weight_kg"]
PARTY = FIELDS[:3]

# cleaned label -> field, first match wins (NOTIFY must beat CONSIGNEE).
# Cleaning strips CJK glosses and parentheticals, so "Gross Wt (kgs) (毛重)" -> "GROSS WT".
LABEL_PATTERNS = [
    (r"^(TOTAL )?GROSS (WEIGHT|WT)", "gross_weight_kg"),
    (r"^(TOTAL |NO OF )?CONTAINERS?( COUNT| OR PACKAGES)?$", "container_count"),
    (r"^NOTIFY", "notify_party"),
    (r"^(SHIPPER|EXPORTER)", "shipper"),
    (r"^(CONSIGNEE|TO THE ORDER OF)", "consignee"),
    (r"^(PORT OF LOADING|LOAD(ING)? PORT|POL)$", "port_of_loading"),
    (r"^(PORT OF DISCHARGE|DISCHARGE PORT|POD)$", "port_of_discharge"),
]


def field_of(label):
    return next((f for pat, f in LABEL_PATTERNS if re.match(pat, label)), None)


# colon-less headers that must still end a multi-line value
STOPS = {"CONTAINER NO", "DESCRIPTION", "VESSEL", "VOYAGE", "COMMODITY",
         "EXPORT CARRIER", "MARKS AND NUMBERS", "PLACE OF DELIVERY",
         "PLACE OF RECEIPT", "FREIGHT", "BILL OF LADING DRAFT",
         "SHIPPING INSTRUCTION", "BL INSTRUCTION"}


# values that mean "the customer left this blank" -> missing_value, not a mismatch
BLANK = re.compile(r"^(?:[_?\-\s]+|TBA|N\.?/?A\.?|TO BE ADVISED|NIL)\s*(?:MTS?|KGS?)?$", re.I)


def _clean_label(s):
    s = re.sub(r"[一-鿿　-〿]+", " ", s)   # CJK gloss
    s = re.sub(r"\([^)]*\)", " ", s)                        # (POL), (Non-Negotiable)
    s = re.sub(r"[^A-Za-z ]+", " ", s)
    return " ".join(s.split()).upper()


def _split(line):
    """-> (cleaned_label, inline_value) if the line starts a labelled field."""
    m = re.match(r"^\s{0,4}([A-Za-z][^:|]{0,45})\s*[:|]\s*(.*)$", line)
    if m:
        return _clean_label(m.group(1)), m.group(2).strip()
    lab = _clean_label(line)
    if lab and (field_of(lab) or lab in STOPS):    # bare header line (pdf/docx)
        return lab, ""
    return None, None


def parse(text):
    """-> {field: raw string}. Missing fields are absent."""
    hits = {f: [] for f in FIELDS}
    cur, buf = None, []

    def flush():
        if cur:
            seg = [b for b in buf if b]
            if seg:
                hits[cur].append(seg)

    for line in text.splitlines():
        lab, val = _split(line)
        if lab is not None:
            flush()
            cur, buf = field_of(lab), [val]
            continue
        if cur and len(buf) < 6:
            buf.append(line.strip())
    flush()

    out = {}
    for f, segs in hits.items():
        segs = [s for s in segs if not all(BLANK.match(x) for x in s)]
        if not segs:
            continue
        if f in ("container_count", "gross_weight_kg"):
            nums = [" ".join(s) for s in segs if re.search(r"\d", " ".join(s))]
            if nums:
                out[f] = nums[-1]        # PDFs repeat the header on each container row
        else:
            # first line only: the party/port name, never its address block
            v = re.split(r"[|;]", segs[0][0])[0].strip()
            if not BLANK.match(v):
                out[f] = v
    return out


def canon(field, raw):
    """Comparable value: int, float, or normalised party/port string."""
    if raw is None:
        return None
    if field == "container_count":
        m = re.search(r"(\d+)\s*[xX]", raw) or re.search(r"(\d+)", raw)
        return int(m.group(1)) if m else None
    if field == "gross_weight_kg":
        m = re.search(r"[\d,]*\d(?:\.\d+)?", raw.replace(" ", ""))
        return float(m.group(0).replace(",", "")) if m else None
    s = raw.split(";")[0] if field in PARTY else raw   # party name, not the address
    s = re.sub(r"\([^)]*\)", " ", s)                   # drop (CNNTG) port codes
    s = re.sub(r"[^A-Za-z0-9 ]+", " ", s).upper()
    s = re.sub(r"\b(PTE|LTD|LLC|SDN|BHD|FZE|FZ|CO|INC|PTY|LIMITED)\b", " ", s)
    return " ".join(s.split()) or None


def same(a, b):
    if a is None or b is None:
        return False
    if isinstance(a, str) and isinstance(b, str):
        ta, tb = set(a.split()), set(b.split())
        # ponytail: difflib + token subset instead of RapidFuzz; swap if recall slips
        return ta <= tb or tb <= ta or SequenceMatcher(None, a, b).ratio() >= 0.90
    return a == b
