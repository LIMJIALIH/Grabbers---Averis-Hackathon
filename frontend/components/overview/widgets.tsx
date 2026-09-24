"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Sankey } from "recharts";
import type { LinkProps as SankeyLinkProps, NodeProps as SankeyNodeProps } from "recharts/types/chart/Sankey";
import { useCases } from "@/lib/app-state";
import { CATEGORIES, CATEGORY_SHADE, FIELDS, categoryLabel, fieldLabel, summarise, type Summary } from "@/lib/cases";
import { Abbr, COUNT_DELAY, CountUp, DemoChip, Dropdown, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";

/** True once `threshold` of the element has been on screen. Stays true, so scrolling away never resets a chart. */
function useInView<T extends HTMLElement>(threshold: number) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function CardHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="card-head">
      <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.01em]">{title}</h2>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

/* Straight-through: OK / BL comparisons over a chosen period. Spam and chatter are not "cleared", they were never compared.
   The period needs a received time on every case; without one (older API) the card shows everything. */
const PERIODS = [{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "", label: "All time" }];
export function StraightThrough() {
  const { cases, resolutions } = useCases();
  const [days, setDays] = useState("7");
  const timed = cases.length > 0 && cases.every((c) => c.receivedAt != null);
  const period = timed ? days : "";
  const s = useMemo(
    () => summarise(period ? cases.filter((c) => c.receivedAt! >= Date.now() - Number(period) * 864e5) : cases, resolutions),
    [cases, resolutions, period],
  );
  return (
    <section className="card enter p-6" aria-label="Straight-through rate">
      <div className="flex items-start justify-between gap-3">
        <span className="label">Straight-through</span>
        {timed && <Dropdown label="Period" value={days} onChange={setDays} options={PERIODS} />}
      </div>
      <div className="mt-3 text-[72px] font-semibold leading-[76px] tracking-[-0.04em]" aria-live="polite">
        <CountUp to={s.straightThrough} suffix="%" />
      </div>
      <p className="mt-2 text-[13px] text-ink-2">
        <CountUp to={s.blOk} /> of <CountUp to={s.blTotal} /> <Abbr t="BL" /> comparisons matched their <Abbr t="SI" />. <CountUp to={s.mismatched} /> had a defect.
      </p>
    </section>
  );
}

/* Weekly: donut of one day's emails by category, shown while its name is hovered. */
function DayDonut({ title, counts, left, shift }: { title: string; counts: number[]; left: string; shift: string }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const data = CATEGORIES.map((c, k) => ({ c, n: counts[k] })).filter((d) => d.n > 0);
  return (
    <div className="pointer-events-none absolute top-2 z-10 flex items-center gap-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-pop)] ring-1 ring-line-strong"
      style={{ left, transform: `translateX(${shift})` }}>
      <div className="relative size-[132px] shrink-0">
        <PieChart width={132} height={132}>
          <Pie data={data.length ? data : [{ c: "GENERAL", n: 1 }]} dataKey="n" innerRadius={44} outerRadius={64} paddingAngle={data.length > 1 ? 2 : 0}
            stroke="var(--surface)" strokeWidth={2} startAngle={90} endAngle={-270} animationDuration={250}>
            {(data.length ? data : [{ c: "GENERAL" }]).map((d) => (
              <Cell key={d.c} style={{ fill: data.length ? CATEGORY_SHADE[d.c as keyof typeof CATEGORY_SHADE] : "var(--b-050)" }} />
            ))}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 grid place-content-center text-center">
          <div className="num text-[22px] font-semibold leading-6">{total}</div>
          <div className="label">Emails</div>
        </div>
      </div>
      <div className="min-w-40 text-[13px]">
        <div className="mb-2 font-semibold">{title}</div>
        {CATEGORIES.map((c, k) => (
          <div key={c} className="flex items-center gap-2 py-0.5">
            <i className="size-2.5 rounded-[3px]" style={{ background: CATEGORY_SHADE[c] }} />
            <span className="flex-1 text-ink-2">{categoryLabel(c)}</span>
            <span className="num font-semibold">{counts[k]}</span>
            <span className="num w-9 text-right text-ink-3">{total ? Math.round((counts[k] / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* §4 — category mix. recharts owns the arcs; legend rows are the real hit targets. */
export function CategoryDonut({ s }: { s: Summary }) {
  const router = useRouter();
  const data = CATEGORIES.map((c) => ({ c, n: s.byCategory[c] })).filter((d) => d.n > 0);
  const open = (c: string) => router.push(`/?category=${c}`);
  return (
    <section className="card enter">
      <CardHead title="Category mix" right={<DemoChip text="Classifier" title="Fine-tuned BERT. Low-confidence emails go to a person." />} />
      <div className="flex flex-wrap items-center justify-center gap-6 p-5">
        <div className="relative size-[176px] shrink-0">
          <PieChart width={176} height={176}>
            <Pie data={data.length ? data : [{ c: "GENERAL", n: 1 }]} dataKey="n" innerRadius={58} outerRadius={84} minAngle={6} paddingAngle={data.length > 1 ? 2 : 0}
              stroke="var(--surface)" strokeWidth={2} startAngle={90} endAngle={-270} animationDuration={400}
              onClick={(d) => data.length && open((d as unknown as { c: string }).c)} style={{ cursor: "pointer", outline: "none" }}>
              {(data.length ? data : [{ c: "GENERAL" }]).map((d) => (
                <Cell key={d.c} style={{ fill: data.length ? CATEGORY_SHADE[d.c as keyof typeof CATEGORY_SHADE] : "var(--b-050)" }} />
              ))}
            </Pie>
          </PieChart>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <div className="num text-[28px] font-semibold leading-8 tracking-[-0.02em]"><CountUp to={s.total} /></div>
            <div className="label">Emails</div>
          </div>
        </div>
        <ul className="grid min-w-[190px] flex-1 gap-1">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <button onClick={() => open(c)} className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-2">
                <i className="size-3 shrink-0 rounded-sm" style={{ background: CATEGORY_SHADE[c] }} aria-hidden />
                <span className="flex-1">{categoryLabel(c)}</span>
                <span className="num"><CountUp to={s.byCategory[c]} /></span>
                <span className="num w-10 text-right text-ink-3"><CountUp to={s.total ? Math.round((s.byCategory[c] / s.total) * 100) : 0} suffix="%" /></span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---- Amendment cost avoided. Every defective draft caught here is one the carrier would otherwise
   amend after release. Malaysian carrier tariffs 2025–26, per BL: Hapag-Lloyd RM 50 · RCL RM 100 ·
   Maersk RM 200 · CMA CGM RM 250 (post-sailing). Staff time 1.5–3 h per amendment cycle. */
const FEE_RM = [50, 250] as const;
const HOURS = [1.5, 3] as const;
export function AmendmentsAvoided({ s }: { s: Summary }) {
  const n = s.mismatched;
  return (
    <section className="card enter flex flex-col p-6" aria-label="Amendment cost avoided">
      <div className="flex items-start justify-between gap-3">
        <span className="label">Amendment cost avoided</span>
        <DemoChip text="Estimate" title="A range from published Malaysian carrier tariffs, not a measured saving." />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[44px] font-semibold leading-[52px] tracking-[-0.04em]" aria-live="polite">
        <span className="text-[24px] tracking-[-0.02em] text-ink-3">RM</span>
        <CountUp to={n * FEE_RM[0]} /><span className="text-ink-3">–</span><CountUp to={n * FEE_RM[1]} />
      </div>
      <p className="mt-2 text-[13px] text-ink-2">
        <CountUp to={n} /> defective <Abbr t="BL" /> {n === 1 ? "draft" : "drafts"} caught before release, and{" "}
        <span className="num">{(n * HOURS[0]).toLocaleString()}–{(n * HOURS[1]).toLocaleString()} h</span> of staff time not spent chasing amendments.
      </p>
      <details className="mt-auto pt-4 text-[12px] text-ink-3">
        <summary className="cursor-pointer hover:text-ink">How this is worked out</summary>
        <p className="mt-2 leading-[18px]">
          Corrections before sailing are usually free. After release, Malaysian carriers charge per BL: Hapag-Lloyd RM 50, RCL RM 100,
          Maersk RM 200, CMA CGM RM 250. Each amendment also takes 1.5–3 h of staff time. The range is defects caught × those rates.
        </p>
      </details>
    </section>
  );
}

/* ---- Pipeline flow: where every email went. Left to right, one reading direction.
   Orange appears once, on the node that needs a person. */
type FlowNode = { name: string; color: string; href?: string; col: number };
export function PipelineFlow() {
  const { cases, resolutions } = useCases();
  const router = useRouter();
  const [ref, seen] = useInView<HTMLElement>(0.25);
  const data = useMemo(() => {
    const NODE: Record<string, FlowNode> = {
      inbox: { name: "Inbox", color: "var(--ink)", col: 0, href: "/" },
      BL_COMPARISON: { name: "BL comparison", color: CATEGORY_SHADE.BL_COMPARISON, col: 1, href: "/?category=BL_COMPARISON" },
      // Invoice, SI request, general and spam need no SI/BL check; the donut beside this card splits them.
      none: { name: "No check needed", color: "var(--line-strong)", col: 1, href: "/?scope=other" },
      OK: { name: "Verified", color: "var(--ok)", col: 2, href: "/?status=OK&category=BL_COMPARISON" },
      MISMATCH: { name: "Defect", color: "var(--defect)", col: 2, href: "/?status=MISMATCH" },
      NEEDS_REVIEW: { name: "Needs review", color: "var(--review)", col: 2, href: "/?status=NEEDS_REVIEW" },
      approved: { name: "Approved", color: "var(--ok)", col: 3, href: "/?scope=resolved" },
      escalated: { name: "Escalated", color: "var(--ink-2)", col: 3, href: "/?scope=resolved" },
      open: { name: "Still open", color: "var(--ink-3)", col: 3, href: "/?scope=open" },
    };
    const flows = new Map<string, number>();
    const add = (a: string, b: string) => flows.set(`${a}|${b}`, (flows.get(`${a}|${b}`) ?? 0) + 1);
    cases.forEach((c) => {
      const bl = c.category === "BL_COMPARISON";
      if (!bl && c.status === "OK") return add("inbox", "none");
      if (bl) add("inbox", "BL_COMPARISON");
      add(bl ? "BL_COMPARISON" : "inbox", c.status); // a non-BL email only continues when a person must look
      const r = resolutions[c.id];
      if (r) add(c.status, r);
      else if (c.status !== "OK") add(c.status, "open");
    });
    // Only stages something actually reached become nodes.
    const nodes: FlowNode[] = [];
    const at = new Map<string, number>();
    const node = (key: string) => at.get(key) ?? (at.set(key, nodes.push(NODE[key]) - 1), nodes.length - 1);
    const links = [...flows].map(([k, value]) => {
      const [a, b] = k.split("|");
      return { source: node(a), target: node(b), value };
    });
    const blCases = cases.filter((c) => c.category === "BL_COMPARISON");
    return { nodes, links, blTotal: blCases.length, blOpen: blCases.filter((c) => c.status !== "OK" && !resolutions[c.id]).length };
  }, [cases, resolutions]);

  return (
    <section ref={ref} className="card enter">
      <CardHead title={data.blTotal ? `${data.blOpen} of ${data.blTotal} BL drafts still need a person` : "Where every email went"}
        right={<span className="text-[12px] text-ink-3">Where all {cases.length} emails went · click a stage to open it</span>} />
      {data.links.length === 0 ? (
        <Empty title="Nothing has come in yet" hint="Once the inbox is read, each email’s path through the pipeline shows here." />
      ) : (
        <div className="p-4 pr-2">
          <ResponsiveContainer width="100%" height={340}>
            <Sankey data={data} nodeWidth={10} nodePadding={22} linkCurvature={0.5} iterations={64} sort={false} align="left"
              margin={{ top: 8, bottom: 8, left: 4, right: 132 }}
              node={(p: SankeyNodeProps) => <FlowNodeMark {...p} seen={seen} onOpen={(href) => router.push(href)} />}
              link={(p: SankeyLinkProps) => <FlowLink {...p} seen={seen} />} />
          </ResponsiveContainer>
        </div>
      )}
      <table className="sr-only">
        <caption>Emails moving between pipeline stages</caption>
        <thead><tr><th>From</th><th>To</th><th>Emails</th></tr></thead>
        <tbody>{data.links.map((l) => <tr key={`${l.source}-${l.target}`}><td>{data.nodes[l.source].name}</td><td>{data.nodes[l.target].name}</td><td>{l.value}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

/** Nodes fade in on the count-up beat, one column after another. */
function FlowNodeMark({ x, y, width, height, payload, seen, onOpen }: SankeyNodeProps & { seen: boolean; onOpen: (href: string) => void }) {
  const n = payload as unknown as FlowNode & { value: number };
  const delay = COUNT_DELAY + n.col * 280;
  const go = () => n.href && onOpen(n.href);
  return (
    <g role="link" tabIndex={0} aria-label={`${n.name}: ${n.value}`} className="flow-node cursor-pointer outline-none"
      onClick={go} onKeyDown={(e) => e.key === "Enter" && go()}
      style={{ opacity: seen ? 1 : 0, transition: `opacity 300ms ease ${delay}ms` }}>
      <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={3} fill={n.color} />
      <text x={x + width + 8} y={y + height / 2} dominantBaseline="middle" fontSize={13} fill="var(--ink)"
        stroke="var(--surface)" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
        {n.name} <tspan className="num" fontWeight={600}>{n.value}</tspan>
      </text>
    </g>
  );
}

/** Each band draws itself left to right, after the column it leaves has landed. */
function FlowLink({ sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload, seen }: SankeyLinkProps & { seen: boolean }) {
  const from = payload.source as unknown as FlowNode;
  const to = payload.target as unknown as FlowNode;
  const delay = COUNT_DELAY + from.col * 280 + 140;
  const color = from.col === 0 ? to.color : from.color; // out of the inbox, a band wears its destination: BL reads burgundy, the rest recedes
  return (
    <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={color} strokeWidth={Math.max(linkWidth, 1)} pathLength={1} strokeDasharray="1"
      className="flow-link"
      style={{ strokeDashoffset: seen ? 0 : 1, transition: `stroke-dashoffset 700ms var(--ease-out) ${delay}ms, opacity 150ms ease` }} />
  );
}

/* ---- Carrier × field: which carrier's drafts are wrong, and on which field. The team lead's call list. */
const SHORT: Record<string, string> = {
  shipper: "Shipper", consignee: "Consignee", notify_party: "Notify", port_of_loading: "POL", port_of_discharge: "POD", container_count: "Cntrs", gross_weight_kg: "Weight",
};
const HEAT = ["var(--b-100)", "var(--b-300)", "var(--b-500)", "var(--b-700)", "var(--b-900)"];
const MAX_ROWS = 7;
type HeatRow = { key: string; label: string; code: string | null; checked: number; bad: number; f: Record<string, number> };
const heatRow = (key: string, label: string, code: string | null): HeatRow => ({ key, label, code, checked: 0, bad: 0, f: {} });
export function CarrierHeatmap() {
  const { cases } = useCases();
  const router = useRouter();
  const [ref, seen] = useInView<HTMLElement>(0.2);
  const { rows, total, max } = useMemo(() => {
    const by = new Map<string, HeatRow>();
    const total = heatRow("all", "All carriers", null);
    cases.filter((c) => c.category === "BL_COMPARISON").forEach((c) => {
      const key = c.ship.scac ?? "?";
      // Unrecognised codes are labelled by the code itself: naming a carrier we can't verify would overclaim.
      if (!by.has(key)) by.set(key, heatRow(key, c.ship.carrier ?? c.ship.scac ?? "No BL no.", c.ship.carrier ? c.ship.scac : null));
      [by.get(key)!, total].forEach((x) => {
        x.checked++;
        if (c.status === "MISMATCH") x.bad++;
        c.defects.forEach((k) => (x.f[k] = (x.f[k] ?? 0) + 1));
      });
    });
    const sorted = [...by.values()].sort((a, b) => b.bad - a.bad || b.checked - a.checked);
    const rows = sorted.slice(0, MAX_ROWS);
    if (sorted.length > MAX_ROWS) {
      const rest = heatRow("rest", `${sorted.length - MAX_ROWS} more carriers`, null);
      sorted.slice(MAX_ROWS).forEach((r) => {
        rest.checked += r.checked;
        rest.bad += r.bad;
        Object.entries(r.f).forEach(([k, n]) => (rest.f[k] = (rest.f[k] ?? 0) + n));
      });
      rows.push(rest);
    }
    // Shade single carriers against each other only.
    const max = Math.max(1, ...sorted.slice(0, MAX_ROWS).flatMap((r) => Object.values(r.f)));
    return { rows, total, max };
  }, [cases]);
  const totalMax = Math.max(1, ...Object.values(total.f));
  const open = (code: string | null, field: string) => router.push(`/?field=${field}${code ? `&q=${code}` : ""}`);
  const cols = "grid-cols-[minmax(136px,1.6fr)_repeat(7,minmax(44px,1fr))_72px]";

  return (
    <section ref={ref} className="card enter">
      <CardHead title="Defects by carrier and field" right={<span className="text-[12px] text-ink-3">{total.bad} of {total.checked} BL drafts had a defect</span>} />
      {total.bad === 0 ? (
        <Empty title="No defects yet" hint="When a BL differs from its SI, the carrier and the field that failed show up here." />
      ) : (
        <div className="overflow-x-auto p-4">
          <div role="table" aria-label="Defects by carrier and field" className="grid min-w-[600px] gap-1 text-[13px]">
            <div role="row" className={cn("grid items-end gap-1", cols)}>
              <span role="columnheader" className="label px-2">Carrier</span>
              {FIELDS.map(([k]) => <span role="columnheader" key={k} className="label text-center" title={fieldLabel(k)}>{SHORT[k]}</span>)}
              <span role="columnheader" className="label pr-2 text-right">Defective</span>
            </div>
            {[...rows, total].map((r, ri) => {
              const sum = r === total;
              return (
                <div role="row" key={r.key} className={cn("grid items-center gap-1", cols, sum && "mt-1 border-t border-line pt-2")}>
                  <span role="rowheader" className="flex min-w-0 items-baseline gap-2 px-2">
                    <span className={cn("truncate", sum && "font-semibold")}>{r.label}</span>
                    {r.code && <span className="num text-[11px] text-ink-3" title="SCAC: the first four letters of the BL number">{r.code}</span>}
                  </span>
                  {FIELDS.map(([k], ci) => {
                    const n = r.f[k] ?? 0;
                    // The "more" bucket sums many carriers, so it gets numbers on a neutral fill, never a shade.
                    const shade = n && r.key !== "rest" ? Math.min(4, Math.ceil((n / (sum ? totalMax : max)) * 5) - 1) : -1;
                    return (
                      <button role="cell" key={k} disabled={!n} onClick={() => open(sum || r.key === "rest" ? null : r.code, k)}
                        aria-label={`${r.label}, ${fieldLabel(k)}: ${n}`}
                        className="heat-cell num grid h-9 place-items-center rounded-md text-[12px] font-semibold outline-none disabled:cursor-default"
                        style={{
                          background: shade >= 0 ? HEAT[shade] : n ? "var(--surface-2)" : "var(--b-050)",
                          color: shade < 0 ? (n ? "var(--ink-2)" : "var(--ink-3)") : shade >= 2 ? "#fff" : "#2a0009",
                          opacity: seen ? 1 : 0, transform: seen ? "none" : "scale(.85)",
                          transitionDelay: `${COUNT_DELAY + ci * 50 + ri * 35}ms`,
                        }}>
                        {n || "·"}
                      </button>
                    );
                  })}
                  <span className="num pr-2 text-right text-ink-2">{r.bad}<span className="text-ink-3">/{r.checked}</span></span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 px-2 text-[12px] text-ink-3">
            Carrier comes from the first four letters of the BL number (its <abbr title="Standard Carrier Alpha Code">SCAC</abbr>). Each cell counts drafts with that field wrong; click one to open those emails.
          </p>
        </div>
      )}
    </section>
  );
}

/* ---- Classifier certainty: one row per category. Band = the range of confidence, dot = median,
   black tick = that category's review gate. Answers "is each category clear of its gate?" at a glance.
   ponytail: gates mirror backend/.env DOCUVERIFY_CLASSIFICATION_THRESHOLD_*; send them in /cases if they start moving. */
const GATE: Record<string, number> = { BL_COMPARISON: 0.85, SI_REQUEST: 0.9, INVOICE_QUERY: 0.9, GENERAL: 0.75, SPAM: 0.6 };
const FLOOR = 0.5; // the axis starts where the gates start to matter
const pos = (v: number) => ((Math.max(FLOOR, v) - FLOOR) / (1 - FLOOR)) * 100;
export function ClassifierCertainty() {
  const { cases } = useCases();
  const [ref, seen] = useInView<HTMLElement>(0.2);
  const scored = cases.filter((c) => c.classConf != null);
  const flagged = scored.filter((c) => c.classReview).length;
  const rows = CATEGORIES.map((cat) => {
    const v = scored.filter((c) => c.category === cat).map((c) => c.classConf!).sort((a, b) => a - b);
    return { cat, n: v.length, lo: v[0], hi: v[v.length - 1], mid: v[Math.floor(v.length / 2)], under: scored.filter((c) => c.category === cat && c.classReview).length };
  }).filter((r) => r.n);
  const clear = rows.filter((r) => r.mid >= GATE[r.cat]).length;
  const title = !rows.length ? "How sure the classifier was"
    : clear === rows.length ? "Every category sits clear of its review gate" : `${rows.length - clear} of ${rows.length} categories sit under their review gate`;
  const cols = "grid-cols-[112px_minmax(0,1fr)_112px]";
  return (
    <section ref={ref} className="card enter">
      <CardHead title={title} />
      {scored.length === 0 ? (
        <Empty title="No classifier scores yet" hint="Once emails are classified, each category shows how far it sits above its review gate." />
      ) : (
        <div className="grid gap-1 p-5">
          <div className={cn("grid gap-3", cols)}><span /><span /><span className="label text-right">Median vs gate</span></div>
          {rows.map((r, i) => {
            const delay = COUNT_DELAY + i * 80;
            return (
              <div key={r.cat} className={cn("grid h-10 items-center gap-3", cols)}>
                <span className="truncate text-[13px]">{categoryLabel(r.cat)}</span>
                <div className="relative h-2 rounded-full bg-surface-2" title={`${r.n} emails · ${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}% · gate ${GATE[r.cat] * 100}%`}>
                  <span className="absolute inset-y-0 rounded-full transition-[clip-path] duration-700 ease-out"
                    style={{ left: `${pos(r.lo)}%`, width: `${Math.max(pos(r.hi) - pos(r.lo), 1.5)}%`, background: CATEGORY_SHADE[r.cat], opacity: 0.6,
                      clipPath: seen ? "inset(0 0 0 0)" : "inset(0 100% 0 0)", transitionDelay: `${delay}ms` }} />
                  <i className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pos(GATE[r.cat])}%` }} />
                  {i === 0 && <span className="absolute -top-4 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-2" style={{ left: `${pos(GATE[r.cat])}%` }}>gate</span>}
                  <i className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface)] transition-opacity duration-300"
                    style={{ left: `${pos(r.mid)}%`, background: r.under ? "var(--review)" : CATEGORY_SHADE[r.cat], opacity: seen ? 1 : 0, transitionDelay: `${delay + 500}ms` }} />
                </div>
                <span className="num text-right text-[13px]">
                  <span className={cn("font-semibold", r.mid < GATE[r.cat] && "text-review-ink")}>{Math.round(r.mid * 100)}%</span>
                  <span className="text-ink-3"> vs {GATE[r.cat] * 100}</span>
                </span>
              </div>
            );
          })}
          <div className={cn("grid gap-3", cols)}>
            <span />
            <div className="num flex justify-between text-[11px] text-ink-3"><span>50%</span><span>100%</span></div>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Band: range of confidence. Dot: median. {flagged} of {scored.length} emails fell under a gate and went to a person.</p>
        </div>
      )}
    </section>
  );
}
