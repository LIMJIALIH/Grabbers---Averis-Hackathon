"use client";

// TEST-ONLY (whole file): simulated retraining control plane. Delete with app/admin/ and its Shell hooks for production.

import { useSyncExternalStore } from "react";

/* Control plane for the classifier's fine-tuning loop. There is no training backend yet, so a run is
   SIMULATED: the store, schedule, promotion gate and history are real client code; the metrics are
   generated. When POST /api/v1/model/retrain exists, `retrain` calls it and `finish` reads its result. */

export type Trigger = "manual" | "weekly" | "monthly";
export type RunStatus = "running" | "promoted" | "rejected" | "skipped" | "failed";
export type Config = {
  baseModel: string;
  epochs: number;
  learningRate: number;
  batchSize: number;
  valSplit: number; // % of examples held out to score the candidate
  minNewExamples: number; // scheduled runs skip unless this many new human decisions exist
  minGain: number; // F1 points the candidate must beat the active model by
  autoPromote: boolean;
};
export type Schedule = { mode: "off" | "weekly" | "monthly"; weekday: number; monthDay: number; hour: number };
export type Model = { version: string; f1: number; trainedAt: number; examples: number };
export type Run = { id: string; trigger: Trigger; startedAt: number; finishedAt: number | null; examples: number; f1Before: number; f1After: number | null; status: RunStatus; note: string };
type State = { config: Config; schedule: Schedule; models: Model[]; active: string; runs: Run[]; signal: number; consumed: number; nextRunAt: number | null };

export const BASE_MODELS = ["bert-base-multilingual-cased", "distilbert-base-multilingual-cased", "xlm-roberta-base"];
const KEY = "docuverify-model-admin";
const DAY = 864e5;
const SIM_MS = 5000;

const DEFAULT_CONFIG: Config = { baseModel: BASE_MODELS[0], epochs: 3, learningRate: 0.00002, batchSize: 16, valSplit: 20, minNewExamples: 10, minGain: 0.5, autoPromote: true };
const DEFAULT_SCHEDULE: Schedule = { mode: "weekly", weekday: 0, monthDay: 1, hour: 2 };

/** Next fire time strictly after `from`, or null when the schedule is off. */
export function nextRun(sc: Schedule, from = Date.now()): number | null {
  if (sc.mode === "off") return null;
  const d = new Date(from);
  d.setHours(sc.hour, 0, 0, 0);
  if (sc.mode === "weekly") d.setDate(d.getDate() + ((sc.weekday - d.getDay() + 7) % 7));
  else d.setDate(sc.monthDay);
  while (d.getTime() <= from) sc.mode === "weekly" ? d.setDate(d.getDate() + 7) : d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
/** Simulated score change for a run: mostly small gains, sometimes a regression. */
const delta = (id: string, examples: number) => ((hash(id) % 1000) / 1000) * 0.024 - 0.005 + Math.min(examples, 60) * 0.00005;

/** Eight past weeks, so the page opens with a history instead of an empty table. */
function seed(now: number): State {
  const deltas = [0.012, 0.009, -0.002, 0.011, 0, 0.004, 0.008, 0.006];
  const examples = [64, 41, 23, 72, 6, 19, 38, 27];
  let f1 = 0.861;
  let v = 0;
  const models: Model[] = [{ version: "v1.0", f1, trainedAt: now - 60 * DAY, examples: 480 }];
  const runs: Run[] = deltas.map((d, i) => {
    const t = now - (8 - i) * 7 * DAY;
    const trigger: Trigger = i % 4 === 3 ? "monthly" : "weekly";
    const base = { id: `run_${String(i + 1).padStart(3, "0")}`, trigger, startedAt: t, finishedAt: t + 5.2 * 6e4, examples: examples[i], f1Before: f1 };
    if (examples[i] < DEFAULT_CONFIG.minNewExamples) return { ...base, finishedAt: t, f1After: null, status: "skipped", note: `Only ${examples[i]} new examples (needs ${DEFAULT_CONFIG.minNewExamples})` };
    const after = f1 + d;
    if (d * 100 >= DEFAULT_CONFIG.minGain) {
      f1 = after;
      models.push({ version: `v1.${++v}`, f1, trainedAt: t, examples: examples[i] });
      return { ...base, f1After: after, status: "promoted", note: `Promoted as v1.${v}` };
    }
    return { ...base, f1After: after, status: "rejected", note: `Gain ${(d * 100).toFixed(1)} pts, below the ${DEFAULT_CONFIG.minGain} pt gate` };
  });
  return { config: DEFAULT_CONFIG, schedule: DEFAULT_SCHEDULE, models, active: models[models.length - 1].version, runs: runs.reverse(), signal: 0, consumed: 0, nextRunAt: nextRun(DEFAULT_SCHEDULE, now) };
}

let state: State | null = null;
const listeners = new Set<() => void>();
function init(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      // A run left "running" by a closed tab will never finish.
      s.runs = s.runs.map((r) => (r.status === "running" && Date.now() - r.startedAt > 3 * SIM_MS ? { ...r, status: "failed", finishedAt: r.startedAt, note: "Interrupted: the page closed mid-run" } : r));
      return s;
    }
  } catch {}
  return seed(Date.now());
}
const get = () => (typeof window === "undefined" ? null : (state ??= init()));
function put(next: State) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => { listeners.delete(l); });
export const useModelAdmin = () => useSyncExternalStore(subscribe, get, () => null);

export const activeModel = (s: State) => s.models.find((m) => m.version === s.active)!;
export const freshExamples = (s: State) => Math.max(0, s.signal - s.consumed);

export function setConfig(patch: Partial<Config>) {
  const s = get(); if (s) put({ ...s, config: { ...s.config, ...patch } });
}
export function setSchedule(patch: Partial<Schedule>) {
  const s = get(); if (!s) return;
  const schedule = { ...s.schedule, ...patch };
  put({ ...s, schedule, nextRunAt: nextRun(schedule) });
}
/** Human decisions so far (approvals, escalations, corrections). Each one is a labelled example. */
export function setSignal(n: number) {
  const s = get(); if (s && s.signal !== n) put({ ...s, signal: n });
}
export function rollback(version: string) {
  const s = get(); if (s && s.models.some((m) => m.version === version)) put({ ...s, active: version });
}

export function retrain(trigger: Trigger) {
  const s = get();
  if (!s || s.runs[0]?.status === "running") return;
  const fresh = freshExamples(s);
  const id = `run_${String(s.runs.length + 1).padStart(3, "0")}`;
  const now = Date.now();
  const f1Before = activeModel(s).f1;
  if (trigger !== "manual" && fresh < s.config.minNewExamples) {
    put({ ...s, runs: [{ id, trigger, startedAt: now, finishedAt: now, examples: fresh, f1Before, f1After: null, status: "skipped", note: `Only ${fresh} new examples (needs ${s.config.minNewExamples})` }, ...s.runs] });
    return;
  }
  put({ ...s, runs: [{ id, trigger, startedAt: now, finishedAt: null, examples: fresh, f1Before, f1After: null, status: "running", note: "Fine-tuning on human-reviewed cases" }, ...s.runs] });
  setTimeout(() => finish(id), SIM_MS);
}

function finish(id: string) {
  const s = get(); const run = s?.runs.find((r) => r.id === id);
  if (!s || !run || run.status !== "running") return;
  const after = run.f1Before + delta(id, run.examples);
  const gain = (after - run.f1Before) * 100;
  const promote = s.config.autoPromote && gain >= s.config.minGain;
  const version = `v1.${s.models.length}`;
  const done: Run = { ...run, finishedAt: Date.now(), f1After: after, status: promote ? "promoted" : "rejected",
    note: promote ? `Promoted as ${version}` : s.config.autoPromote ? `Gain ${gain.toFixed(1)} pts, below the ${s.config.minGain} pt gate` : "Auto-promote is off: candidate kept for review" };
  put({
    ...s,
    runs: s.runs.map((r) => (r.id === id ? done : r)),
    consumed: s.signal,
    ...(promote ? { models: [...s.models, { version, f1: after, trainedAt: Date.now(), examples: run.examples }], active: version } : {}),
  });
}

/** Fires due scheduled runs while the app is open. The real scheduler is a server job (see note.md). */
export function startScheduler() {
  const tick = () => {
    const s = get();
    if (!s || s.schedule.mode === "off" || !s.nextRunAt || Date.now() < s.nextRunAt) return;
    const trigger = s.schedule.mode;
    put({ ...s, nextRunAt: nextRun(s.schedule) });
    retrain(trigger);
  };
  tick();
  const i = setInterval(tick, 15_000);
  return () => clearInterval(i);
}
