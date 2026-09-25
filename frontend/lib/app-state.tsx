"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, Clock, Flag, Pencil, Sparkles, Tag, Undo2 } from "lucide-react";
import { categoryLabel, derive, fieldLabel, isOpen, summarise, type Case, type Category, type Corrections, type RawCase, type Resolution, type Summary } from "./cases";
import { clearAuditTrail, getAuditTrail, recordUserAction, setActor } from "./auditTrailStore";
import { toast } from "./toast";
import { useGoogleIdentity, type Message } from "@/components/GoogleInbox";
import { usePathname } from "next/navigation";

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
  gmailMessages: Message[];
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
  escalate: (id: string, priority: string, note: string, assignee?: string) => void;
  correct: (id: string, key: string, value: string, reason: string) => void;
  requestAmendment: (id: string, how: string) => void;
  reclassify: (id: string, category: Category) => void;
  addCase: (raw: RawCase) => void;
};
const CasesCtx = createContext<CasesState | null>(null);
export const useCases = () => useContext(CasesCtx)!;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const source = path === '/gmail' ? 'gmail' : 'local';
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
  useEffect(() => { inflight = null; clearAuditTrail(); setActor(account?.email ?? ""); }, [account?.id, account?.email]);
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
      <CasesProvider key={`${account?.id ?? 'none'}:${source}`} accountId={account?.id} source={source}>{children}</CasesProvider>
    </SessionCtx.Provider>
  );
}

function CasesProvider({ accountId, source, children }: { accountId?: string; source: 'gmail' | 'local'; children: React.ReactNode }) {
  const enabled = !!accountId && (source === 'local' || accountId !== 'sample');
  const personal = source === 'gmail';
  const [gmailMessages, setGmailMessages] = useState<Message[]>([]);
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
    if (personal) {
      const controller = new AbortController();
      fetch('/api/v1/gmail/messages', { cache: 'no-store', signal: controller.signal })
        .then(async r => { if (!r.ok) throw new Error('Saved inbox unavailable'); return r.json(); })
        .then(data => {
          if (!live) return;
          setGmailMessages(data.messages);
          setSyncedAt(data.synced_at ? Date.parse(data.synced_at) : null);
          setOffline(false); setLoad('ready');
        })
        .catch(() => { if (live) { setOffline(true); setLoad('ready'); } });
      return () => { live = false; controller.abort(); };
    }
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
  }, [enabled, personal, tick]);

  /** Parse and independently verify one local email through the case endpoint. */
  const extract = useCallback(async (id: string) => {
    if (personal) throw new Error('Shipping extraction is not enabled for Gmail.');
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "";
    const r = await fetch(`${backend}/api/v1/cases/${encodeURIComponent(id)}/extract`, { method: "POST" });
    if (!r.ok) throw new Error(`Backend answered ${r.status}`);
    const { fields, extraction_status, review_reasons } = (await r.json()) as Pick<RawCase, "fields" | "extraction_status" | "review_reasons">;
    setRaw((all) => all.map((c) => (c.id === id ? { ...c, fields, extraction_status, review_reasons } : c)));
    // Fixes made against the old reading would hide the new one, so a fresh read starts from a clean slate.
    setCorrections((c) => { const n = { ...c }; delete n[id]; return n; });
    recordUserAction({ actionType: "SYSTEM_NOTE", emailId: id, description: `Parsed and independently verified fields for ${id}; earlier fixes cleared` });
    toast({ title: "Fields re-extracted", description: `${id} · read again`, icon: <Sparkles />, tone: "info" });
  }, [personal]);

  const cases = useMemo(() => raw.map(derive), [raw]);
  const summary = useMemo(() => ({ ...summarise(cases, resolutions), ...(personal ? { total: gmailMessages.length } : {}) }), [cases, resolutions, personal, gmailMessages]);
  // Toasts name the shipment the way ops read it (BL no.), falling back to the email id.
  const casesRef = useRef(cases);
  casesRef.current = cases;
  const shipName = (id: string) => casesRef.current.find((c) => c.id === id)?.ship.bl ?? id;

  /** Reverses an approve/escalate; logged, so the audit trail shows both the decision and its undo. */
  const undo = useCallback((id: string, what: string) => {
    setResolutions((r) => { const n = { ...r }; delete n[id]; return n; });
    recordUserAction({ actionType: "SYSTEM_NOTE", emailId: id, description: `Undid ${what} for ${id}` });
    toast({ title: "Undone", description: `${shipName(id)} is back in the queue`, icon: <Undo2 />, tone: "info", duration: 2500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shipName reads a ref
  }, []);
  const approve = useCallback((id: string) => {
    setResolutions((r) => ({ ...r, [id]: "approved" }));
    recordUserAction({ actionType: "APPROVE_RESULT", emailId: id, description: `Approved verification result for ${id}` });
    toast({ title: "BL approved", description: `${shipName(id)} · logged to the audit trail`, icon: <CircleCheck />, tone: "ok",
      actionLabel: "Undo", onAction: () => undo(id, "approval") });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shipName reads a ref
  }, [undo]);
  const escalate = useCallback((id: string, priority: string, note: string, assignee = "") => {
    setResolutions((r) => ({ ...r, [id]: "escalated" }));
    recordUserAction({
      actionType: "REQUEST_HUMAN_REVIEW",
      emailId: id,
      description: `Escalated ${id} for human review (${priority} priority${assignee ? `, to ${assignee}` : ""})`,
      metadata: { priority, note, ...(assignee && { assignee }) },
    });
    toast({ title: "Escalated for review", description: `${shipName(id)} · ${assignee || `${priority} priority`}`, icon: <Flag />, tone: "review",
      actionLabel: "Undo", onAction: () => undo(id, "escalation") });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shipName reads a ref
  }, [undo]);
  /** An extraction misread only: the documents agree, the reading didn't. A carrier defect goes to requestAmendment. */
  const correct = useCallback((id: string, key: string, value: string, reason: string) => {
    setCorrections((c) => ({ ...c, [id]: { ...c[id], [key]: { value, reason } } }));
    recordUserAction({
      actionType: "CORRECT_FIELD",
      actionLabel: "Fixed misread",
      emailId: id,
      description: `Fixed misread ${key} on ${id} to "${value}" (checked against the original)`,
      metadata: { field: key, value, reason, kind: "extraction_misread" },
    });
    toast({ title: `${fieldLabel(key)} misread fixed`, description: `${shipName(id)} · now "${value}"`, icon: <Pencil />, tone: "info" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shipName reads a ref
  }, []);
  /** Amendment or resend asked for: the case leaves the open queue and waits on the carrier's revised draft. */
  const requestAmendment = useCallback((id: string, how: string) => {
    setResolutions((r) => ({ ...r, [id]: "awaiting" }));
    recordUserAction({ actionType: "DRAFT_REPLY", actionLabel: "Requested amendment", emailId: id,
      description: `Amendment request for ${shipName(id)} drafted (${how}); waiting for the revised draft` });
    toast({ title: "Waiting for the carrier", description: `${shipName(id)} · check the revised draft when it arrives`, icon: <Clock />, tone: "info",
      actionLabel: "Undo", onAction: () => undo(id, "amendment request") });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shipName reads a ref
  }, [undo]);
  /** An operator settles an uncertain category; derive() then runs the case through the normal checks. */
  const reclassify = useCallback((id: string, category: Category) => {
    setRaw((all) => all.map((c) => (c.id === id ? { ...c, category, classification_requires_review: false } : c)));
    recordUserAction({ actionType: "CORRECT_FIELD", actionLabel: "Reclassified", emailId: id,
      description: `Reclassified ${id} as ${category}`, metadata: { field: "category", value: category } });
    toast({ title: "Reclassified", description: `${id} · ${categoryLabel(category)}`, icon: <Tag />, tone: "info" });
  }, []);
  /** A case from the upload form. ponytail: held client-side only, the backend doesn't list uploads; a sync drops it. */
  const addCase = useCallback((c: RawCase) => {
    setRaw((all) => [c, ...all.filter((x) => x.id !== c.id)]);
    recordUserAction({ actionType: "SYSTEM_NOTE", emailId: c.id, description: `Uploaded ${c.id} for verification` });
  }, []);

  const value = useMemo<CasesState>(
    () => ({
      cases, gmailMessages, summary, load, offline, syncedAt, resolutions, corrections, approve, escalate, correct, extract, requestAmendment, reclassify, addCase,
      reload: () => setTick((t) => t + 1),
    }),
    [cases, gmailMessages, summary, load, offline, syncedAt, resolutions, corrections, approve, escalate, correct, extract, requestAmendment, reclassify, addCase],
  );
  return <CasesCtx.Provider value={value}>{children}</CasesCtx.Provider>;
}

export { isOpen };
