"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCases } from '@/lib/app-state';

type User = { sub: string; name: string | null; email: string; picture: string | null };
type Identity = { user: User | null; configured: boolean; expires_at: number | null };
export type Message = { id: string; sender: string; subject: string; timestamp: number; body: string; attachments: string[]; to: string[]; cc: string[] };

export function useGoogleIdentity() {
  const [identity, setIdentity] = useState<Identity>({ user: null, configured: false, expires_at: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  const generation = useRef(0);
  const loggingOut = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const clear = useCallback(() => {
    generation.current++;
    setIdentity((current) => ({ ...current, user: null, expires_at: null }));
  }, []);
  const check = useCallback(async () => {
    if (loggingOut.current) return;
    const current = ++generation.current;
    try {
      const response = await fetch("/api/v1/auth/me", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const value: Identity = await response.json();
      if (current === generation.current) {
        setIdentity(value);
        setError((previous) => previous.startsWith("Unable to check") ? "" : previous);
      }
    } catch {
      if (current === generation.current) {
        clear();
        setLoading(false);
        setError("Unable to check sign-in. Check the backend and try again.");
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [clear]);
  useEffect(() => {
    const errors: Record<string, string> = {
      configuration: "Google sign-in is not configured yet. Contact your app administrator.",
      cancelled: "Google sign-in was cancelled. You can continue with the sample inbox.",
      invalid_state: "This sign-in attempt expired or could not be verified. Please try again.",
      failed: "Google sign-in failed. Grant Gmail access and check your OAuth setup, then try again.",
      unavailable: "Google sign-in is temporarily unavailable. Please try again.",
    };
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    if (code) {
      setError(errors[code] || errors.failed);
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url);
    }
    void check();
    const focus = () => { void check(); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) { clear(); void check(); } };
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", pageShow);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("docuverify-auth");
      channel.current.onmessage = () => { clear(); void check(); };
      channel.current.postMessage("changed");
    }
    return () => { generation.current++; channel.current?.close(); window.removeEventListener("focus", focus); window.removeEventListener("pageshow", pageShow); };
  }, [check, clear]);
  useEffect(() => {
    if (!identity.expires_at) return;
    const timer = setTimeout(clear, Math.max(0, identity.expires_at * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [identity.expires_at, clear]);
  async function logout() {
    loggingOut.current = true;
    setLogoutPending(true);
    clear(); // Unmount private UI before the network request starts.
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      loggingOut.current = false;
      setLogoutPending(false);
      channel.current?.postMessage("changed");
    } catch {
      setError("Logout could not reach the server. Retry Log out to end your session.");
    } finally { setLoading(false); }
  }
  return { ...identity, loading, error, logout, logoutPending, clear, check };
}

export function GoogleAvatar({ user }: { user: User | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.picture]);
  const initials = user ? (user.name || user.email).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "G";
  return <span className="avatar small" aria-label={user?.name || user?.email || "Guest"}>
    {user?.picture && !failed ? <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /> : initials}
  </span>;
}

export function GmailInbox({ onExpired }: { onExpired: () => void }) {
  const { gmailMessages: messages, reload, offline, syncedAt, load } = useCases();
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const fetched = load === 'ready';
  const [notice, setNotice] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function sync() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/gmail/sync", { method: "POST", cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error(data.detail || "Gmail could not be loaded.");
      setSelected(data.messages[0]?.id || "");
      reload();
      setNotice(data.failed_count
        ? `${data.synced_count} messages saved; ${data.failed_count} could not be loaded.`
        : `${data.synced_count} messages saved to Supabase.`);
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Gmail could not be loaded.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const active = messages.find((message) => message.id === selected) ?? messages[0];
  return <section aria-label="Gmail inbox">
    <div className="subsection-heading"><h2>Gmail inbox</h2><button className="button primary" onClick={sync} disabled={loading}>{loading ? "Syncing Gmail…" : "Sync Gmail"}</button></div>
    <p>Save the latest 50 inbox messages to the connected Supabase project.</p>
    <p>{messages.length} saved emails · Unclassified · Not processed</p>
    {syncedAt && <p>Last successful sync: {new Date(syncedAt).toLocaleString()}</p>}
    {offline && <p role="alert">Saved inbox could not be refreshed. <button onClick={reload}>Retry loading</button></p>}
    {notice && <p role="alert" className="info-note">{notice}</p>}
    {!fetched && <p role="status" className="empty-state">Click Sync Gmail to load and save your inbox.</p>}
    {fetched && messages.length === 0 && <p role="status" className="empty-state">Your Gmail inbox is empty.</p>}
    {active && <p>To: {active.to.join(', ') || '—'} · Cc: {active.cc.join(', ') || '—'}</p>}
    <div className="gmail-layout">
      <div className="gmail-list" aria-label="Messages">
        {messages.map((message) => <button key={message.id} className="gmail-message" aria-pressed={selected === message.id} onClick={() => setSelected(message.id)}><strong>{message.subject}</strong><span>{message.sender}</span><small>{new Date(message.timestamp).toLocaleString()}</small></button>)}
      </div>
      {active && <article className="source-panel gmail-body"><h3>{active.subject}</h3><p>{active.sender}</p><time dateTime={new Date(active.timestamp).toISOString()}>{new Date(active.timestamp).toLocaleString()}</time><pre>{active.body || "No inline message body is available."}</pre><h4>Attachments</h4>{active.attachments.length ? <ul>{active.attachments.map((name, index) => <li key={index}>{name}</li>)}</ul> : <p>No attachments.</p>}<p className="info-note">Attachment processing is not yet connected. Gmail messages cannot be extracted or sent for document review. Attachments are not downloaded.</p><button className="button" disabled>Extract fields</button> <button className="button" disabled>Document review</button></article>}
    </div>
  </section>;
}
