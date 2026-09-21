"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart } from "recharts";
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
