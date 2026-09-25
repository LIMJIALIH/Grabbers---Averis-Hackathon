/* Case model + the ONE selector every Overview number comes from (build checklist rule 1).
   Vocabulary is the hackathon bundle's, verbatim — the submission JSON is scored on these strings. */

export const CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Status = "OK" | "MISMATCH" | "NEEDS_REVIEW";
export type Reason = "classification_uncertain" | "wrong_doc_type" | "missing_attachment" | "unreadable" | "missing_value" | "verification_review";
export const REASON_WORDS: Record<Reason, string> = {
  verification_review: "verification needs review",
  classification_uncertain: "classification uncertain",
  wrong_doc_type: "wrong document",
  missing_attachment: "missing attachment",
  unreadable: "unreadable",
  missing_value: "missing value",
};

export const FIELDS = [
  ["shipper", "Shipper"],
  ["consignee", "Consignee"],
  ["notify_party", "Notify party"],
  ["port_of_loading", "Port of loading"],
  ["port_of_discharge", "Port of discharge"],
  ["container_count", "Container count"],
  ["gross_weight_kg", "Gross weight (kg)"],
] as const;
export const fieldLabel = (key: string) => FIELDS.find(([k]) => k === key)?.[1] ?? key;

/** Human-in-the-loop threshold from the architecture. One constant, never a literal. */
export const HITL_THRESHOLD = 85;

/** Fixed forever: dark = real work, pale = noise (DESIGN_STYLE §2.4). */
export const CATEGORY_SHADE: Record<Category, string> = {
  BL_COMPARISON: "var(--b-900)",
  SI_REQUEST: "var(--b-700)",
  INVOICE_QUERY: "var(--b-500)",
  GENERAL: "var(--b-300)",
  SPAM: "var(--b-100)",
};
const CATEGORY_LABEL: Record<Category, string> = {
  BL_COMPARISON: "BL comparison",
  SI_REQUEST: "SI request",
  INVOICE_QUERY: "Invoice query",
  GENERAL: "General",
  SPAM: "Spam",
};
export const categoryLabel = (c: Category) => CATEGORY_LABEL[c];

export type Field = { key: string; label: string; si: string; bl: string; confidence: number };
export type Attachment = { name: string; url: string | null; text: string | null };
export type RawCase = {
  extraction_status?: 'ok' | 'review_required';
  review_reasons?: string[];
  id: string;
  vessel: string; // backend calls the subject "vessel" and the sender "company"
  company: string;
  body: string;
  fields: Field[];
  attachments: Attachment[];
  category?: Category;
  classification_confidence?: number;
  classification_source?: "bert" | "gemma_fallback" | "bert_low_confidence";
  classification_requires_review?: boolean;
  classification_reason?: string | null;
  received_at?: number; // ms since epoch; optional until the API returns it
};
export type Case = {
  reviewReasons: string[];
  id: string;
  subject: string;
  sender: string;
  body: string;
  fields: Field[];
  attachments: Attachment[];
  category: Category;
  status: Status;
  reason: Reason | null;
  defects: string[];
  confidence: number | null; // lowest deterministic SI/BL comparison score, 0-100
  receivedAt: number | null;
  ship: Shipment;
  classConf: number | null; // classifier confidence, 0-1
  classReview: boolean;
};

/* ---- Shipment identity: what ops people actually search by. Read off the attachment text,
   BL first because it is the document being checked. */
export type Shipment = { bl: string | null; booking: string | null; vessel: string | null; voyage: string | null;
  commodity: string | null; freight: string | null; scac: string | null; carrier: string | null; pol: string | null; pod: string | null };

const LABELS = {
  bl: "Bill of Lading No\\.|B/L NUMBER|B/L No\\.|BL No\\.",
  booking: "Booking Reference|Booking Ref|Booking No\\.",
  vessel: "Export Carrier \\(vessel, voyage\\)|Vessel Name|Ocean Vessel|Vessel",
  voyage: "Voyage No\\.|Voy\\. No|Voyage|Voy\\.",
  commodity: "Commodity|Description of Goods|Description",
  freight: "Freight",
} as const;
/** SCAC = first 4 letters of a BL number. ponytail: the major lines only; other prefixes show as the bare code. */
const SCAC: Record<string, string> = { MEDU: "MSC", MSCU: "MSC", MAEU: "Maersk", HLCU: "Hapag-Lloyd", EGLV: "Evergreen", OOLU: "OOCL", CMDU: "CMA CGM", ONEY: "ONE", COSU: "COSCO", YMLU: "Yang Ming" };

/** "PORT KLANG (WESTPORT), MALAYSIA (MYPKG)" → "MYPKG"; without a code, the place before the country ("FREMANTLE"). */
export const portCode = (v: string) => v.match(/\(([A-Z]{2}[A-Z2-9]{3})\)/)?.[1] ?? (v.split(",")[0].trim() || null);

function shipment(raw: RawCase): Shipment {
  const text = [...raw.attachments].sort((a, b) => Number(/BL/i.test(b.name)) - Number(/BL/i.test(a.name))).map((a) => a.text ?? "").join("\n");
  const read = (k: keyof typeof LABELS) => text.match(new RegExp(`^\\s*(?:${LABELS[k]})\\s*:\\s*(.+?)\\s*$`, "im"))?.[1] ?? null;
  // Codes are one token and may share a line ("B/L NUMBER: SINF90600780 BOOKING NO. ONEYSINF68671").
  const code = (k: "bl" | "booking") => text.match(new RegExp(`(?:${LABELS[k]})\\s*:?\\s*([A-Z0-9-]{6,})`, "i"))?.[1] ?? null;
  // Subjects end "… _ MEDUUD104332", which covers a BL whose text can't be read (PDF).
  const bl = code("bl") ?? raw.vessel.split(" _ ").pop()?.trim().match(/^[A-Z]{4}[A-Z0-9]{5,}$/)?.[0] ?? null;
  const booking = code("booking");
  // Some lines print the SCAC only on the booking (ONE: BL "SINF…", booking "ONEYSINF…").
  const scac = [bl, booking].map((v) => v?.slice(0, 4).toUpperCase()).find((p) => p && SCAC[p]) ?? bl?.slice(0, 4) ?? null;
  const port = (k: string) => {
    const f = raw.fields.find((x) => x.key === k);
    return f ? portCode(f.si || f.bl) : null;
  };
  return { bl, booking, vessel: read("vessel"), voyage: read("voyage"), commodity: read("commodity"), freight: read("freight"),
    scac, carrier: scac ? SCAC[scac] ?? null : null, pol: port("port_of_loading"), pod: port("port_of_discharge") };
}

/** Everything a person might type to find a case. One haystack, so the queue and ⌘K agree. */
export const searchText = (c: Case) =>
  [c.id, c.subject, c.sender, c.ship.bl, c.ship.booking, c.ship.vessel, c.ship.carrier, c.ship.pol, c.ship.pod].filter(Boolean).join(" ").toLowerCase();

/** Port code <-> name aliases, compared after normalising. ponytail: hand-kept table; upgrade to a UN/LOCODE lookup. */
const PORT_ALIASES: Record<string, string> = { mytpp: "tanjung pelepas", mypkg: "port klang", mypen: "penang", krusn: "ulsan", pecll: "callao" };
const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
const normField = (key: string, v: string) => {
  const n = norm(v);
  return key.startsWith("port_") ? PORT_ALIASES[n] ?? n : n;
};
export const matches = (f: Field) => normField(f.key, f.si) === normField(f.key, f.bl);

/** Character-level diff by common prefix/suffix. ponytail: single-edit diff, no LCS —
    covers the digit-swap / typo defects this product exists for; upgrade to LCS for multi-edit values. */
export function diffSpan(a: string, b: string): [number, number] | null {
  if (a === b) return null;
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  return [s, b.length - e];
}

/** ponytail: keyword rules, not the BERT classifier — the API returns no category yet.
    Swap for the backend's `category` when Stage 1 lands. Surfaced as "Provisional" in the UI. */
function categorise(raw: RawCase): Category {
  const names = raw.attachments.map((a) => a.name);
  const hasSI = names.some((n) => /(^|[_\W])SI([_\W]|$)/i.test(n));
  const hasBL = names.some((n) => /(^|[_\W])BL([_\W]|$)/i.test(n));
  if (hasSI && hasBL) return "BL_COMPARISON";
  const text = `${raw.vessel}\n${raw.body}`;
  if (/unsubscribe|lottery|winner|crypto|click here|free gift|act now/i.test(text)) return "SPAM";
  if (/invoice|payment|remittance|statement of account|debit note/i.test(text)) return "INVOICE_QUERY";
  if (/(send|provide|need|submit|share).{0,40}\b(SI|shipping instruction)/i.test(text)) return "SI_REQUEST";
  if (hasSI || hasBL || names.length) return "BL_COMPARISON";
  return "GENERAL";
}

const LOOKS_LIKE_SI_BL = /shipper|consignee|notify party|port of (loading|discharge)|load port|container|gross weight/i;

export function derive(raw: RawCase): Case {
  // New responses carry the backend hybrid decision. The rule fallback keeps old
  // saved fixtures readable but is no longer the live queue's primary classifier.
  const category = raw.category ?? categorise(raw);
  const base = {
    reviewReasons: raw.review_reasons ?? [],
    id: raw.id,
    subject: raw.vessel,
    sender: raw.company,
    body: raw.body,
    fields: raw.fields,
    attachments: raw.attachments,
    receivedAt: raw.received_at ?? null,
    ship: shipment(raw),
    classConf: raw.classification_confidence ?? null,
    classReview: !!raw.classification_requires_review,
    category,
    defects: [] as string[],
    confidence: raw.fields.length ? Math.min(...raw.fields.map((f) => f.confidence)) : null,
  };
  const review = (reason: Reason): Case => ({ ...base, status: "NEEDS_REVIEW", reason });
  if (raw.classification_requires_review) return review("classification_uncertain");
  if (category !== "BL_COMPARISON") return { ...base, status: "OK", reason: null };
  if (raw.extraction_status === 'review_required') return review('verification_review');
  if (raw.extraction_status === 'ok') return { ...base, status: 'OK', reason: null };
  if (raw.attachments.length < 2 || raw.attachments.some((a) => !a.url)) return review("missing_attachment");
  // Fields with real values (e.g. from Gemini reading the PDFs) outrank the text checks: PDFs never carry attachment text.
  const extracted = raw.fields.some((f) => f.si.trim() || f.bl.trim());
  if (!extracted && raw.attachments.every((a) => !a.text)) return review("unreadable");
  // Both files opened but neither carries a single SI/BL field label: someone attached the wrong thing.
  if (!extracted && !raw.attachments.some((a) => LOOKS_LIKE_SI_BL.test(a.text ?? ""))) return review("wrong_doc_type");
  if (!raw.fields.length) return review("unreadable");
  if (raw.fields.some((f) => !f.si.trim() || !f.bl.trim())) return review("missing_value");
  const defects = raw.fields.filter((f) => !matches(f)).map((f) => f.key);
  return { ...base, status: defects.length ? "MISMATCH" : "OK", reason: null, defects };
}

/** awaiting = amendment (or resend) requested; the case waits on the carrier, not on us. */
export type Resolution = "approved" | "escalated" | "awaiting";
export const RESOLUTION_WORD: Record<Resolution, string> = { approved: "Approved", escalated: "Escalated", awaiting: "Awaiting carrier" };
export type Corrections = Record<string, Record<string, { value: string; reason: string }>>;

/** A case still needs the operator if it is flagged and nobody has acted on it yet. */
export const isOpen = (c: Case, res: Record<string, Resolution>) => c.status !== "OK" && !res[c.id];

export function summarise(cases: Case[], res: Record<string, Resolution>) {
  const count = <T extends string>(keys: readonly T[], pick: (c: Case) => T | null) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
    cases.forEach((c) => {
      const k = pick(c);
      if (k) out[k]++;
    });
    return out;
  };
  const total = cases.length;
  const byCategory = count(CATEGORIES, (c) => c.category);
  const reasons = count(["classification_uncertain", "wrong_doc_type", "missing_attachment", "unreadable", "missing_value", "verification_review"] as const, (c) =>
    isOpen(c, res) ? c.reason : null,
  );
  const fieldDefects = count(FIELDS.map(([k]) => k), () => null) as Record<string, number>;
  const mismatched = cases.filter((c) => c.status === "MISMATCH");
  mismatched.forEach((c) => c.defects.forEach((k) => (fieldDefects[k] = (fieldDefects[k] ?? 0) + 1)));
  const needsOpen = cases.filter((c) => c.status === "NEEDS_REVIEW" && !res[c.id]);
  const ok = cases.filter((c) => c.status === "OK").length;
  const bl = cases.filter((c) => c.category === "BL_COMPARISON");
  const blOk = bl.filter((c) => c.status === "OK").length;
  // Only an approval closes a case; escalated and awaiting are still someone's work, so they get their own counts.
  const resolved = cases.filter((c) => c.status !== "OK" && res[c.id] === "approved").length;
  const escalated = cases.filter((c) => res[c.id] === "escalated").length;
  const awaiting = cases.filter((c) => res[c.id] === "awaiting").length;
  const defectsOpen = mismatched.filter((c) => !res[c.id]).length;
  return {
    total,
    byCategory,
    reasons,
    fieldDefects,
    mismatched: mismatched.length,
    needsOpen: needsOpen.length,
    open: cases.filter((c) => isOpen(c, res)).length,
    ok,
    resolved,
    escalated,
    awaiting,
    defectsOpen,
    blTotal: bl.length,
    blOk,
    straightThrough: bl.length ? Math.round((blOk / bl.length) * 100) : 0,
    defectFieldsSpanned: Object.values(fieldDefects).filter((n) => n > 0).length,
  };
}
export type Summary = ReturnType<typeof summarise>;
