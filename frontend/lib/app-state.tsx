"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { derive, isOpen, summarise, type Case, type Corrections, type RawCase, type Resolution, type Summary } from "./cases";
import { clearAuditTrail, getAuditTrail, recordUserAction } from "./auditTrailStore";
import { useGoogleIdentity } from "@/components/GoogleInbox";

/* ---- Account: server-verified Google identity or an explicit demo session. */
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

type Session = { account: Account | null; ready: boolean; configured: boolean; error: string;
  logoutPending: boolean; signIn: () => void; signOut: () => Promise<void>; retry: () => Promise<void> };
const SessionCtx = createContext<Session | null>(null);
export const useAccount = () => useContext(SessionCtx)!;

/** One shared request. The backend re-extracts every attachment per call (~seconds, and minutes when
    calls overlap), so remounts and dev double-effects must reuse the in-flight promise. */
let inflight: Promise<RawCase[]> | null = null;
const TIMEOUT_MS = 180_000; // first load may include one or more confidence-gated Gemma classifications
function fetchCases(force: boolean) {
  if (force || !inflight)
    inflight = fetch("/api/v1/cases", { signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Backend answered ${r.status}`))))
      .catch((e) => { inflight = null; throw e; });
  return inflight;
}

/* ---- Cases ----------------------------------------------------------------- */
type Load = "loading" | "ready" | "error";
type CasesState = {
  cases: Case[];
  summary: Summary;
  load: Load;
  offline: boolean;
  syncedAt: number | null;
  reload: () => void;
  extract: (id: string) => Promise<void>;
  resolutions: Record<string, Resolution>;
  corrections: Corrections;
  approve: (id: string) => void;
  escalate: (id: string, priority: string, note: string) => void;
  correct: (id: string, key: string, value: string, reason: string) => void;
};
const CasesCtx = createContext<CasesState | null>(null);
export const useCases = () => useContext(CasesCtx)!;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const google = useGoogleIdentity();
  const [demo, setDemo] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  useEffect(() => {
    try {
      localStorage.removeItem(SESSION_KEY); // Retire the old persistent demo login.
      setDemo(sessionStorage.getItem(SESSION_KEY) === "sample");
    } catch {}
    setDemoReady(true);
  }, []);
  useEffect(() => {
    if (google.user) {
      setDemo(false);
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    }
  }, [google.user]);
  const account: Account | null = google.user ? {
    id: google.user.sub, email: google.user.email, name: google.user.name || google.user.email,
    given_name: google.user.name?.split(" ")[0] || "", picture: google.user.picture,
  } : demo ? SAMPLE_ACCOUNT : null;
  useEffect(() => { inflight = null; clearAuditTrail(); }, [account?.id]);
  const session: Session = {
      account,
      ready: demoReady && !google.loading,
      configured: google.configured,
      error: google.error,
      logoutPending: google.logoutPending,
      retry: google.check,
      signIn: () => {
        try { sessionStorage.setItem(SESSION_KEY, "sample"); } catch {}
        setDemo(true);
      },
      signOut: async () => {
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
        setDemo(false);
        inflight = null;
        clearAuditTrail();
        if (google.user || google.logoutPending) await google.logout();
      },
  };
  return (
    <SessionCtx.Provider value={session}>
      {/* key = account id: switching accounts remounts and drops every cached number (checklist §0.3). */}
      <CasesProvider key={account?.id ?? "none"} enabled={!!account}>{children}</CasesProvider>
    </SessionCtx.Provider>
  );
}

function CasesProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
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
        // No backend: show nothing, and say so.
        setRaw([]);
        setOffline(true);
        console.error("Cases request failed:", e);
        setLoad("ready");
        setSyncedAt(Date.now());
      });
    return () => { live = false; };
  }, [enabled, tick]);

  /** Gemini native-PDF extraction for one email (POST /cases/{id}/extract); replaces that case's fields. */
  const extract = useCallback(async (id: string) => {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "";
    const r = await fetch(`${backend}/api/v1/cases/${encodeURIComponent(id)}/extract`, { method: "POST" });
    if (!r.ok) throw new Error(`Backend answered ${r.status}`);
    const { fields } = (await r.json()) as { fields: RawCase["fields"] };
    setRaw((all) => all.map((c) => (c.id === id ? { ...c, fields } : c)));
    recordUserAction({ actionType: "SYSTEM_NOTE", emailId: id, description: `Re-extracted fields for ${id} with Gemini` });
  }, []);

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
      cases, summary, load, offline, syncedAt, resolutions, corrections, approve, escalate, correct, extract,
      reload: () => setTick((t) => t + 1),
    }),
    [cases, summary, load, offline, syncedAt, resolutions, corrections, approve, escalate, correct, extract],
  );
  return <CasesCtx.Provider value={value}>{children}</CasesCtx.Provider>;
}

export { isOpen };
