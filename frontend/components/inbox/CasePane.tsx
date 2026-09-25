"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Flag, Mail, Paperclip, Pencil, Printer, Reply, Sparkles } from "lucide-react";
import { useAccount, useCases } from "@/lib/app-state";
import { recordUserAction } from "@/lib/auditTrailStore";
import { toast } from "@/lib/toast";
import { CATEGORIES, HITL_THRESHOLD, RESOLUTION_WORD, categoryLabel, diffSpan, fieldLabel, matches, type Case, type Category, type Field, type Shipment } from "@/lib/cases";
import { Abbr, CategoryPill, DocumentText, Dropdown, FieldScore, Modal, StatusPill, hasFile } from "@/components/ui";
import { cn } from "@/lib/utils";
import BellRing from "@/components/BellRing";
import ThoughtLine from "@/components/ThoughtLine";

export type Row = { f: Field; state: "match" | "defect" | "missing" | "corrected"; fix?: { value: string; reason: string } };

/** BL value with the differing characters marked: one wrong digit in MEDUUD104S32 has to be visible. */
export function Diff({ a, b }: { a: string; b: string }) {
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

const READ_STEPS = ["Opening the SI and BL", "Scanning every page", "Pulling out the seven fields", "Lining them up to check"];
const RESULT_WORD ={ match: "Verified", defect: "Defect", missing: "Missing", corrected: "Corrected" } as const;
const REASON_VERDICT = {
  classification_uncertain: "The email category is uncertain and needs a person to review it.",
  missing_attachment: "An attachment is missing.",
  unreadable: "Couldn’t read these attachments.",
  missing_value: "A value is missing from the SI or the BL.",
  wrong_doc_type: "An attachment isn’t an SI or a BL.",
} as const;
/** Why a review case can't be approved, finishing "Can't approve yet: …". */
const REASON_WHY = {
  classification_uncertain: "the category is uncertain.",
  missing_attachment: "an attachment is missing.",
  unreadable: "the attachments couldn’t be read.",
  missing_value: "a value is missing, so the check isn’t complete.",
  wrong_doc_type: "an attachment isn’t an SI or a BL.",
} as const;

/** The answer to the operator's only question, in a sentence. */
function verdict(c: Case) {
  if (c.status === "NEEDS_REVIEW") return REASON_VERDICT[c.reason ?? "unreadable"];
  if (c.category !== "BL_COMPARISON") return `This reads as ${categoryLabel(c.category).toLowerCase()}, so no SI/BL comparison applies.`;
  if (c.status === "OK") return "All seven fields match the SI.";
  const n = c.defects.map((k) => fieldLabel(k).toLowerCase());
  return `BL differs from SI on ${n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : n[0]}.`;
}

export function CasePane({ c }: { c: Case }) {
  const { resolutions, corrections, approve, extract, requestAmendment, reclassify } = useCases();
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState(false);
  const [extractRan, setExtractRan] = useState(false);
  const [readStep, setReadStep] = useState(1);
  // ponytail: the extract call is one request with no progress events, so the steps advance on a timer and all tick
  // when it returns. Drive them from the backend if it ever streams stages.
  useEffect(() => {
    if (!extracting) return;
    setReadStep(1);
    const id = setInterval(() => setReadStep((n) => Math.min(n + 1, READ_STEPS.length)), 1200);
    return () => clearInterval(id);
  }, [extracting]);
  const { account } = useAccount();
  const res = resolutions[c.id];
  const fixes = corrections[c.id] ?? {};
  const [modal, setModal] = useState<null | { kind: "doc"; i: number } | { kind: "fix"; f: Field } | { kind: "escalate" } | { kind: "report" } | { kind: "reply" } | { kind: "approval" }>(null);

  const isBl = c.category === "BL_COMPARISON";
  const rows: Row[] = c.fields.map((f) => {
    const fix = fixes[f.key];
    const empty = !f.si.trim() || !f.bl.trim();
    return { f, fix, state: fix ? "corrected" : empty ? "missing" : matches(f) ? "match" : "defect" };
  });
  const blocking = (r: Row) => r.state === "defect" || r.state === "missing";
  // What stops the case first: the missing value, then differences, then matches.
  const rank = (r: Row) => (r.state === "missing" ? 2 : r.state === "defect" ? 1 : 0);
  const shown = [...rows].sort((a, b) => rank(b) - rank(a));
  // In review the check never finished, so a difference is not a confirmed defect (the submission lists none).
  const review = c.status === "NEEDS_REVIEW";
  const unresolved = rows.filter(blocking);
  const blocked = !isBl || c.status === "NEEDS_REVIEW";
  const awaiting = res === "awaiting";
  const why = awaiting ? "Waiting for the carrier’s revised draft. It arrives as a new email: check that one, not this." : res ? `Already ${res}.` : blocked
    ? c.status === "NEEDS_REVIEW" ? `Can’t approve yet: ${REASON_WHY[c.reason ?? "unreadable"]} Escalate, or ask the sender.` : "This email has no SI/BL to approve."
    : unresolved.length > 0 ? `${unresolved.length} ${unresolved.length === 1 ? "field blocks" : "fields block"} approval` : "";
  const toBlocker = () => {
    const el = document.getElementById(`row-${unresolved[0].f.key}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };
  // Something has to go back to the sender: a field to amend, or documents to resend. An uncertain category is ours to settle, not theirs.
  const needsReply = isBl && (unresolved.length > 0 || (c.status === "NEEDS_REVIEW" && c.reason !== "classification_uncertain"));
  // The next step leads: ask the carrier when something must change, approve when nothing does.
  const replyFirst = needsReply && !res;
  // Re-reading only helps when the text is the problem; a missing file or a real difference needs a person.
  const readFirst = isBl && review && (c.reason === "unreadable" || c.reason === "missing_value" || c.reason === "wrong_doc_type");
  const readBlock = isBl && (
    <div className="grid justify-items-start gap-3">
      {readFirst && !extracting && <p className="text-[13px] text-ink-2">Try this first: a fresh read often fixes what the text layer missed.</p>}
      {/* While Gemini reads, the reading line takes the button's place; the button comes back once it settles. */}
      {!extracting && (
        <button className={cn("btn btn-sm", readFirst && "btn-primary")}
          onClick={() => { setExtracting(true); setExtractRan(true); setExtractErr(false); extract(c.id).catch((e) => { console.error(e); setExtractErr(true); setExtractRan(false); }).finally(() => setExtracting(false)); }}>
          <Sparkles size={14} aria-hidden />Extract with Gemini
        </button>
      )}
      {extractRan && (
        <ThoughtLine working={extracting} label="Reading the documents…" doneLabel="Read in" fontSize={13} color="var(--ink-2)"
          steps={extracting ? READ_STEPS.slice(0, readStep) : READ_STEPS} />
      )}
      {extractErr && <p className="text-[13px] text-defect">Extraction failed. Gemini may be busy; try again in a moment.</p>}
    </div>
  );
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
              {res && <span className="pill bg-surface-2 text-ink-2">{RESOLUTION_WORD[res]}</span>}
            </div>
          </div>
          {/* The shipment before the paperwork: ops people know a case by its BL no. and lane, not its filenames. */}
          <Identity s={c.ship} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
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
            <p className="mt-1 text-[13px]">
              {c.classConf != null
                ? `Classified by the fine-tuned model at ${Math.round(c.classConf * 100)}% confidence${c.classReview ? ", under its review gate" : ""}.`
                : "Category comes from keyword rules until the classifier is connected."}
            </p>
          )}
        </div>

        {readFirst && readBlock}
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
                      <tr id={`row-${f.key}`} tabIndex={-1} key={f.key} className={cn("border-b border-line align-top outline-none last:border-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-burgundy", blocking(r) && (review ? "bg-review-tint/60" : "bg-defect-tint/60"))}>
                        <th scope="row" className="px-4 py-3 pl-5 text-left font-medium" title={f.key}>{fieldLabel(f.key)}</th>
                        <td className="num px-4 py-3 [overflow-wrap:anywhere]">{f.si || <span className="text-ink-3">— missing</span>}</td>
                        <td className="num px-4 py-3 [overflow-wrap:anywhere]">
                          {fix ? (<><span className="font-semibold">{fix.value}</span><div className="text-[12px] text-ink-3 line-through">{f.bl}</div></>) : state === "defect" ? <Diff a={f.si} b={f.bl} /> : f.bl || <span className="text-ink-3">— missing</span>}
                        </td>
                        <td className="px-4 py-3 pr-5">
                          <div className="grid justify-items-start gap-1.5">
                            <span className={cn("pill", state === "match" || state === "corrected" ? "bg-ok-tint text-ok" : review ? "bg-review-tint text-review-ink" : "bg-defect-tint text-defect")}>
                              {{ match: "● Match", corrected: "● Corrected", defect: review ? "▲ Differs" : "▲ Defect", missing: "▲ Missing" }[state]}
                            </span>
                            <FieldScore value={f.confidence} />
                            {state !== "match" && !res && <button className="btn btn-sm" onClick={() => setModal({ kind: "fix", f })}><Pencil size={13} aria-hidden />{state === "corrected" ? "Edit fix…" : "Fix misread…"}</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
              Field score is a deterministic comparison signal, not BERT confidence: 100 means equal, 70 means both values exist but differ, 60 means one side is missing, and 0 means both are absent. The tick is the {HITL_THRESHOLD} human-review gate.
            </p>
          </section>
        )}
        {!readFirst && readBlock}
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
        {/* An uncertain category is settled here, by the person who can see the attachments, before any other step. */}
        {c.reason === "classification_uncertain" && !res && (
          <div className="grid gap-1.5">
            <span className="label">This email is a…</span>
            <Dropdown label="Reclassify" value="" onChange={(v) => v && reclassify(c.id, v as Category)}
              options={[{ value: "", label: "Choose category" }, ...CATEGORIES.map((k) => ({ value: k, label: categoryLabel(k) }))]} />
          </div>
        )}
        <div className="grid gap-2">
          {replyFirst && <ReplyButton primary awaiting={false} review={review} onClick={() => setModal({ kind: "reply" })} />}
          {!replyFirst && !awaiting && <button className="btn btn-primary" disabled={!!why} onClick={() => approve(c.id)}>Approve &amp; submit</button>}
          {res === "approved" && isBl && <button className="btn" onClick={() => setModal({ kind: "approval" })}><Reply size={15} aria-hidden />Tell the carrier to release…</button>}
          {awaiting && <ReplyButton primary={false} awaiting review={review} onClick={() => setModal({ kind: "reply" })} />}
          <button className="btn btn-escalate" disabled={!!res} onClick={() => setModal({ kind: "escalate" })}><BellRing ring={res === "escalated"}><Flag size={15} /></BellRing>{res === "escalated" ? "Escalated" : "Escalate"}</button>
          {(replyFirst || awaiting) && <button className="btn" disabled={!!why} onClick={() => approve(c.id)}>Approve &amp; submit</button>}
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
      <ReplyModal open={modal?.kind === "reply"} c={c} rows={rows} who={account?.name || account?.email || ""} onClose={() => setModal(null)}
        onDraft={(how) => requestAmendment(c.id, how)} />
      <ReplyModal open={modal?.kind === "approval"} mode="approve" c={c} rows={rows} who={account?.name || account?.email || ""} onClose={() => setModal(null)} />
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

function ReplyButton({ primary, awaiting, review, onClick }: { primary: boolean; awaiting: boolean; review: boolean; onClick: () => void }) {
  return (
    <button className={cn("btn", primary && "btn-primary")} onClick={onClick}>
      <Reply size={15} aria-hidden />{awaiting ? "Chase again…" : review ? "Ask for the documents…" : "Request amendment…"}
    </button>
  );
}

/** For extraction misreads only. A real difference in the carrier's draft is never fixed here: it goes back as an amendment. */
function FixModal({ state, c, onClose }: { state: Field | null; c: Case; onClose: () => void }) {
  const { correct } = useCases();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  // Empty on purpose: pre-filling the SI value made "make it match" the one-click path.
  useEffect(() => { if (state) { setValue(""); setReason(""); } }, [state]);
  return (
    <Modal open={!!state} onClose={onClose} title={state ? `Fix misread ${fieldLabel(state.key).toLowerCase()}` : "Fix misread"}>
      {state && (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); correct(c.id, state.key, value.trim(), reason.trim()); onClose(); }}>
          <p className="rounded-[var(--radius-control)] bg-surface-2 p-3 text-[13px] text-ink-2">
            Only when the tool read the document wrong. If the carrier’s <Abbr t="BL" /> really says this, close this and use <strong className="text-ink">Request amendment</strong>: approving a fix here would pass a BL the carrier never changed.
          </p>
          <p className="label">What does the original BL actually say?</p>
          <div className="flex flex-wrap gap-2">
            {[["SI", state.si], ["BL", state.bl]].map(([l, v]) => v && (
              <button type="button" key={l} aria-pressed={value === v} className={cn("btn btn-sm num", value === v && "btn-primary")} onClick={() => setValue(v)}>Use {l}: {v.length > 28 ? `${v.slice(0, 27)}…` : v}</button>
            ))}
          </div>
          <label className="grid gap-1.5"><span className="label">Value on the original</span>
            <input className="field num" value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
          </label>
          <label className="grid gap-1.5"><span className="label">Where you checked it</span>
            <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Original BL PDF, page 1: text layer dropped the second line" />
          </label>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" required className="mt-0.5" />
            I opened the original BL and it shows this value.
          </label>
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save fix</button></div>
        </form>
      )}
    </Modal>
  );
}

function EscalateModal({ open, c, onClose }: { open: boolean; c: Case; onClose: () => void }) {
  const { escalate } = useCases();
  const [priority, setPriority] = useState("medium");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  useEffect(() => { if (open) { setNote(""); setAssignee(""); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Escalate">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); escalate(c.id, priority, note.trim(), assignee.trim()); onClose(); }}>
        <fieldset className="grid gap-1.5"><legend className="label mb-1.5">Priority</legend>
          <div className="flex gap-2">
            {["low", "medium", "high"].map((p) => (
              <label key={p} className={cn("btn btn-sm cursor-pointer capitalize has-[:checked]:border-review has-[:checked]:bg-review-tint has-[:checked]:text-review-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2")}>
                <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} className="sr-only" />{p}
              </label>
            ))}
          </div>
        </fieldset>
        {/* An escalation nobody owns stalls; the name goes into the audit trail with it. */}
        <label className="grid gap-1.5"><span className="label">Assign to <span className="normal-case text-ink-3">(optional)</span></span>
          <input className="field" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. senior.docs@company.com" />
        </label>
        <label className="grid gap-1.5"><span className="label">What should the reviewer look at?</span>
          <textarea className="field" rows={4} value={note} onChange={(e) => setNote(e.target.value)} required autoFocus />
        </label>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-escalate">Escalate</button></div>
      </form>
    </Modal>
  );
}

function ReportModal({ open, c, rows, who, res, onClose }: { open: boolean; c: Case; rows: Row[]; who: string; res?: keyof typeof RESOLUTION_WORD; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Verification record" wide>
      <div className="grid gap-4">
        <div className="rounded-[var(--radius-control)] border border-line p-4">
          <p className="num text-[12px] text-ink-3">{c.id}</p>
          <p className="font-semibold [overflow-wrap:anywhere]">{c.subject}</p>
          <p className="mt-2 text-ink-2">
            {verdict(c)}
            {res && ` ${res === "awaiting" ? "Amendment requested" : RESOLUTION_WORD[res]} by ${who || "operator"}.`}
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
          window.print(); // blocks until the print dialog closes; the toast then confirms it was logged
          toast({ title: "Verification record exported", description: `${c.ship.bl ?? c.id} · logged to the audit trail`, icon: <Printer />, tone: "info" });
        }}><Printer size={15} aria-hidden />Print record</button></div>
      </div>
    </Modal>
  );
}

/** The shipment as ops people know it. Only the values the documents actually carry are shown. */
function Identity({ s }: { s: Shipment }) {
  const items = [
    ["BL no.", s.bl],
    ["Booking", s.booking],
    ["Carrier", s.carrier ? `${s.carrier} · ${s.scac}` : s.scac],
    ["Vessel", s.vessel && (s.voyage && !s.vessel.includes(s.voyage) ? `${s.vessel} · Voy. ${s.voyage}` : s.vessel)],
    ["Lane", s.pol && s.pod ? `${s.pol} → ${s.pod}` : null],
    ["Cargo", s.commodity],
    ["Freight", s.freight],
  ].filter((x): x is [string, string] => !!x[1]);
  if (!items.length) return null;
  return (
    <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-4">
      {items.map(([k, v], i) => (
        <div key={k} className="enter min-w-0" style={{ animationDelay: `${i * 40}ms` }}>
          <dt className="label">{k}</dt>
          <dd className="num mt-0.5 text-[13px] [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The request that closes the loop: which BL fields to amend, worded the way the SI says them. */
function replyText(c: Case, rows: Row[], who: string, mode: "amend" | "approve" = "amend") {
  const ref = c.ship.bl ? `BL ${c.ship.bl}` : `the draft BL (${c.id})`;
  const sign = `\n\nThank you.\n\nRegards,\n${who || "Shipping Documentation"}`;
  if (mode === "approve")
    return `Hi,\n\nWe have checked ${ref} against the Shipping Instruction and found no discrepancies. The draft is approved: please proceed with release.${sign}`;
  // A fixed misread is not the carrier's error, so only real defects and gaps go in the request.
  const bad = rows.filter((r) => r.state === "defect" || r.state === "missing");
  const lines = bad.map((r) => `- ${fieldLabel(r.f.key)}: BL shows "${r.f.bl || "(blank)"}", should read "${r.f.si || "(blank in SI, please confirm)"}"`);
  const ask = bad.length
    ? `We have checked ${ref} against the Shipping Instruction. Please amend the draft BL as below before release:\n\n${lines.join("\n")}\n\nKindly send the revised draft for our final check.`
    : `We could not check ${ref}: ${REASON_VERDICT[c.reason ?? "unreadable"].replace(/\.$/, "").toLowerCase()}. Please resend the Shipping Instruction and the draft BL as readable attachments.`;
  return `Hi,\n\n${ask}${sign}`;
}

/** onDraft fires once per opening, on the first copy or mail-open; without it the draft is only logged. */
export function ReplyModal({ open, c, rows, who, onClose, mode = "amend", onDraft }: {
  open: boolean; c: Case; rows: Row[]; who: string; onClose: () => void; mode?: "amend" | "approve"; onDraft?: (how: string) => void;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [drafted, setDrafted] = useState(false);
  useEffect(() => { if (open) { setText(replyText(c, rows, who, mode)); setCopied(false); setDrafted(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const subject = `RE: ${c.subject}`;
  const what = mode === "approve" ? "Release approval" : "Amendment request";
  const log = (how: string) => {
    if (onDraft) { if (!drafted) onDraft(how); setDrafted(true); return; }
    recordUserAction({ actionType: "DRAFT_REPLY", actionLabel: mode === "approve" ? "Drafted release approval" : undefined, emailId: c.id,
      description: `${what} for ${c.ship.bl ?? c.id} drafted (${how})`, metadata: { to: c.sender, subject } });
  };
  return (
    <Modal open={open} onClose={onClose} title={mode === "approve" ? "Tell the carrier to release" : "Draft reply"} wide>
      <div className="grid gap-4">
        <dl className="grid gap-1 text-[13px]">
          <div className="flex gap-2"><dt className="label w-16 pt-0.5">To</dt><dd className="num [overflow-wrap:anywhere]">{c.sender || "—"}</dd></div>
          <div className="flex gap-2"><dt className="label w-16 pt-0.5">Subject</dt><dd className="[overflow-wrap:anywhere]">{subject}</dd></div>
        </dl>
        <label className="grid gap-1.5"><span className="sr-only">Message</span>
          <textarea className="field num min-h-[260px] text-[13px] leading-5" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <p className="text-[12px] text-ink-3">Nothing is sent from here. Copy it, or open it in your email client and send it yourself.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); log("copied"); })}>
            {copied ? <Check size={15} className="text-ok" aria-hidden /> : <Copy size={15} aria-hidden />}{copied ? "Copied" : "Copy"}
          </button>
          <a className="btn btn-primary" onClick={() => log("opened in email")}
            href={`mailto:${encodeURIComponent(c.sender)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>
            <Mail size={15} aria-hidden />Open in email
          </a>
        </div>
      </div>
    </Modal>
  );
}
