"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, Download, Search } from "lucide-react";
import { useAuditTrail, type ActionType } from "@/lib/auditTrailStore";
import { Dropdown, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function Audit() {
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
        (!n || `${a.description} ${a.actionLabel} ${JSON.stringify(a.metadata ?? {})}`.toLowerCase().includes(n)));
    return newest ? list.reverse() : list;
  }, [actions, q, type, email, newest]);

  const save = (body: string, type: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `docuverify-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportJson = () => save(JSON.stringify(actions, null, 2), "application/json", "json");
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const exportCsv = () =>
    save(
      ["seq,time,action,email,description,metadata", ...actions.map((a, i) => [i + 1, a.timestampIso, a.actionLabel, a.emailId, a.description, a.metadata && JSON.stringify(a.metadata)].map(cell).join(","))].join("\r\n"),
      "text/csv",
      "csv",
    );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Audit trail <span className="num text-[15px] font-normal text-ink-3">{actions.length}</span></h1>
          <p className="mt-1 text-ink-2">Every correction, approval and escalation from this session, in order. Held in memory: export to keep a copy.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={exportCsv} disabled={!actions.length}><Download size={15} aria-hidden />Export CSV</button>
          <button className="btn" onClick={exportJson} disabled={!actions.length}><Download size={15} aria-hidden />Export JSON</button>
        </div>
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
          <ol className="divide-y divide-line">
            {rows.map(({ a, seq }) => {
              const isOpen = open.has(a.id);
              return (
                <li key={a.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-4">
                    <span className="num w-8 shrink-0 pt-0.5 text-[12px] text-ink-3">#{seq}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-3"><span className="font-medium">{a.actionLabel}</span><time className="num text-[12px] text-ink-3" dateTime={a.timestampIso}>{a.timestamp}</time></p>
                      <p className="text-ink-2 [overflow-wrap:anywhere]">{a.description}</p>
                      {isOpen && a.metadata && <pre className="num mt-2 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-3 text-[12px]">{JSON.stringify(a.metadata, null, 2)}</pre>}
                    </div>
                    {a.metadata && (
                      <button className="icon-btn size-9" aria-expanded={isOpen} aria-label="Toggle metadata"
                        onClick={() => setOpen((s) => { const n = new Set(s); if (!n.delete(a.id)) n.add(a.id); return n; })}>
                        <ChevronDown size={16} className={cn("transition-transform", isOpen && "rotate-180")} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
