"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { derive, isOpen, summarise, type Case, type Corrections, type RawCase, type Resolution, type Summary } from "./cases";
import { SAMPLE_CASES, rng } from "./sample"; // TEST-ONLY
import { clearAuditTrail, getAuditTrail, recordUserAction } from "./auditTrailStore";

/* ---- Account -------------------------------------------------------------
   Shaped like the future /api/v1/me response so nothing downstream changes when
   Google OAuth lands. Until then the only identity is the sample inbox. */
export type Account = { id: string; email: string; name: string; given_name: string; picture: string | null };
export const SAMPLE_ACCOUNT: Account = {
  id: "sample",
  email: "shipping.docs@aprilasia.com",
  name: "Shipping Docs",
  given_name: "",
  picture: null,
};
const SESSION_KEY = "docuverify-session";

/** given_name → email local part title-cased → "" (never "undefined"). */
export const greetingName = (a: Account) =>
  a.given_name ||
  a.email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

// TEST-ONLY:start (mode switch types; production keeps only "live")
/** live = the real backend (empty if it is not connected); demo = the built-in test inbox. */
export type Mode = "live" | "demo";
const MODE_KEY = "docuverify-mode";
// TEST-ONLY:end
type Session = { account: Account | null; ready: boolean; signIn: () => void; signOut: () => void; mode: Mode; setMode: (m: Mode) => void };
const SessionCtx = createContext<Session | null>(null);
export const useAccount = () => useContext(SessionCtx)!;

/** One shared request. The backend re-extracts every attachment per call (~seconds, and minutes when
    calls overlap), so remounts and dev double-effects must reuse the in-flight promise. */
let inflight: Promise<RawCase[]> | null = null;
const TIMEOUT_MS = 20_000; // past this we fall back to the sample rather than show a shimmer forever
function fetchCases(force: boolean) {
  if (force || !inflight)
    inflight = fetch("/api/v1/cases", { signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Backend answered ${r.status}`))))
      .catch((e) => { inflight = null; throw e; });
  return inflight;
}

// TEST-ONLY:start (seedDemo)
/* Demo activity: a believable week of operator work on the sample inbox, so Insights, the queue and the
   audit trail have something to show. Deterministic; only ever applied to the built-in sample. */
function seedDemo(cases: Case[]) {
  const r = rng(11);
  const resolutions: Record<string, Resolution> = {};
  const corrections: Corrections = {};
  const events: { t: number; p: Parameters<typeof recordUserAction>[0] }[] = [];
  const now = Date.now();
  cases.filter((c) => c.status !== "OK" && r() < 0.45).forEach((c) => {
    const t0 = now - r() * 6 * 864e5;
    const at = (mins: number) => t0 + mins * 6e4;
    events.push({ t: at(0), p: { actionType: "OPEN_EMAIL", emailId: c.id, description: `Opened ${c.id}` } });
    events.push({ t: at(1), p: { actionType: "VIEW_ATTACHMENT", emailId: c.id, description: `Viewed the attachments on ${c.id}` } });
    const roll = r();
    if (c.status === "MISMATCH" && c.defects[0] && roll < 0.35) {
      const f = c.fields.find((x) => x.key === c.defects[0])!;
      corrections[c.id] = { [f.key]: { value: f.si, reason: "Matches the shipping instruction" } };
      events.push({ t: at(3), p: { actionType: "CORRECT_FIELD", emailId: c.id, description: `Corrected ${f.key} on ${c.id} to "${f.si}"`, metadata: { field: f.key, value: f.si, reason: "Matches the shipping instruction" } } });
    }
    if (roll < 0.8) {
      resolutions[c.id] = "approved";
      events.push({ t: at(5), p: { actionType: "APPROVE_RESULT", emailId: c.id, description: `Approved verification result for ${c.id}` } });
    } else {
      resolutions[c.id] = "escalated";
      const priority = r() < 0.5 ? "High" : "Normal";
      events.push({ t: at(5), p: { actionType: "REQUEST_HUMAN_REVIEW", emailId: c.id, description: `Escalated ${c.id} for human review (${priority} priority)`, metadata: { priority, note: "Needs a second pair of eyes" } } });
    }
  });
  events.sort((a, b) => a.t - b.t);
  return { resolutions, corrections, events };
}

// TEST-ONLY:end

/* ---- Cases ----------------------------------------------------------------- */
type Load = "loading" | "ready" | "error";
type CasesState = {
  cases: Case[];
  summary: Summary;
  load: Load;
  offline: boolean;
  demo: boolean;
  syncedAt: number | null;
  reload: () => void;
  resolutions: Record<string, Resolution>;
  corrections: Corrections;
  approve: (id: string) => void;
  escalate: (id: string, priority: string, note: string) => void;
  correct: (id: string, key: string, value: string, reason: string) => void;
};
const CasesCtx = createContext<CasesState | null>(null);
export const useCases = () => useContext(CasesCtx)!;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<Mode>("demo");
  useEffect(() => {
    try {
      if (localStorage.getItem(SESSION_KEY) === "sample") setAccount(SAMPLE_ACCOUNT);
      if (localStorage.getItem(MODE_KEY) === "live") setModeState("live");
    } catch {}
    setReady(true);
  }, []);
  const session = useMemo<Session>(
    () => ({
      account,
      ready,
      signIn: () => {
        try { localStorage.setItem(SESSION_KEY, "sample"); } catch {}
        setAccount(SAMPLE_ACCOUNT);
      },
      mode,
      setMode: (m) => {
        try { localStorage.setItem(MODE_KEY, m); } catch {}
        clearAuditTrail(); // the trail belongs to one inbox; never mix test activity into a live session
        setModeState(m);
      },
      signOut: () => {
        try { localStorage.removeItem(SESSION_KEY); } catch {}
        setAccount(null);
      },
    }),
    [account, ready, mode],
  );
  return (
    <SessionCtx.Provider value={session}>
      {/* key = account id: switching accounts remounts and drops every cached number (checklist §0.3). */}
      <CasesProvider key={`${account?.id ?? "none"}-${mode}`} enabled={!!account} demo={mode === "demo"}>{children}</CasesProvider>
    </SessionCtx.Provider>
  );
}

function CasesProvider({ enabled, demo, children }: { enabled: boolean; demo: boolean; children: React.ReactNode }) {
  const [raw, setRaw] = useState<RawCase[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [offline, setOffline] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [corrections, setCorrections] = useState<Corrections>({});

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoad("loading");
    // TEST-ONLY:start (demo branch)
    if (demo) {
      const seeded = seedDemo(SAMPLE_CASES.map(derive));
      setRaw(SAMPLE_CASES);
      setOffline(false);
      setResolutions(seeded.resolutions);
      setCorrections(seeded.corrections);
      if (!getAuditTrail().length) {
        recordUserAction({ actionType: "SYSTEM_NOTE", description: `Test session started: loaded ${SAMPLE_CASES.length} demo emails`, customTimestamp: new Date(seeded.events[0]?.t ?? Date.now()) });
        seeded.events.forEach((ev) => recordUserAction({ ...ev.p, customTimestamp: new Date(ev.t) }));
      }
      setLoad("ready");
      setSyncedAt(Date.now());
      return;
    }
    // TEST-ONLY:end
    fetchCases(tick > 0)
      .then((data) => {
        if (!live) return;
        setRaw(data);
        setOffline(false);
        setLoad("ready");
        setSyncedAt(Date.now());
        if (!getAuditTrail().length)
          recordUserAction({ actionType: "SYSTEM_NOTE", description: `Session started: read ${data.length} emails from the live backend` });
      })
      .catch((e) => {
        if (!live) return;
        // Live mode with no backend: show nothing, and say so.
        setRaw([]);
        setOffline(true);
        console.error("Cases request failed:", e);
        setLoad("ready");
        setSyncedAt(Date.now());
      });
    return () => { live = false; };
  }, [enabled, demo, tick]);

  const cases = useMemo(() => raw.map(derive), [raw]);
  const summary = useMemo(() => summarise(cases, resolutions), [cases, resolutions]);

  const approve = useCallback((id: string) => {
    setResolutions((r) => ({ ...r, [id]: "approved" }));
    recordUserAction({ actionType: "APPROVE_RESULT", emailId: id, description: `Approved verification result for ${id}` });
  }, []);
  const escalate = useCallback((id: string, priority: string, note: string) => {
    setResolutions((r) => ({ ...r, [id]: "escalated" }));
    recordUserAction({
      actionType: "REQUEST_HUMAN_REVIEW",
      emailId: id,
      description: `Escalated ${id} for human review (${priority} priority)`,
      metadata: { priority, note },
    });
  }, []);
  const correct = useCallback((id: string, key: string, value: string, reason: string) => {
    setCorrections((c) => ({ ...c, [id]: { ...c[id], [key]: { value, reason } } }));
    recordUserAction({
      actionType: "CORRECT_FIELD",
      emailId: id,
      description: `Corrected ${key} on ${id} to "${value}"`,
      metadata: { field: key, value, reason },
    });
  }, []);

  const value = useMemo<CasesState>(
    () => ({
      cases, summary, load, offline, demo, syncedAt, resolutions, corrections, approve, escalate, correct,
      reload: () => setTick((t) => t + 1),
    }),
    [cases, summary, load, offline, demo, syncedAt, resolutions, corrections, approve, escalate, correct],
  );
  return <CasesCtx.Provider value={value}>{children}</CasesCtx.Provider>;
}

export { isOpen };
