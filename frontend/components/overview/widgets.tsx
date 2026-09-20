"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart } from "recharts";
import { useCases } from "@/lib/app-state";
import { rng } from "@/lib/sample";
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

// TEST-ONLY:start (TrendChart: synthetic series, cases carry no received time; replace with real counts or remove the card)
/* §3 — pixel-block trend. SYNTHETIC: cases carry no received time, so a seeded series is
   generated at a realistic inbox volume and split by the real category mix. */
const ROWS = 34;
const BASE_PER_DAY = 140; // ponytail: fixed demo volume; swap for real received-at counts when the API has them
// days covered and hours per column: all three land near 55 columns so the grid always reads as a skyline.
const RANGES = { Weekly: { days: 7, hours: 3 }, Monthly: { days: 30, hours: 12 }, Yearly: { days: 364, hours: 168 } } as const;
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en", o);
export function TrendChart() {
  const { cases } = useCases();
  const [range, setRange] = useState<keyof typeof RANGES>("Weekly");
  const [hover, setHover] = useState<number | null>(null);
  // The blocks stay empty until half the plot is on screen, then fill in bottom-up, left to right. Replays on a range change.
  const [plot, seen] = useInView<HTMLDivElement>(0.5);
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
    <section className="card enter">
      <CardHead
        title="Classification trend"
        right={
          <>
            <DemoChip />
            <div role="group" aria-label="Range" className="flex rounded-[var(--radius-control)] border border-line-strong p-0.5">
              {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
                <button key={k} aria-pressed={k === range} onClick={() => { lag.current = 0; setRange(k); setHover(null); setGrp(null); }}
                  className={cn("h-8 rounded-[8px] px-3 text-[13px] font-medium", k === range ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-2")}>
                  {k}
                </button>
              ))}
            </div>
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
        <div ref={plot} className="relative min-w-0 flex-1" onMouseLeave={() => setHover(null)}>
          <div className="grid h-[340px] gap-[3px]" style={grid} role="img" aria-label="Emails over time, stacked by category. Demo data.">
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
      <table className="sr-only">
        <caption>Emails over time by category (demo data)</caption>
        <thead><tr><th>Period</th>{CATEGORIES.map((c) => <th key={c}>{categoryLabel(c)}</th>)}</tr></thead>
        <tbody>{data.map((n, i) => <tr key={i}><td>{labels[i].full}</td>{n.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
      </table>
    </section>
  );
}

// TEST-ONLY:end

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
      <CardHead title="Category mix" right={<DemoChip text="Rule-based" title="Keyword rules, not the classifier. Most emails land in Invoice query." />} />
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

/* §5 — which of the 7 fields fails most. % is of defective emails, and the card says so. */
const RANK_SHADE = ["var(--b-900)", "var(--b-700)", "var(--b-500)", "var(--b-300)", "var(--b-300)", "var(--b-100)", "var(--b-100)"];
export function DefectBars({ s }: { s: Summary }) {
  const router = useRouter();
  const rows = FIELDS.map(([k]) => ({ k, n: s.fieldDefects[k] ?? 0 })).sort((a, b) => b.n - a.n);
  const top = Math.max(1, ...rows.map((r) => r.n));
  const [ref, seen] = useInView<HTMLElement>(0.25); // bars grow as the card scrolls into view
  return (
    <section ref={ref} className="card enter">
      <CardHead title="Field defect rate" right={<span className="text-[12px] text-ink-3">of {s.mismatched} defective {s.mismatched === 1 ? "email" : "emails"}</span>} />
      {s.mismatched === 0 ? (
        <Empty title="No defects yet" hint="When a BL differs from its SI, the fields that fail show up here." />
      ) : (
        <ul className="grid gap-1 p-3">
          {rows.map((r, i) => (
            <li key={r.k}>
              <button onClick={() => router.push(`/?field=${r.k}`)} title={r.k}
                className="grid h-10 w-full grid-cols-[132px_minmax(0,1fr)_84px] items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-2">
                <span className="truncate text-[13px]">{fieldLabel(r.k)}</span>
                <span className="h-2.5 rounded-full bg-surface-2">
                  <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: seen ? `${(r.n / top) * 100}%` : "0%", background: RANK_SHADE[i], transitionDelay: `${COUNT_DELAY + i * 80}ms` }} />
                </span>
                <span className="num text-right text-[13px]"><CountUp to={r.n} ms={700} delay={i * 80} /><span className="text-ink-3"> · <CountUp to={Math.round((r.n / s.mismatched) * 100)} suffix="%" ms={700} delay={i * 80} /></span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
