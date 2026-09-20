"use client";

// TEST-ONLY (whole file): admin dashboard for the simulated retraining loop. Delete this folder for production.

import { AlertTriangle, CircleDot, Diamond, Loader2, Play, RotateCcw } from "lucide-react";
import { useCases } from "@/lib/app-state";
import { BASE_MODELS, activeModel, freshExamples, nextRun, retrain, rollback, setConfig, setSchedule, useModelAdmin, type Run, type RunStatus } from "@/lib/modelAdmin";
import { CountUp, DemoChip, Dropdown, Empty, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const when = (t: number) => new Date(t).toLocaleString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const pts = (a: number, b: number | null) => (b == null ? "—" : `${b >= a ? "+" : ""}${((b - a) * 100).toFixed(1)}`);
const STATUS: Record<RunStatus, { cls: string; word: string; Icon: typeof CircleDot }> = {
  promoted: { cls: "bg-ok-tint text-ok", word: "Promoted", Icon: CircleDot },
  rejected: { cls: "bg-defect-tint text-defect", word: "Rejected", Icon: AlertTriangle },
  skipped: { cls: "bg-surface-2 text-ink-3-on-2", word: "Skipped", Icon: Diamond },
  running: { cls: "bg-review-tint text-review-ink", word: "Running", Icon: Loader2 },
  failed: { cls: "bg-defect-tint text-defect", word: "Failed", Icon: AlertTriangle },
};

function Num({ label, value, onChange, step = 1, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="grid gap-1.5"><span className="label">{label}</span>
      <input type="number" className="field w-full" value={value} step={step} min={min} max={max}
        onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} />
    </label>
  );
}

/* Ordered by how an admin thinks: what is live, what the loop learns from, when it runs, how it trains, what happened. */
export default function Admin() {
  const s = useModelAdmin();
  const { corrections } = useCases();
  if (!s) return <div className="grid gap-5"><Skeleton className="h-28" /><Skeleton className="h-72" /></div>;

  const model = activeModel(s);
  const fresh = freshExamples(s);
  const running = s.runs[0]?.status === "running";
  const ready = Math.min(100, Math.round((fresh / Math.max(1, s.config.minNewExamples)) * 100));
  const sc = s.schedule;
  const hours = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));
  const fixes = Object.entries(corrections).flatMap(([id, byField]) => Object.entries(byField).map(([field, c]) => ({ id, field, ...c })));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Model admin</h1>
          <p className="mt-1 max-w-[62ch] text-ink-2">Every approval, escalation and correction an operator makes is a labelled example. This page turns them into a retrained classifier, on a schedule, and only promotes it when it scores better.</p>
        </div>
        <DemoChip text="Simulated runs" title="No training backend is connected yet. Settings, schedule and the promotion gate are real; the scores are generated." />
      </div>

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Model summary">
        {[
          { label: "Active model", node: <span className="num">{model.version}</span>, sub: `${s.config.baseModel}, fine-tuned` },
          { label: "Macro F1", node: <><CountUp to={Math.round(model.f1 * 1000) / 10} ms={900} />%</>, sub: `Held out ${s.config.valSplit}% of examples` },
          { label: "New examples", node: <CountUp to={fresh} />, sub: `${s.signal} human decisions in total` },
          { label: "Next run", node: <span className="text-[24px] leading-[44px]">{s.nextRunAt ? when(s.nextRunAt) : "Off"}</span>, sub: sc.mode === "off" ? "Scheduling is off" : `${sc.mode === "weekly" ? "Every " + WEEKDAYS[sc.weekday] : "Monthly on day " + sc.monthDay}, ${String(sc.hour).padStart(2, "0")}:00` },
        ].map((k) => (
          <div key={k.label} className="card enter p-5">
            <span className="label">{k.label}</span>
            <div className="mt-2 text-[40px] font-semibold leading-[44px] tracking-[-0.03em]">{k.node}</div>
            <p className="mt-1 truncate text-[13px] text-ink-2" title={k.sub}>{k.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 @4xl:grid-cols-2">
        <section className="card enter">
          <div className="card-head"><h2 className="text-[18px] font-semibold leading-6">Retraining agent</h2>
            <span className={cn("pill", running ? "bg-review-tint text-review-ink" : "bg-surface-2 text-ink-3-on-2")}>{running ? "Running" : sc.mode === "off" ? "Off" : "Waiting"}</span></div>
          <div className="grid gap-5 p-5">
            <div role="group" aria-label="Schedule" className="flex w-fit rounded-[var(--radius-control)] border border-line-strong p-0.5">
              {(["off", "weekly", "monthly"] as const).map((m) => (
                <button key={m} aria-pressed={sc.mode === m} onClick={() => setSchedule({ mode: m })}
                  className={cn("h-8 rounded-[8px] px-4 text-[13px] font-medium capitalize", sc.mode === m ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-2")}>{m}</button>
              ))}
            </div>
            {sc.mode !== "off" && (
              <div className="flex flex-wrap gap-3">
                <div className="grid gap-1.5"><span className="label">{sc.mode === "weekly" ? "Day" : "Day of month"}</span>
                  {sc.mode === "weekly"
                    ? <Dropdown label="Weekday" value={String(sc.weekday)} onChange={(v) => setSchedule({ weekday: Number(v) })} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
                    : <Dropdown label="Day of month" value={String(sc.monthDay)} onChange={(v) => setSchedule({ monthDay: Number(v) })} options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />}
                </div>
                <div className="grid gap-1.5"><span className="label">Time</span>
                  <Dropdown label="Hour" value={String(sc.hour)} onChange={(v) => setSchedule({ hour: Number(v) })} options={hours} /></div>
              </div>
            )}
            <p className="text-[13px] text-ink-2">
              {sc.mode === "off" ? "Nothing runs on its own. Use Retrain now." : <>Next run <strong className="font-semibold text-ink">{when(nextRun(sc)!)}</strong>. It skips itself unless at least {s.config.minNewExamples} new examples exist.</>}
            </p>
            <div className="grid gap-1.5">
              <div className="flex justify-between text-[13px]"><span className="text-ink-2">Learning signal</span><span className="num">{fresh} / {s.config.minNewExamples}</span></div>
              <div className="h-2.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-burgundy transition-[width] duration-500" style={{ width: `${ready}%` }} /></div>
            </div>
            <button className="btn btn-primary w-fit" disabled={running} onClick={() => retrain("manual")}>
              {running ? <Loader2 size={15} className="spin" aria-hidden /> : <Play size={15} aria-hidden />}{running ? "Training…" : "Retrain now"}
            </button>
          </div>
        </section>

        <section className="card enter">
          <div className="card-head"><h2 className="text-[18px] font-semibold leading-6">Fine-tuning settings</h2></div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2"><span className="label">Base model</span>
              <Dropdown label="Base model" value={s.config.baseModel} onChange={(v) => setConfig({ baseModel: v })} options={BASE_MODELS.map((m) => ({ value: m, label: m }))} /></div>
            <Num label="Epochs" value={s.config.epochs} min={1} max={20} onChange={(v) => setConfig({ epochs: v })} />
            <Num label="Batch size" value={s.config.batchSize} min={1} max={256} onChange={(v) => setConfig({ batchSize: v })} />
            <Num label="Learning rate" value={s.config.learningRate} step={0.000005} min={0} onChange={(v) => setConfig({ learningRate: v })} />
            <Num label="Validation split (%)" value={s.config.valSplit} min={5} max={40} onChange={(v) => setConfig({ valSplit: v })} />
            <Num label="Min new examples" value={s.config.minNewExamples} min={1} onChange={(v) => setConfig({ minNewExamples: v })} />
            <Num label="Must beat active by (F1 pts)" value={s.config.minGain} step={0.1} min={0} onChange={(v) => setConfig({ minGain: v })} />
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" className="size-4 accent-[var(--burgundy)]" checked={s.config.autoPromote} onChange={(e) => setConfig({ autoPromote: e.target.checked })} />
              <span>Promote automatically when the candidate clears the gate</span>
            </label>
          </div>
        </section>
      </div>

      <section className="card enter">
        <div className="card-head"><h2 className="text-[18px] font-semibold leading-6">Run history</h2><span className="text-[12px] text-ink-3">{s.runs.length} runs</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="label border-b border-line">{["Run", "Trigger", "Started", "Examples", "F1 change", "Result"].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {s.runs.slice(0, 12).map((r: Run) => {
                const st = STATUS[r.status];
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="num px-5 py-3">{r.id}</td>
                    <td className="px-5 py-3 capitalize">{r.trigger}</td>
                    <td className="num px-5 py-3 text-ink-2">{when(r.startedAt)}</td>
                    <td className="num px-5 py-3">{r.examples}</td>
                    <td className={cn("num px-5 py-3", r.f1After != null && (r.f1After >= r.f1Before ? "text-ok" : "text-defect"))}>{pts(r.f1Before, r.f1After)}</td>
                    <td className="px-5 py-3"><span className={cn("pill", st.cls)}><st.Icon size={12} aria-hidden className={r.status === "running" ? "spin" : ""} />{st.word}</span>
                      <span className="ml-2 text-[12px] text-ink-3">{r.note}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 @4xl:grid-cols-2">
        <section className="card enter">
          <div className="card-head"><h2 className="text-[18px] font-semibold leading-6">Model versions</h2></div>
          <ul className="grid gap-1 p-3">
            {[...s.models].reverse().map((m) => (
              <li key={m.version} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <span className="num w-12 font-semibold">{m.version}</span>
                <span className="num text-ink-2">{(m.f1 * 100).toFixed(1)}% F1</span>
                <span className="flex-1 truncate text-[12px] text-ink-3">{when(m.trainedAt)}</span>
                {m.version === s.active
                  ? <span className="pill bg-ok-tint text-ok">Active</span>
                  : <button className="btn btn-sm" onClick={() => rollback(m.version)}><RotateCcw size={13} aria-hidden />Use this</button>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card enter">
          <div className="card-head"><h2 className="text-[18px] font-semibold leading-6">Learning from corrections</h2><span className="text-[12px] text-ink-3">this session</span></div>
          {fixes.length === 0 ? (
            <Empty title="No corrections yet" hint="When an operator fixes a field, the corrected value becomes a training example here." />
          ) : (
            <ul className="divide-y divide-line">
              {fixes.slice(0, 6).map((f) => (
                <li key={f.id + f.field} className="px-5 py-3">
                  <div className="flex justify-between gap-3"><span className="num text-[12px] text-ink-3">{f.id}</span><span className="text-[12px] text-ink-3">{f.field.replace(/_/g, " ")}</span></div>
                  <div className="truncate text-[13px]">{f.value}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
