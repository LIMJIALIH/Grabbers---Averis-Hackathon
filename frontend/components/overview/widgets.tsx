"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Sankey } from "recharts";
import type { LinkProps as SankeyLinkProps, NodeProps as SankeyNodeProps } from "recharts/types/chart/Sankey";
import { useCases } from "@/lib/app-state";
import { CATEGORIES, CATEGORY_SHADE, FIELDS, categoryLabel, fieldLabel, summarise, type Summary } from "@/lib/cases";
import { Abbr, COUNT_DELAY, CountUp, DemoChip, Dropdown, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import JellyRadio from "@/components/JellyRadio";

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
        <span className="text-[14px] font-bold uppercase leading-[18px] tracking-[0.06em] text-ink-2">Straight-through</span>
        {timed && <Dropdown label="Period" value={days} onChange={setDays} options={PERIODS} />}
      </div>
      <div className="mt-3 text-[40px] font-semibold leading-[44px] tracking-[-0.03em]" aria-live="polite">
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
        <span className="text-[14px] font-bold uppercase leading-[18px] tracking-[0.06em] text-ink-2">Amendment cost avoided</span>
        <DemoChip text="Estimate" title="A range from published Malaysian carrier tariffs, not a measured saving." />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[30px] font-semibold leading-[36px] tracking-[-0.03em]" aria-live="polite">
        <span className="text-[18px] tracking-[-0.02em] text-ink-3">RM</span>
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
      MISMATCH: { name: "Defect", color: "var(--flow-defect)", col: 2, href: "/?status=MISMATCH" },
      NEEDS_REVIEW: { name: "Needs review", color: "var(--review)", col: 2, href: "/?status=NEEDS_REVIEW" },
      approved: { name: "Approved", color: "var(--ok)", col: 3, href: "/?scope=resolved" },
      escalated: { name: "Escalated", color: "var(--ink-2)", col: 3, href: "/?scope=escalated" },
      awaiting: { name: "Awaiting carrier", color: "var(--ink-2)", col: 3, href: "/?scope=awaiting" },
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
    return { nodes, links };
  }, [cases, resolutions]);
  const last = Math.max(0, ...data.nodes.map((n) => n.col));

  return (
    <section ref={ref} className="card enter">
      {/* The "still need a person" headline lives in the Welcome card beside this; stating it twice made readers reconcile. */}
      <CardHead title={`Where all ${cases.length} emails went`} right={<span className="text-[12px] text-ink-3">Click a stage to open it</span>} />
      {data.links.length === 0 ? (
        <Empty title="Nothing has come in yet" hint="Once the inbox is read, each email’s path through the pipeline shows here." />
      ) : (
        <div className="p-4 pr-2">
          <ResponsiveContainer width="100%" height={180}>
            <Sankey data={data} nodeWidth={10} nodePadding={16} linkCurvature={0.5} iterations={64} sort={false} align="left"
              margin={{ top: 8, bottom: 8, left: FLOW_LEFT, right: 132 }}
              node={(p: SankeyNodeProps) => <FlowNodeMark {...p} last={last} seen={seen} onOpen={(href) => router.push(href)} />}
              link={(p: SankeyLinkProps) => <FlowLink {...p} last={last} seen={seen} />} />
          </ResponsiveContainer>
        </div>
      )}
      {/* In a div: a table ignores sr-only's 1px height and would stretch the page. */}
      <div className="sr-only"><table>
        <caption>Emails moving between pipeline stages</caption>
        <thead><tr><th>From</th><th>To</th><th>Emails</th></tr></thead>
        <tbody>{data.links.map((l) => <tr key={`${l.source}-${l.target}`}><td>{data.nodes[l.source].name}</td><td>{data.nodes[l.target].name}</td><td>{l.value}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

/* recharts spaces columns evenly. The inbox splits early and the outcomes sit closer to the classifier split,
   so each column is moved to its own share of the width (inbox → still open). Only for the full four-column flow. */
const FLOW_LEFT = 80; // room for the inbox label, which sits left of its bar (right of it, it ran into the next column)
const COL_AT = [0, 0.19, 0.58, 1];
const FLOW_LABEL_W = 116;
const FLOW_MIN_RUN = 64;
const placeX = (x: number, col: number, last: number) =>
  last === 3 && col > 0 ? FLOW_LEFT + ((x - FLOW_LEFT) * COL_AT[col] * last) / col : x;

/** Nodes fade in on the count-up beat, one column after another. */
function FlowNodeMark({ x: rawX, y, width, height, payload, last, seen, onOpen }: SankeyNodeProps & { last: number; seen: boolean; onOpen: (href: string) => void }) {
  const n = payload as unknown as FlowNode & { value: number };
  const x = placeX(rawX, n.col, last);
  const delay = COUNT_DELAY + n.col * 280;
  const go = () => n.href && onOpen(n.href);
  return (
    <g role="link" tabIndex={0} aria-label={`${n.name}: ${n.value}`} className="flow-node cursor-pointer outline-none"
      onClick={go} onKeyDown={(e) => e.key === "Enter" && go()}
      style={{ opacity: seen ? 1 : 0, transition: `opacity 300ms ease ${delay}ms` }}>
      <rect className="flow-bar" x={x} y={y} width={width} height={Math.max(height, 2)} rx={3} fill={n.color} />
      {/* Plain text, no chip. The inbox label sits left of its bar; a tall middle node ("No check needed") is labelled
          low, clear of the bands crossing its middle. */}
      <text x={n.col === 0 ? x - 8 : x + width + 8} y={n.col > 0 && height > 80 ? y + height - 16 : y + height / 2}
        textAnchor={n.col === 0 ? "end" : "start"} dominantBaseline="middle" fontSize={13} fill="var(--ink)">
        {n.name} <tspan className="num" fontWeight={600}>{n.value}</tspan>
      </text>
    </g>
  );
}

/** Each band draws itself left to right, after the column it leaves has landed. */
function FlowLink({ sourceX: sx, sourceY, targetX: tx, targetY, linkWidth, payload, last, seen }: SankeyLinkProps & { last: number; seen: boolean }) {
  const from = payload.source as unknown as FlowNode;
  const to = payload.target as unknown as FlowNode;
  // A link leaves from its source node's right edge (x + nodeWidth 10) and lands on the target node's x.
  // Out of the outcome column the band starts past the label ("Needs review 27" is the longest), so text stays on clear ground.
  const targetX = placeX(tx, to.col, last);
  // On a narrow card the label offset can eat the whole gap, squashing a thick band into a blob: always keep a run to curve over.
  // The band runs straight from the bar, behind the label text (nodes draw on top), so there's no blank gap.
  // Start at the bar's centre (nodes draw over links), so the band's edge is tucked under the bar, never beside it.
  const sourceX = Math.min(placeX(sx - 10, from.col, last) + 5, targetX - FLOW_MIN_RUN);
  const sourceControlX = (sourceX + targetX) / 2; // linkCurvature 0.5: both control points at the midpoint
  const targetControlX = sourceControlX;
  const delay = COUNT_DELAY + from.col * 280 + 140;
  const color = from.col === 0 ? to.color : from.color; // out of the inbox, a band wears its destination: BL reads burgundy, the rest recedes
  return (
    <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={color} strokeWidth={Math.max(linkWidth, 1)} pathLength={1} strokeDasharray="1"
      className="flow-link"
      style={{ strokeDashoffset: seen ? 0 : 1, transition: `stroke-dashoffset 700ms var(--ease-out) ${delay}ms, opacity 150ms ease` }} />
  );
}

/* ---- Where defects come from. Numbers first (the claim), then two plain ranked bar lists:
   which field fails, and which carrier's drafts fail most often. */
const MIN_DRAFTS = 10; // a carrier's rate only means something over enough drafts
export function DefectBreakdown() {
  const { cases } = useCases();
  const router = useRouter();
  const [ref, seen] = useInView<HTMLElement>(0.25);
  const { bad, total, fields, carriers } = useMemo(() => {
    const bl = cases.filter((c) => c.category === "BL_COMPARISON");
    const bad = bl.filter((c) => c.status === "MISMATCH");
    const fields = FIELDS.map(([k]) => ({ k, n: bad.filter((c) => c.defects.includes(k)).length })).sort((a, b) => b.n - a.n);
    const by = new Map<string, { label: string; code: string; n: number; bad: number }>();
    bl.forEach((c) => {
      if (!c.ship.scac) return;
      const r = by.get(c.ship.scac) ?? { label: c.ship.carrier ?? c.ship.scac, code: c.ship.scac, n: 0, bad: 0 };
      r.n++;
      if (c.status === "MISMATCH") r.bad++;
      by.set(c.ship.scac, r);
    });
    const carriers = [...by.values()].filter((r) => r.n >= MIN_DRAFTS).sort((a, b) => b.bad / b.n - a.bad / a.n || b.n - a.n).slice(0, 5);
    return { bad: bad.length, total: bl.length, fields, carriers };
  }, [cases]);
  const top = fields[0];
  const worst = carriers[0];
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    // Its own container: the stat row and the two bar lists split by the card's width, not the page's.
    // On Insights it spans both rows of the page grid and shares them: header + stats = row 1, bar lists = row 2.
    <section ref={ref} className="card enter @container grid content-start gap-y-5 @4xl:col-start-2 @4xl:row-span-2 @4xl:row-start-1 @4xl:grid-rows-subgrid">
      {bad === 0 ? (
        <div>
          <CardHead title="Where defects come from" right={<span className="text-[12px] text-ink-3">{total} BL drafts checked</span>} />
          <Empty title="No defects yet" hint="When a BL differs from its SI, the field and the carrier behind it show up here." />
        </div>
      ) : (
        <>
          <div>
          <CardHead title="Where defects come from" right={<span className="text-[12px] text-ink-3">{total} BL drafts checked</span>} />
          <div className="grid gap-px border-b border-line bg-line @2xl:grid-cols-3">
            <Stat label="Defective drafts" value={<CountUp to={bad} />} sub={<>of {total} checked · <CountUp to={pct(bad, total)} suffix="%" /></>} />
            <Stat label={`Wrong ${fieldLabel(top.k).toLowerCase()}`} value={<CountUp to={top.n} />}
              sub={<><CountUp to={pct(top.n, bad)} suffix="%" /> of defective drafts, the most common error</>} tone="defect" />
            {worst && <Stat label={`Highest defect rate · ${worst.label}`} value={<CountUp to={pct(worst.bad, worst.n)} suffix="%" />}
              sub={<>{worst.bad} of {worst.n} of its drafts had a defect</>} />}
          </div>
          </div>
          <div className="grid content-start gap-6 px-5 pb-5 @3xl:grid-cols-2">
            <RankList title="By field" note="drafts with this field wrong" seen={seen}
              rows={fields.map((f) => ({ key: f.k, label: fieldLabel(f.k), value: f.n, share: f.n / top.n, text: `${f.n}`, go: () => router.push(`/?field=${f.k}`) }))} />
            <RankList title="By carrier" note={`defect rate, carriers with ${MIN_DRAFTS}+ drafts`} seen={seen}
              rows={carriers.map((r) => ({ key: r.code, label: r.label, code: r.label === r.code ? null : r.code, value: r.bad / r.n, share: r.bad / r.n,
                text: `${pct(r.bad, r.n)}%`, go: () => router.push(`/?status=MISMATCH&q=${r.code}`) }))} />
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub: React.ReactNode; tone?: "defect" }) {
  return (
    <div className="bg-surface px-5 py-4">
      <span className="label">{label}</span>
      <div className={cn("mt-1 text-[30px] font-semibold leading-[34px] tracking-[-0.03em]", tone === "defect" && "text-defect")}>{value}</div>
      <p className="mt-1 text-[12px] text-ink-3">{sub}</p>
    </div>
  );
}

type RankRow = { key: string; label: string; code?: string | null; value: number; share: number; text: string; go: () => void };
function RankList({ title, note, rows, seen }: { title: string; note: string; rows: RankRow[]; seen: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 flex items-baseline justify-between gap-3"><span className="label">{title}</span><span className="text-[11px] text-ink-3">{note}</span></p>
      <ul className="grid gap-0.5">
        {rows.map((r, i) => (
          <li key={r.key}>
            <button onClick={r.go} className="grid h-9 w-full grid-cols-[112px_minmax(0,1fr)_44px] items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-2">
              <span className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
                <span className="truncate">{r.label}</span>{r.code && <span className="num text-[10px] text-ink-3">{r.code}</span>}
              </span>
              <span className="h-2 rounded-full bg-surface-2">
                <span className="block h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: seen ? `${Math.max(r.share * 100, r.value ? 2 : 0)}%` : "0%", background: i === 0 ? "var(--defect)" : "var(--b-300)", transitionDelay: `${COUNT_DELAY + i * 80}ms` }} />
              </span>
              <span className={cn("num text-right text-[13px]", i === 0 && "font-semibold text-defect")}>{r.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
                  {i === 0 && <span className="absolute -top-6 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-2" style={{ left: `${pos(GATE[r.cat])}%` }}>gate</span>}
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

// TEST-ONLY:start (TrendChart: synthetic series, cases carry no received time; replace with real counts or remove the card)
/* §3 — pixel-block trend. SYNTHETIC: cases carry no received time, so a seeded series is
   generated at a realistic inbox volume and split by the real category mix. */
/** Seeded PRNG (mulberry32) so the demo series is the same on every load. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ROWS = 34;
const BASE_PER_DAY = 140; // ponytail: fixed demo volume; swap for real received-at counts when the API has them
// days covered and hours per column: all three land near 55 columns so the grid always reads as a skyline.
const RANGES = { Weekly: { days: 7, hours: 3 }, Monthly: { days: 30, hours: 12 }, Yearly: { days: 364, hours: 168 } } as const;
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en", o);
export function TrendChart() {
  const { cases } = useCases();
  const [range, setRange] = useState<keyof typeof RANGES>("Weekly");
  const [hover, setHover] = useState<number | null>(null);
  // The blocks stay empty until a third of the card is on screen, then fill in bottom-up, left to right. Replays on a range change.
  const [card, seen] = useInView<HTMLElement>(1 / 3);
  const [filled, setFilled] = useState(false);
  const lag = useRef(COUNT_DELAY); // the 1s beat is for the first reveal only; range switches refill straight away
  useEffect(() => {
    if (!seen) return;
    setFilled(false);
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setFilled(true)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [seen, range]);
  const [grp, setGrp] = useState<string | null>(null); // hovered day name (Weekly) or month name (Monthly / Yearly)
  const { data, labels } = useMemo(() => {
    const { days, hours } = RANGES[range];
    const share = CATEGORIES.map((c) => cases.filter((x) => x.category === c).length);
    const sum = share.reduce((a, b) => a + b, 0) || 1;
    const r = rng(7);
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
    const out = Array.from({ length: (days * 24) / hours }, (_, i) => {
      const d = new Date(start.getTime() + i * hours * 3600_000);
      const h = d.getHours();
      const dayF = hours >= 24 ? 1 : [0, 6].includes(d.getDay()) ? 0.35 : 1;
      const hourF = hours >= 24 ? 1 : h >= 8 && h < 18 ? 1.6 : h >= 6 && h < 20 ? 0.7 : 0.15;
      const total = BASE_PER_DAY * (hours / 24) * dayF * hourF * (0.75 + 0.5 * r());
      return { d, n: CATEGORIES.map((_, k) => Math.round(total * (share[k] / sum) * (0.7 + 0.6 * r()))) };
    });
    const labels = out.map((x, i) => {
      const day = fmt(x.d, { weekday: "short", day: "numeric", month: "short" });
      const newDay = x.d.getHours() === 0;
      const monthGroup = { group: `${x.d.getFullYear()}-${x.d.getMonth()}`, groupTitle: fmt(x.d, { month: "long", year: "numeric" }) };
      if (range === "Weekly") return { tick: newDay ? fmt(x.d, { weekday: "short" }) : "", full: `${day}, ${String(x.d.getHours()).padStart(2, "0")}:00`, group: String(Math.floor(i / 8)), groupTitle: day, month: "" };
      if (range === "Monthly") {
        // Row 1: day numbers, anchored on the 1st then every 5th. Row 2: month name at the start and at each month change.
        const n = x.d.getDate();
        const show = newDay && (n === 1 || (n % 5 === 0 && n <= 25));
        const month = i === 0 || (newDay && n === 1) ? fmt(x.d, { month: "long" }) : "";
        return { tick: show ? String(n) : "", month, full: `${day}, ${newDay ? "AM" : "PM"}`, ...monthGroup };
      }
      const m = fmt(x.d, { month: "short" });
      // Year suffix on the first month and on each January, so the reader always knows which year they are in.
      const yy = i === 0 || x.d.getMonth() === 0 ? ` ${String(x.d.getFullYear()).slice(-2)}` : "";
      return { tick: i === 0 || out[i - 1].d.getMonth() !== x.d.getMonth() ? m + yy : "", full: `Week of ${x.d.getDate()} ${m}`, month: "", ...monthGroup };
    });
    return { data: out.map((x) => x.n), labels };
  }, [cases, range]);
  const cols = data.length;
  const totalOf = (n: number[]) => n.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...data.map(totalOf));
  // Emails per block is 1, 2, 5, 10, 20, 50 ...; the axis ticks are multiples of 5 (never 731, 1097), at most 5 of them.
  const niceUnit = (x: number) => { const p = 10 ** Math.floor(Math.log10(x)), m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const unit = niceUnit(Math.max(1, max / (ROWS - 2))); // leaves headroom above the tallest column
  const top = ROWS * unit;
  const step = [5, 10, 20, 25, 50].flatMap((m) => [1, 10, 100, 1000, 10000].map((p) => m * p)).sort((a, b) => a - b).find((v) => top / v <= 5)!;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, k) => k * step);
  const catTotals = CATEGORIES.map((_, k) => data.reduce((a, n) => a + n[k], 0));
  const grand = totalOf(catTotals);
  // A spacer track between groups (Weekly: days, Monthly / Yearly: months) so each period reads as its own block.
  const GAP = 20;
  const newDay = (i: number) => i > 0 && labels[i].group !== labels[i - 1].group;
  const gaps = data.filter((_, i) => newDay(i)).length;
  const grid = { gridTemplateColumns: data.map((_, i) => (newDay(i) ? `${GAP}px ` : "") + "minmax(0, 1fr)").join(" ") };
  const spacer = (i: number) => (newDay(i) ? <span aria-hidden /> : null);
  // Hovering a day name (Weekly) or a month name (Monthly / Yearly) breaks that period down; the rest fades.
  const inGrp = (i: number) => grp != null && labels[i].group === grp;
  const grpCols = grp == null ? [] : labels.flatMap((l, i) => (l.group === grp ? [i] : []));
  const groupHover = (i: number) => ({
    onMouseEnter: () => { setGrp(labels[i].group); setHover(null); },
    onMouseLeave: () => setGrp(null),
  });
  // Centre of column i: track width w = (100% - spacers - 3px gutters) / cols, offset by the tracks and gutters before it.
  const xAt = (i: number) => {
    const g = data.slice(0, i + 1).filter((_, j) => newDay(j)).length;
    const w = `((100% - ${gaps * GAP + 3 * (cols + gaps - 1)}px) / ${cols})`;
    return `calc(${w} * ${i + 0.5} + ${g * GAP + 3 * (i + g)}px)`;
  };
  return (
    <section ref={card} className="card enter">
      <CardHead
        title="Classification trend"
        right={
          <>
            <JellyRadio
              ariaLabel="Range"
              size="sm"
              items={Object.keys(RANGES)}
              value={range}
              onChange={(k) => { lag.current = 0; setRange(k as keyof typeof RANGES); setHover(null); setGrp(null); }}
              chipColor="var(--surface-2)"
              activeColor="var(--ink)"
              textColor="var(--ink-2)"
              activeTextColor="var(--paper)"
              className="-my-[var(--jr-pad-y)]"
            />
          </>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 px-6 pt-6">
        <div>
          <span className="label">Emails received</span>
          <div className="num mt-1 text-[40px] font-semibold leading-[44px] tracking-[-0.03em]"><CountUp to={grand} /></div>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-hidden>
          {CATEGORIES.map((c, k) => (
            <li key={c} className="flex items-center gap-2 text-[13px] text-ink-2">
              <i className="size-3 rounded-[3px]" style={{ background: CATEGORY_SHADE[c] }} />
              {categoryLabel(c)} <span className="num text-ink-3">{catTotals[k].toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="px-6 pt-3 text-[12px] text-ink-3">Each block is {unit === 1 ? "one email" : `about ${unit} emails`}. Darker means more important: BL comparisons are the darkest.</p>
      <div className="flex gap-4 px-6 pb-6 pt-5">
        <div className="relative h-[340px] w-10 shrink-0 text-right text-[11px] text-ink-3" aria-hidden>
          {ticks.map((v) => <span key={v} className="num absolute right-0 translate-y-1/2 leading-3" style={{ bottom: `${(v / top) * 100}%` }}>{v.toLocaleString()}</span>)}
        </div>
        <div className="relative min-w-0 flex-1" onMouseLeave={() => setHover(null)}>
          <div className="grid h-[340px] gap-[3px]" style={grid} role="img" aria-label="Emails over time, stacked by category.">
            {data.map((n, x) => {
              let cum = 0;
              const bounds = n.map((v) => (cum += v, Math.round(cum / unit)));
              return (
                <Fragment key={x}>
                  {spacer(x)}
                  <div onMouseEnter={() => setHover(x)}
                    className={cn("flex cursor-default flex-col-reverse gap-[3px] transition-opacity duration-150", grp != null ? (!inGrp(x) && "opacity-25") : hover != null && hover !== x && "opacity-45")}>
                    {Array.from({ length: ROWS }, (_, r) => {
                      const cat = bounds.findIndex((b) => r < b);
                      return <i key={r} className="w-full flex-1 rounded-[2px] transition-[background-color] duration-300 ease-out"
                        style={{ background: cat === -1 || !filled ? "var(--b-050)" : CATEGORY_SHADE[CATEGORIES[cat]], transitionDelay: filled ? `${lag.current + x * 14 + r * 9}ms` : "0ms" }} />;
                    })}
                  </div>
                </Fragment>
              );
            })}
          </div>
          <div className="mt-3 grid gap-[3px] text-[11px] uppercase tracking-wide text-ink-3" style={grid} aria-hidden>
            {labels.map((l, i) => (
              <Fragment key={i}>
                {spacer(i)}
                {/* Weekly / Yearly: every column under a day or month name is a hover target for its breakdown. */}
                <span className={cn("num relative h-4", range !== "Monthly" && "cursor-pointer")} {...(range !== "Monthly" ? groupHover(i) : {})}>
                  <span className={cn("absolute left-0 whitespace-nowrap transition-colors", range !== "Monthly" && inGrp(i) && "text-ink")}>{l.tick}</span>
                </span>
              </Fragment>
            ))}
          </div>
          {labels.some((l) => l.month) && (
            <div className="mt-1 grid gap-[3px] text-[11px] font-semibold uppercase tracking-wide text-ink-2" style={grid} aria-hidden>
              {labels.map((l, i) => (
                <Fragment key={i}>
                  {spacer(i)}
                  <span className="relative h-5 cursor-pointer" {...groupHover(i)}>
                    {l.month && <span className={cn("absolute left-0 top-0 whitespace-nowrap border-l-2 border-ink-3 pl-1.5 leading-5 transition-colors", inGrp(i) ? "text-ink" : "text-ink-2")}>{l.month}</span>}
                  </span>
                </Fragment>
              ))}
            </div>
          )}
          {grp != null && grpCols.length > 0 && (() => {
            const first = grpCols[0], last = grpCols[grpCols.length - 1];
            const mid = (first + last) / 2 / cols;
            const shift = mid < 0.18 ? "0%" : mid > 0.82 ? "-100%" : "-50%";
            return <DayDonut
              title={labels[first].groupTitle}
              counts={CATEGORIES.map((_, k) => grpCols.reduce((a, i) => a + data[i][k], 0))}
              left={shift === "0%" ? xAt(first) : shift === "-100%" ? xAt(last) : `calc((${xAt(first)} + ${xAt(last)}) / 2)`}
              shift={shift} />;
          })()}
          {hover != null && (
            <>
              <div className="pointer-events-none absolute top-0 h-[340px] border-l border-dashed border-ink-3" style={{ left: xAt(hover) }} />
              <div className="pointer-events-none absolute top-3 z-10 min-w-48 rounded-xl bg-surface px-4 py-3 text-[13px] shadow-[var(--shadow-pop)] ring-1 ring-line-strong"
                style={{ left: xAt(hover), transform: hover > cols * 0.6 ? "translateX(calc(-100% - 14px))" : "translateX(14px)" }}>
                <div className="mb-2 rounded-md bg-surface-2 px-2 py-1 text-[12px] font-medium text-ink-2">{labels[hover].full}</div>
                {[...CATEGORIES].reverse().map((c) => (
                  <div key={c} className="flex items-center gap-2 py-0.5">
                    <i className="size-2.5 rounded-[3px]" style={{ background: CATEGORY_SHADE[c] }} />
                    <span className="flex-1 text-ink-2">{categoryLabel(c)}</span>
                    <span className="num font-semibold">{data[hover][CATEGORIES.indexOf(c)]}</span>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-line pt-1.5 font-semibold"><span>Total</span><span className="num">{totalOf(data[hover])}</span></div>
              </div>
            </>
          )}
        </div>
      </div>
      {/* In a div: a table ignores sr-only's 1px height and would stretch the page. */}
      <div className="sr-only"><table>
        <caption>Emails over time by category</caption>
        <thead><tr><th>Period</th>{CATEGORIES.map((c) => <th key={c}>{categoryLabel(c)}</th>)}</tr></thead>
        <tbody>{data.map((n, i) => <tr key={i}><td>{labels[i].full}</td>{n.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
      </table></div>
    </section>
  );
}

// TEST-ONLY:end
