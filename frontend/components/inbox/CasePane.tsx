"use client";

import { useEffect, useState } from "react";
import { Download, Flag, Mail, Paperclip, Pencil, Printer } from "lucide-react";
import { useAccount, useCases } from "@/lib/app-state";
import { recordUserAction } from "@/lib/auditTrailStore";
import { HITL_THRESHOLD, categoryLabel, diffSpan, fieldLabel, matches, type Case, type Field } from "@/lib/cases";
import { Abbr, CategoryPill, Confidence, DocumentText, Modal, StatusPill, hasFile } from "@/components/ui";
import { cn } from "@/lib/utils";

type Row = { f: Field; state: "match" | "defect" | "missing" | "corrected"; fix?: { value: string; reason: string } };

/** BL value with the differing characters marked: one wrong digit in MEDUUD104S32 has to be visible. */
function Diff({ a, b }: { a: string; b: string }) {
  const span = diffSpan(a, b);
  if (!b) return <span className="text-ink-3">— missing</span>;
  if (!span) return <>{b}</>;
  const [s, e] = span;
  return (
    <>
      {b.slice(0, s)}
      <mark className="rounded-sm bg-defect-tint px-px font-semibold text-defect underline decoration-defect decoration-2 underline-offset-2">{b.slice(s, e) || "_"}</mark>
      {b.slice(e)}
    </>
  );
}

const RESULT_WORD = { match: "Verified", defect: "Defect", missing: "Missing", corrected: "Corrected" } as const;
const REASON_VERDICT = {
  missing_attachment: "An attachment is missing.",
  unreadable: "Couldn’t read these attachments.",
  missing_value: "A value is missing from the SI or the BL.",
  wrong_doc_type: "An attachment isn’t an SI or a BL.",
} as const;

/** The answer to the operator's only question, in a sentence. */
function verdict(c: Case) {
  if (c.category !== "BL_COMPARISON") return `This reads as ${categoryLabel(c.category).toLowerCase()}, so no SI/BL comparison applies.`;
  if (c.status === "NEEDS_REVIEW") return REASON_VERDICT[c.reason ?? "unreadable"];
  if (c.status === "OK") return "All seven fields match the SI.";
  const n = c.defects.map((k) => fieldLabel(k).toLowerCase());
  return `BL differs from SI on ${n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : n[0]}.`;
}

export function CasePane({ c }: { c: Case }) {
  const { resolutions, corrections, approve, extract, demo } = useCases();
  const [extracting, setExtracting] = useState(false);
  const { account } = useAccount();
  const res = resolutions[c.id];
  const fixes = corrections[c.id] ?? {};
  const [modal, setModal] = useState<null | { kind: "doc"; i: number } | { kind: "fix"; f: Field } | { kind: "escalate" } | { kind: "report" }>(null);

  const isBl = c.category === "BL_COMPARISON";
  const rows: Row[] = c.fields.map((f) => {
    const fix = fixes[f.key];
    const empty = !f.si.trim() || !f.bl.trim();
    return { f, fix, state: fix ? "corrected" : empty ? "missing" : matches(f) ? "match" : "defect" };
  });
  const blocking = (r: Row) => r.state === "defect" || r.state === "missing";
  const shown = [...rows].sort((a, b) => Number(blocking(b)) - Number(blocking(a))); // defects first
  const unresolved = rows.filter(blocking);
  const blocked = !isBl || c.status === "NEEDS_REVIEW";
  const why = res ? `Already ${res}.` : blocked
    ? c.status === "NEEDS_REVIEW" ? "Nothing to approve yet: the documents can’t be compared. Escalate instead." : "This email has no SI/BL to approve."
    : unresolved.length > 0 ? `${unresolved.length} ${unresolved.length === 1 ? "field blocks" : "fields block"} approval` : "";
  const toBlocker = () => {
    const el = document.getElementById(`row-${unresolved[0].f.key}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };
  const tone = c.status === "NEEDS_REVIEW" ? "border-review bg-review-tint text-review-ink"
    : c.status === "MISMATCH" && isBl ? "border-defect bg-defect-tint text-defect"
    : isBl ? "border-ok bg-ok-tint text-ok" : "border-line bg-surface-2 text-ink-2";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_296px]">
      <div className="grid min-w-0 gap-5">
        <header className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="num text-[12px] text-ink-3">{c.id}</p>
              <h1 className="mt-1 text-[18px] font-semibold leading-6 tracking-[-0.01em] [overflow-wrap:anywhere]">{c.subject}</h1>
              <p className="mt-1 text-ink-2 [overflow-wrap:anywhere]"><Mail size={13} className="mr-1.5 inline -translate-y-px" aria-hidden />{c.sender}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <CategoryPill category={c.category} />
              <StatusPill c={c} />
              {res && <span className="pill bg-surface-2 text-ink-2">{res === "approved" ? "Approved" : "Escalated"}</span>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {c.attachments.length === 0 && <span className="text-[13px] text-ink-3">No attachments</span>}
            {c.attachments.map((a, i) => (
              <button
                key={a.name}
                disabled={!a.url}
                className="btn btn-sm"
                onClick={() => {
                  recordUserAction({ actionType: "VIEW_ATTACHMENT", emailId: c.id, description: `Inspected ${a.name}`, metadata: { fileName: a.name } });
                  setModal({ kind: "doc", i });
                }}
              >
                <Paperclip size={13} aria-hidden />{a.name}
                {!a.url && <span className="text-review-ink">missing</span>}
              </button>
            ))}
          </div>
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-ink-2 hover:text-ink">Read the email</summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface-2 p-4 text-[13px] leading-[18px] [overflow-wrap:anywhere]">{c.body || "(empty body)"}</pre>
          </details>
        </header>

        <div role="status" className={cn("rounded-[var(--radius-card)] border p-4", tone)}>
          <p className="font-semibold">{verdict(c)}</p>
          {isBl ? (
            <p className={cn("mt-1 text-[13px]", c.status !== "NEEDS_REVIEW" && "text-ink-2")}>
              {c.status === "NEEDS_REVIEW"
                ? "Open the original, or escalate so someone else can chase it. Nothing has been assumed."
                : <>The <Abbr t="SI" /> is the shipper’s request. The carrier drafts the <Abbr t="BL" /> from it, so the BL must match the SI.</>}
            </p>
          ) : (
            <p className="mt-1 text-[13px]">Category comes from keyword rules until the classifier is connected.</p>
          )}
        </div>

        {isBl && rows.length > 0 && (
          <section className="card overflow-hidden" aria-label="SI vs BL comparison">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-line text-left"><tr>
                  <th scope="col" className="label h-10 px-4 pl-5">Field</th>
                  <th scope="col" className="label px-4"><Abbr t="SI" /> · source of truth</th>
                  <th scope="col" className="label px-4"><Abbr t="BL" /> · draft</th>
                  <th scope="col" className="label px-4">Status</th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => {
                    const { f, state, fix } = r;
                    return (
                      <tr id={`row-${f.key}`} tabIndex={-1} key={f.key} className={cn("border-b border-line align-top outline-none last:border-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-burgundy", blocking(r) && "bg-defect-tint/60")}>
                        <th scope="row" className="px-4 py-3 pl-5 text-left font-medium" title={f.key}>{fieldLabel(f.key)}</th>
                        <td className="num px-4 py-3 [overflow-wrap:anywhere]">{f.si || <span className="text-ink-3">— missing</span>}</td>
                        <td className="num px-4 py-3 [overflow-wrap:anywhere]">
                          {fix ? (<><span className="font-semibold">{fix.value}</span><div className="text-[12px] text-ink-3 line-through">{f.bl}</div></>) : state === "defect" ? <Diff a={f.si} b={f.bl} /> : f.bl || <span className="text-ink-3">— missing</span>}
                        </td>
                        <td className="px-4 py-3 pr-5">
                          <div className="grid justify-items-start gap-1.5">
                            <span className={cn("pill", state === "match" || state === "corrected" ? "bg-ok-tint text-ok" : "bg-defect-tint text-defect")}>
                              {{ match: "● Match", corrected: "● Corrected", defect: "▲ Defect", missing: "▲ Missing" }[state]}
                            </span>
                            {blocking(r) && <span className="text-[11px] font-medium text-defect">Blocks approval</span>}
                            <Confidence value={f.confidence} />
                            {f.confidence < HITL_THRESHOLD && <span className="text-[11px] text-review-ink">Below {HITL_THRESHOLD}: could be wrong</span>}
                            {state !== "match" && !res && <button className="btn btn-sm" onClick={() => setModal({ kind: "fix", f })}><Pencil size={13} aria-hidden />{state === "corrected" ? "Edit…" : "Correct…"}</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
              Confidence is extraction confidence, 0–100. The tick on each bar is the {HITL_THRESHOLD} gate; under it goes to a human. Values are normalised (case, spacing, port codes).
            </p>
          </section>
        )}
        {isBl && !demo && (
          <button className="btn btn-sm justify-self-start" disabled={extracting}
            onClick={() => { setExtracting(true); extract(c.id).catch((e) => console.error(e)).finally(() => setExtracting(false)); }}>
            {extracting ? "Extracting…" : "Extract with Gemini"}
          </button>
        )}
        {isBl && rows.length === 0 && c.status !== "NEEDS_REVIEW" && (
          <p className="card p-5 text-ink-2">No fields could be extracted, so there is nothing to compare.</p>
        )}

        {isBl && c.attachments.length > 0 && (
          <section className="card overflow-hidden" aria-label="Source documents">
            <div className="grid divide-line md:grid-cols-2 md:divide-x">
              {c.attachments.map((a) => (
                <div key={a.name} className="min-w-0 p-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="num truncate text-[12px] text-ink-3">{a.name}</span>
                    {hasFile(a) && <a className="btn btn-sm" href={a.url!} download><Download size={13} aria-hidden />Original</a>}
                  </div>
                  <DocumentText a={a} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside aria-label="Decision" className="card no-print sticky bottom-3 z-10 grid gap-4 p-5 lg:top-[88px]">
        <h2 className="label">Decide</h2>
        {unresolved.length > 0 && !res && !blocked ? (
          <button className="text-left font-medium text-defect underline decoration-defect/40 underline-offset-2 hover:decoration-defect" onClick={toBlocker}>{why}</button>
        ) : (
          <p className="text-[13px] text-ink-2" aria-live="polite">{why || "Every field is resolved. Ready to approve."}</p>
        )}
        <div className="grid gap-2">
          <button className="btn btn-primary" disabled={!!why} onClick={() => approve(c.id)}>Approve &amp; submit</button>
          <button className="btn btn-escalate" disabled={!!res} onClick={() => setModal({ kind: "escalate" })}><Flag size={15} aria-hidden />Escalate</button>
        </div>
        <div className="hidden gap-2 border-t border-line pt-4 lg:grid">
          <p className="label">Submission</p>
          <pre className="num overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-3 text-[11px] leading-4">{JSON.stringify({
            category: c.category, status: c.status, review_reason: c.reason, defect_fields: c.defects, has_defect: c.defects.length > 0,
          }, null, 1)}</pre>
        </div>
        <button className="btn btn-ghost btn-sm hidden justify-self-start lg:inline-flex" onClick={() => setModal({ kind: "report" })}><Printer size={14} aria-hidden />Export record</button>
      </aside>

      <FixModal state={modal?.kind === "fix" ? modal.f : null} c={c} onClose={() => setModal(null)} />
      <EscalateModal open={modal?.kind === "escalate"} c={c} onClose={() => setModal(null)} />
      <ReportModal open={modal?.kind === "report"} c={c} rows={rows} who={account?.email ?? ""} res={res} onClose={() => setModal(null)} />
      <Modal open={modal?.kind === "doc"} onClose={() => setModal(null)} title={modal?.kind === "doc" ? c.attachments[modal.i]?.name ?? "Document" : "Document"} wide>
        {modal?.kind === "doc" && (() => {
          const a = c.attachments[modal.i];
          return (
            <>
              <DocumentText a={a} className="max-h-[60vh]" />
              {hasFile(a) && <a className="btn mt-4" href={a!.url!} download><Download size={15} aria-hidden />Download original</a>}
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

function FixModal({ state, c, onClose }: { state: Field | null; c: Case; onClose: () => void }) {
  const { correct } = useCases();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (state) { setValue(state.si); setReason(""); } }, [state]);
  return (
    <Modal open={!!state} onClose={onClose} title={state ? `Correct ${fieldLabel(state.key).toLowerCase()}` : "Correct field"}>
      {state && (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); correct(c.id, state.key, value.trim(), reason.trim()); onClose(); }}>
          <div className="flex flex-wrap gap-2">
            {[["SI", state.si], ["BL", state.bl]].map(([l, v]) => v && (
              <button type="button" key={l} className="btn btn-sm num" onClick={() => setValue(v)}>Use {l}: {v.length > 28 ? `${v.slice(0, 27)}…` : v}</button>
            ))}
          </div>
          <label className="grid gap-1.5"><span className="label">Corrected value</span>
            <input className="field num" value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
          </label>
          <label className="grid gap-1.5"><span className="label">Why</span>
            <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Confirmed with shipper by phone" />
          </label>
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save correction</button></div>
        </form>
      )}
    </Modal>
  );
}

function EscalateModal({ open, c, onClose }: { open: boolean; c: Case; onClose: () => void }) {
  const { escalate } = useCases();
  const [priority, setPriority] = useState("medium");
  const [note, setNote] = useState("");
  useEffect(() => { if (open) setNote(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Escalate">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); escalate(c.id, priority, note.trim()); onClose(); }}>
        <fieldset className="grid gap-1.5"><legend className="label mb-1.5">Priority</legend>
          <div className="flex gap-2">
            {["low", "medium", "high"].map((p) => (
              <label key={p} className={cn("btn btn-sm cursor-pointer capitalize has-[:checked]:border-review has-[:checked]:bg-review-tint has-[:checked]:text-review-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2")}>
                <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} className="sr-only" />{p}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1.5"><span className="label">What should the reviewer look at?</span>
          <textarea className="field" rows={4} value={note} onChange={(e) => setNote(e.target.value)} required autoFocus />
        </label>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-escalate">Escalate</button></div>
      </form>
    </Modal>
  );
}

function ReportModal({ open, c, rows, who, res, onClose }: { open: boolean; c: Case; rows: Row[]; who: string; res?: string; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Verification record" wide>
      <div className="grid gap-4">
        <div className="rounded-[var(--radius-control)] border border-line p-4">
          <p className="num text-[12px] text-ink-3">{c.id}</p>
          <p className="font-semibold [overflow-wrap:anywhere]">{c.subject}</p>
          <p className="mt-2 text-ink-2">
            {verdict(c)}
            {res && ` ${res === "approved" ? "Approved" : "Escalated"} by ${who || "operator"}.`}
          </p>
        </div>
        {rows.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="text-left"><tr>{["Field", "SI", "BL", "Result"].map((h) => <th key={h} className="label py-2 pr-3">{h}</th>)}</tr></thead>
            <tbody>{rows.map(({ f, state, fix }) => (
              <tr key={f.key} className="border-t border-line align-top">
                <td className="py-2 pr-3">{fieldLabel(f.key)}</td><td className="num py-2 pr-3 [overflow-wrap:anywhere]">{f.si}</td>
                <td className="num py-2 pr-3 [overflow-wrap:anywhere]">{fix ? fix.value : f.bl}</td><td className="py-2">{RESULT_WORD[state]}</td>
              </tr>))}</tbody>
          </table>
        )}
        <div className="no-print flex justify-end"><button className="btn btn-primary" onClick={() => {
          recordUserAction({ actionType: "GENERATE_REPORT", emailId: c.id, description: `Exported verification record for ${c.id}` });
          window.print();
        }}><Printer size={15} aria-hidden />Print record</button></div>
      </div>
    </Modal>
  );
}
