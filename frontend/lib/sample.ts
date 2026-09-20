// TEST-ONLY (whole file): built-in mock inbox. Delete this file for production, then remove its imports.
import type { Field, RawCase } from "./cases";

/* Offline fallback so the demo survives a dead backend or Wi-Fi (build checklist §0.3).
   Shape is exactly what GET /api/v1/cases returns. */

export const OFFLINE = "#offline"; // non-null so the case reads as "attachment present"; no file behind it
const f = (key: string, label: string, si: string, bl = si, confidence = 96): Field => ({ key, label, si, bl, confidence });
const att = (id: string, kind: "SI" | "BL", text: string) => ({ name: `${id}_${kind}.txt`, url: null, text });

function pair(
  id: string,
  vessel: string,
  company: string,
  fields: Field[],
  extra: Partial<RawCase> = {},
): RawCase {
  const doc = (kind: "si" | "bl") =>
    fields.map((x) => `${x.label}: ${x[kind]}`).join("\n");
  return {
    id,
    vessel,
    company,
    body: `Hi team,\n\nAttached are the SI and draft BL for ${vessel.split("_")[1]?.trim() ?? "this booking"}. Please check the details and confirm.\n\nBest regards,\nShipping Documentation`,
    fields,
    attachments: [att(id, "SI", doc("si")), att(id, "BL", doc("bl"))].map((a) => ({ ...a, url: OFFLINE })),
    ...extra,
  };
}

const base = (o: Partial<Record<string, string>> = {}) => [
  f("shipper", "Shipper", o.shipper ?? "MOORIM SP CO., LTD"),
  f("consignee", "Consignee", o.consignee ?? "APRIL FINE PAPER TRADING FZE"),
  f("notify_party", "Notify Party", o.notify ?? "SAME AS CONSIGNEE"),
  f("port_of_loading", "Port of Loading", o.pol ?? "ULSAN, KOREA"),
  f("port_of_discharge", "Port of Discharge", o.pod ?? "CALLAO, PERU"),
  f("container_count", "Container Count", o.count ?? "4"),
  f("gross_weight_kg", "Gross Weight (kg)", o.weight ?? "96000"),
];

const HAND_MADE: RawCase[] = [
  pair("email_001", "TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ MOORIM SP CO., LTD _ MEDUUD104332", "aziztz@safqa.co.ke", base()),
  pair("email_002", "DRAFT BL CHECK _ 5RSG-00201 _ JEBEL ALI _ HANSOL PAPER", "ops@aprilasia.com", base({ consignee: "APRIL FINE PAPER TRADING FZE" }).map((x) =>
    x.key === "consignee" ? { ...x, bl: "APRIL FINE PAPER TRADING FZC", confidence: 71 } : x,
  )),
  pair("email_003", "CONFIRM SI _ 5RSG-00214 _ PORT KLANG", "docs@sdoc.example", base({ count: "2" }).map((x) =>
    x.key === "gross_weight_kg" ? { ...x, bl: "69000", confidence: 64 } : x.key === "container_count" ? { ...x, bl: "3" } : x,
  )),
  pair("email_004", "TO CONFIRM DOCS _ 5RSG-00301 _ SANTOS_BRAZIL", "ops@aprilasia.com", base()),
  {
    ...pair("email_005", "DRAFT BL _ 5RSG-00322 _ SANTOS", "ops@aprilasia.com", base()),
    attachments: [{ name: "email_005_SI.txt", url: OFFLINE, text: "Shipper: MOORIM" }, { name: "email_005_BL.txt", url: null, text: null }],
    fields: [],
  },
  {
    id: "email_006",
    vessel: "Payment status — invoice INV-9921",
    company: "accounts@vendor.example",
    body: "Please confirm the payment date for invoice INV-9921.",
    fields: [],
    attachments: [],
  },
  {
    id: "email_007",
    vessel: "You are a winner — click here",
    company: "promo@lottery.example",
    body: "Claim your free gift now.",
    fields: [],
    attachments: [],
  },
  { id: "email_008", vessel: "Meeting notes", company: "team@aprilasia.com", body: "Notes from Tuesday.", fields: [], attachments: [] },
];

/* ---- Generated demo inbox ---------------------------------------------------
   Seeded, so every load shows the same ~480 emails. Mix follows the real bundle: mostly BL comparisons,
   of which about half are clean, a third have 1-3 defective fields, and the rest need a human. */
export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const SHIPPERS = ["MOORIM SP CO., LTD", "HANSOL PAPER CO., LTD", "POSCO INTERNATIONAL CORP", "SAMSUNG C&T CORPORATION", "PETRONAS CHEMICALS MARKETING", "SIME DARBY PLANTATION BHD", "TOP GLOVE SDN BHD", "HARTALEGA SDN BHD", "SUMITOMO CORPORATION", "KUOK OILS & GRAINS PTE LTD", "YANGMING TRADING CO., LTD", "GLOBAL ORIENT LOGISTICS"];
const CONSIGNEES = ["APRIL FINE PAPER TRADING FZE", "MERCADO PACIFICO SAC", "SANTOS FIBRAS LTDA", "GULF PAPER TRADING LLC", "ROTTERDAM BULK IMPORT BV", "HAMBURG SUED LOGISTIK GMBH", "NHAVA SHEVA IMPORTS PVT LTD", "LAGOS MARITIME SUPPLY LTD", "KARACHI TEXTILE MILLS LTD", "DURBAN COMMODITIES (PTY) LTD"];
const PORTS = ["ULSAN, KOREA", "PORT KLANG, MALAYSIA", "TANJUNG PELEPAS, MALAYSIA", "PENANG, MALAYSIA", "BUSAN, KOREA", "SINGAPORE", "CALLAO, PERU", "SANTOS, BRAZIL", "JEBEL ALI, UAE", "ROTTERDAM, NETHERLANDS", "HAMBURG, GERMANY", "MUMBAI, INDIA", "DURBAN, SOUTH AFRICA", "LOS ANGELES, USA", "MOMBASA, KENYA"];
const SENDERS = ["ops@aprilasia.com", "docs@sdoc.example", "booking@gulfpaper.ae", "aziztz@safqa.co.ke", "shipping@mercadopacifico.pe", "exports@hansolpaper.kr", "logistics@santosfibras.com.br", "docs@nhavasheva.in", "ops@rotterdambulk.nl", "cs@hamburgsued.de", "freight@lagosmaritime.ng", "desk@karachitextile.pk", "export@topglove.com.my", "ops@durbancommodities.co.za"];
const DEFECT_WEIGHTS: [string, number][] = [["gross_weight_kg", 24], ["consignee", 20], ["container_count", 16], ["port_of_discharge", 14], ["shipper", 10], ["notify_party", 8], ["port_of_loading", 8]];
const NON_BL: Record<string, { subjects: string[]; bodies: string[] }> = {
  SI_REQUEST: {
    subjects: ["SI needed for {b}", "Shipping instruction for {b}", "{b} awaiting SI"],
    bodies: ["Hi team,\n\nCould you please send the SI for booking {b}? The cut-off is tomorrow.\n\nThanks", "Hello,\n\nWe still need the shipping instruction for {b}. Please share it today so we can release the BL draft."],
  },
  INVOICE_QUERY: {
    subjects: ["Invoice INV-{n} query", "Payment remittance advice {n}", "Debit note DN-{n}", "Statement of account, {m}"],
    bodies: ["Hi,\n\nCan you confirm the payment date for invoice INV-{n}? Our accounts team is asking.", "Please find our remittance advice for INV-{n}. Let us know once received.", "There is a difference on debit note DN-{n}. Could you review and reissue?"],
  },
  GENERAL: {
    subjects: ["Vessel schedule update week {w}", "Holiday closure notice", "Rate enquiry, {m}", "Meeting notes", "Out of office", "Port congestion advisory"],
    bodies: ["Hi all, sharing the latest schedule change for next week.", "Our office will be closed on Friday. Regular service resumes Monday.", "Could you quote a rate for a 40HC to the usual lane?", "Notes from Tuesday's call are below."],
  },
  SPAM: {
    subjects: ["You are a winner, claim now", "Free gift waiting for you", "Crypto opportunity, act now", "Unsubscribe to stop receiving offers", "Click here to verify your account"],
    bodies: ["Claim your free gift now. Click here.", "Act now: double your crypto in 24 hours.", "You have won the lottery. Click here to claim.", "To unsubscribe from these offers click here."],
  },
};

function generateCases(count: number, firstId: number): RawCase[] {
  const r = rng(2026);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const n = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const months = ["January", "February", "March"];
  const wrongDoc = ["PACKING LIST\nItem: 12 pallets\nTotal cartons: 480", "COMMERCIAL DOCUMENT\nAmount due: USD 12,400\nPayment terms: 30 days", "CERTIFICATE OF ORIGIN\nGoods: paper products\nOrigin: KR"];
  const mutate = (key: string, v: string, consignee: string): string => {
    if (key === "gross_weight_kg") { const c = v.split(""); [c[0], c[1]] = [c[1], c[0]]; const o = c.join(""); return o === v ? String(Number(v) + 1000) : o; }
    if (key === "container_count") return String(Math.max(1, Number(v) + (r() < 0.5 ? -1 : 1)));
    if (key.startsWith("port_")) return pick(PORTS.filter((p) => p !== v));
    if (key === "notify_party") return v === "SAME AS CONSIGNEE" ? consignee : "SAME AS CONSIGNEE";
    const j = v.search(/[A-Z]/);
    return v.slice(0, j) + String.fromCharCode(65 + ((v.charCodeAt(j) - 64) % 26)) + v.slice(j + 1);
  };
  const out: RawCase[] = [];
  for (let k = 0; k < count; k++) {
    const id = `email_${String(firstId + k).padStart(3, "0")}`;
    const booking = `5RSG-${String(n(100, 999)).padStart(5, "0")}`;
    const sender = pick(SENDERS);
    const roll = r();
    const nonBl = roll < 0.12 ? "INVOICE_QUERY" : roll < 0.22 ? "SI_REQUEST" : roll < 0.31 ? "GENERAL" : roll < 0.36 ? "SPAM" : null;
    if (nonBl) {
      const t = NON_BL[nonBl];
      const fill = (x: string) => x.replace("{b}", booking).replace(/\{n\}/g, String(n(1000, 9999))).replace("{m}", pick(months)).replace("{w}", String(n(1, 52)));
      out.push({ id, vessel: fill(pick(t.subjects)), company: nonBl === "SPAM" ? `promo${n(1, 99)}@offers-mail.example` : sender, body: fill(pick(t.bodies)), fields: [], attachments: [] });
      continue;
    }
    const pol = pick(PORTS), pod = pick(PORTS.filter((p) => p !== pol));
    const shipper = pick(SHIPPERS), consignee = pick(CONSIGNEES);
    const count = n(1, 8);
    const o = { shipper, consignee, notify: r() < 0.6 ? "SAME AS CONSIGNEE" : pick(CONSIGNEES), pol, pod, count: String(count), weight: String(count * n(16, 26) * 1000 + n(0, 9) * 100) };
    const vessel = `${pick(["TO CONFIRM DOCS", "DRAFT BL CHECK", "CONFIRM SI", "SI/BL FOR REVIEW"])} _ ${booking} _ ${pod.split(",")[0]} _ ${shipper}`;
    const kind = r();
    if (kind < 0.42) {
      out.push(pair(id, vessel, sender, base(o).map((x) => ({ ...x, confidence: n(90, 99) }))));
    } else if (kind < 0.78) { // 1-3 distinct defective fields, weighted like the real defects
      const defects = new Set<string>();
      const want = r() < 0.6 ? 1 : r() < 0.7 ? 2 : 3;
      while (defects.size < want) {
        let x = r() * DEFECT_WEIGHTS.reduce((a, [, w]) => a + w, 0);
        defects.add(DEFECT_WEIGHTS.find(([, w]) => (x -= w) < 0)![0]);
      }
      out.push(pair(id, vessel, sender, base(o).map((x) => defects.has(x.key)
        ? { ...x, bl: mutate(x.key, x.si, consignee), confidence: n(58, 90) }
        : { ...x, confidence: n(88, 99) })));
    } else { // needs a human
      const b = base(o);
      const why = r();
      const doc = (kind: "SI" | "BL", text: string | null, url: string | null = OFFLINE) => ({ name: `${id}_${kind}.txt`, url, text });
      const shell = pair(id, vessel, sender, b);
      if (why < 0.34) out.push({ ...shell, fields: [], attachments: [doc("SI", "Shipper: " + shipper), doc("BL", null, null)] });
      else if (why < 0.6) out.push({ ...shell, fields: [], attachments: [doc("SI", null), doc("BL", null)] });
      else if (why < 0.8) out.push({ ...shell, fields: [], attachments: [doc("SI", pick(wrongDoc)), doc("BL", pick(wrongDoc))] });
      else { const gap = pick(["notify_party", "gross_weight_kg", "consignee"]); out.push(pair(id, vessel, sender, b.map((x) => (x.key === gap ? { ...x, bl: "", confidence: n(30, 55) } : x)))); }
    }
  }
  return out;
}

// Received times spread over the last 45 days, so period filters (7 / 30 days) have something to cut.
const clock = rng(45);
export const SAMPLE_CASES: RawCase[] = [...HAND_MADE, ...generateCases(472, HAND_MADE.length + 1)].map((c) => ({
  ...c,
  received_at: Date.now() - clock() * 45 * 864e5,
}));
