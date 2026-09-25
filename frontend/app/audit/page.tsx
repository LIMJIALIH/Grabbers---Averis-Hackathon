"use client";

import { HeaderActions } from "@/components/shell/Shell";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp, Braces, ChevronDown, CircleCheck, Columns2, Copy, Download, ExternalLink, FileText, Flag, Info, Mail,
  Paperclip, Pencil, Reply, Search,
} from "lucide-react";
import { useAuditTrail, type ActionType } from "@/lib/auditTrailStore";
import { Dropdown, Empty } from "@/components/ui";
import SwipeRow, { type SwipeAction } from "@/components/SwipeRow";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ICONS: Record<ActionType, typeof Info> = {
  OPEN_EMAIL: Mail, VIEW_ATTACHMENT: Paperclip, REVIEW_COMPARISON: Columns2, APPROVE_RESULT: CircleCheck,
  CORRECT_FIELD: Pencil, REQUEST_HUMAN_REVIEW: Flag, GENERATE_REPORT: FileText, DRAFT_REPLY: Reply, SYSTEM_NOTE: Info,
};

export default function Audit() {
  const router = useRouter();
  const { actions } = useAuditTrail();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | ActionType>("");
  const [email, setEmail] = useState("");
  const [newest, setNewest] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const emails = useMemo(() => [...new Set(actions.map((a) => a.emailId).filter(Boolean))] as string[], [actions]);
  const types = useMemo(() => [...new Set(actions.map((a) => a.actionType))], [actions]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = actions
      .map((a, i) => ({ a, seq: i + 1 }))
      .filter(({ a }) => (!type || a.actionType === type) && (!email || a.emailId === email) &&
        (!n || `${a.description} ${a.actionLabel} ${a.actor ?? ""} ${JSON.stringify(a.metadata ?? {})}`.toLowerCase().includes(n)));
    return newest ? list.reverse() : list;
  }, [actions, q, type, email, newest]);

  const save = (body: string, type: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `docuverify-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}` });
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Audit trail exported", description: `${actions.length} ${actions.length === 1 ? "entry" : "entries"} saved as ${ext.toUpperCase()}`, icon: <Download />, tone: "info" });
  };
  const exportJson = () => save(JSON.stringify(actions, null, 2), "application/json", "json");
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const exportCsv = () =>
    save(
      ["seq,time,action,actor,email,description,metadata", ...actions.map((a, i) => [i + 1, a.timestampIso, a.actionLabel, a.actor, a.emailId, a.description, a.metadata && JSON.stringify(a.metadata)].map(cell).join(","))].join("\r\n"),
      "text/csv",
      "csv",
    );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-ink-2"><span className="num font-semibold text-ink">{actions.length}</span> actions. Every correction, approval and escalation from this session, in order. Held in memory: export to keep a copy.</p>
        </div>
        <HeaderActions>
          <button className="btn" onClick={exportCsv} disabled={!actions.length}><Download size={15} aria-hidden />Export CSV</button>
          <button className="btn" onClick={exportJson} disabled={!actions.length}><Download size={15} aria-hidden />Export JSON</button>
        </HeaderActions>
      </div>
      <section className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <label className="relative min-w-[220px] flex-1"><span className="sr-only">Search the trail</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-ink-3" aria-hidden />
            <input className="field w-full pl-9" placeholder="Search descriptions and metadata" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Dropdown label="Action type" value={type} onChange={(v) => setType(v as ActionType | "")}
            options={[{ value: "", label: "All actions" }, ...types.map((t) => ({ value: t, label: t.replace(/_/g, " ").toLowerCase() }))]} />
          <Dropdown label="Email" value={email} onChange={setEmail}
            options={[{ value: "", label: "All emails" }, ...emails.map((e) => ({ value: e, label: e }))]} />
          <button className="btn" onClick={() => setNewest((v) => !v)}><ArrowDownUp size={15} aria-hidden />{newest ? "Newest first" : "Oldest first"}</button>
        </div>
        {rows.length === 0 ? (
          <Empty title={actions.length ? "No entries match" : "Nothing recorded yet"} hint={actions.length ? "Clear a filter to see more." : "Correct, approve or escalate an email and it will appear here."} />
        ) : (
          // Swipe a row left for Open / Copy / Details. Nothing here deletes: an audit trail you can swipe away isn't one.
          <ol className="grid gap-2 p-3">
            {rows.map(({ a, seq }) => {
              const isOpen = open.has(a.id);
              const toggle = () => setOpen((s) => { const n = new Set(s); if (!n.delete(a.id)) n.add(a.id); return n; });
              const Icon = ICONS[a.actionType] ?? Info;
              const actions: SwipeAction[] = [
                ...(a.emailId ? [{ id: "open", label: "Open", icon: <ExternalLink size={18} />, onSelect: () => router.push(`/case/${a.emailId}`) }] : []),
                { id: "copy", label: "Copy", icon: <Copy size={18} />, onSelect: () => void navigator.clipboard?.writeText(JSON.stringify(a, null, 2))
                  .then(() => toast({ title: "Entry copied", description: `#${seq} ${a.actionLabel} as JSON`, icon: <Copy />, tone: "info", duration: 2000 })) },
                ...(a.metadata ? [{ id: "details", label: isOpen ? "Hide" : "Details", icon: <Braces size={18} />, onSelect: toggle }] : []),
              ];
              return (
                <li key={a.id} className="min-w-0">
                  <SwipeRow
                    label={`#${seq} ${a.actionLabel}`}
                    actions={actions}
                    fullSwipe={false}
                    height="auto"
                    radius={16}
                    actionWidth={76}
                    rowColor="var(--surface-2)"
                    textColor="var(--ink)"
                    actionColor="#a81233"
                    drawerColor="#4a4441"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3.5 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink-2" aria-hidden><Icon size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{a.actionLabel}</p>
                        <p className="line-clamp-2 text-[13px] text-ink-2 [overflow-wrap:anywhere]">{a.description}</p>
                      </div>
                      <div className="grid shrink-0 justify-items-end gap-0.5 text-[12px] text-ink-3">
                        <time className="num" dateTime={a.timestampIso}>{a.timestamp}</time>
                        <span className="num max-w-[200px] truncate" title={a.actor}>{a.actor ?? "system"} · #{seq}</span>
                      </div>
                      {a.metadata && (
                        <button className="icon-btn size-9 shrink-0" aria-expanded={isOpen} aria-label="Toggle metadata" onClick={toggle}>
                          <ChevronDown size={16} className={cn("transition-transform", isOpen && "rotate-180")} />
                        </button>
                      )}
                    </div>
                  </SwipeRow>
                  {isOpen && a.metadata && <pre className="num mx-1 mt-1.5 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-3 text-[12px]">{JSON.stringify(a.metadata, null, 2)}</pre>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
