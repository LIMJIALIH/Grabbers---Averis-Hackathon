"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { FileText, History, Inbox, LayoutDashboard, Mail } from "lucide-react";
import { useCases } from "@/lib/app-state";
import { DEMO_FIRST, readRecent } from "@/lib/recent";
import { FIELDS, REASON_WORDS, searchText } from "@/lib/cases";
import { Modal } from "@/components/ui";

const PAGES = [
  { href: "/", label: "Queue", Icon: Inbox },
  { href: "/insights", label: "Insights", Icon: LayoutDashboard },
  { href: "/gmail", label: "Gmail", Icon: Mail },
  { href: "/audit", label: "Audit", Icon: History },
];
const p2 = (n: number) => String(n).padStart(2, "0");
/** Today: the time (14:05). Any other day: dd/mm/yy. */
const stamp = (ms: number) => {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? `${p2(d.getHours())}:${p2(d.getMinutes())}`
    : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${p2(d.getFullYear() % 100)}`;
};
/** Short form, dd/mm. */
const dm = (ms: number) => { const d = new Date(ms); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 data-[selected=true]:bg-surface-2";

/* Recent: the same list as the queue's "Recently opened" cards (lib/recent.ts), so both show the same emails.
   Opening an email anywhere records it; with nothing opened yet it starts with the Verified showcase case.
   pushRecent is kept for scripts/check-recent.mts (the old palette-only FIFO). */
type Recent = { kind: "email" | "file" | "problem" | "field"; label: string; sub?: string; href: string };
export const pushRecent = (list: Recent[], r: Recent) =>
  [r, ...list.filter((x) => x.href !== r.href || x.label !== r.label)].slice(0, 5);

/** One palette over pages, emails and fields. cmdk does keyboard nav + a11y; the filter is ours
    so a 500-email inbox renders 8 rows, not 500. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cases } = useCases();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState<{ id: string; at: number }[]>([]);
  useEffect(() => { if (!open) setQ(""); else setOpened(readRecent()); }, [open]);
  const recent = useMemo(() => {
    const rows = opened.flatMap((r) => { const c = cases.find((x) => x.id === r.id); return c ? [{ c, at: r.at as number | null }] : []; });
    if (rows.length) return rows;
    const c = cases.find((x) => x.id === DEMO_FIRST[0]); // nothing opened yet: the Verified showcase case, undated
    return c ? [{ c, at: null as number | null }] : [];
  }, [cases, opened]);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(
    () =>
      needle
        ? cases.filter((c) => searchText(c).includes(needle)).slice(0, 8)
        : cases.filter((c) => c.status !== "OK").sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0)).slice(0, 5), // latest first; no date sinks
    [cases, needle],
  );
  const files = useMemo(
    () => (needle ? cases.flatMap((c) => c.attachments.filter((a) => a.name.toLowerCase().includes(needle)).map((a) => ({ id: c.id, name: a.name }))).slice(0, 5) : []),
    [cases, needle],
  );
  const problems = (Object.entries(REASON_WORDS) as [string, string][]).filter(([, w]) => needle && w.includes(needle));
  const fields = FIELDS.filter(([k, l]) => needle && `${k} ${l}`.toLowerCase().includes(needle));
  const pages = PAGES.filter((p) => !needle || p.label.toLowerCase().includes(needle));
  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal open={open} onClose={onClose} title="Search">
      <Command shouldFilter={false} label="Search" loop>
        <Command.Input value={q} onValueChange={setQ} placeholder="Search BL no., booking, vessel, emails, fields…" className="field mb-3 w-full" autoFocus />
        <Command.List className="max-h-80 overflow-y-auto">
          <Command.Empty className="px-3 py-6 text-center text-ink-2">Nothing matches “{q}”. Try an email id or a sender.</Command.Empty>
          {pages.length > 0 && (
            <Command.Group heading={<span className="label px-3">Go to</span>}>
              {pages.map(({ href, label, Icon }) => (
                <Command.Item key={href} value={href} onSelect={() => go(href)} className={item}><Icon size={16} aria-hidden />{label}</Command.Item>
              ))}
            </Command.Group>
          )}
          {!needle && recent.length > 0 && (
            <Command.Group heading={<span className="label px-3">Recent</span>}>
              {recent.map(({ c, at }) => (
                <Command.Item key={c.id} value={`recent:${c.id}`} onSelect={() => go(`/case/${c.id}`)} className={item}>
                  <Mail size={16} aria-hidden className="shrink-0" />
                  <span className="num shrink-0 text-[12px] text-ink-3">{c.ship.bl ?? c.id}</span>
                  <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  {at != null && <span className="num shrink-0 text-[12px] text-ink-3">{dm(at)}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {hits.length > 0 && (
            <Command.Group heading={<span className="label px-3">{needle ? "Emails" : "Needs attention"}</span>}>
              {hits.map((c) => (
                <Command.Item key={c.id} value={c.id} onSelect={() => go(`/case/${c.id}`)} className={item}>
                  <Mail size={16} aria-hidden className="shrink-0" />
                  <span className="num shrink-0 text-[12px] text-ink-3">{c.ship.bl ?? c.id}</span>
                  <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  {c.receivedAt != null && <span className="num shrink-0 text-[12px] text-ink-3">{stamp(c.receivedAt)}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {files.length > 0 && (
            <Command.Group heading={<span className="label px-3">Attachments</span>}>
              {files.map((f) => (
                <Command.Item key={f.name} value={f.name} onSelect={() => go(`/case/${f.id}`)} className={item}>
                  <FileText size={16} aria-hidden className="shrink-0" />
                  <span className="num truncate">{f.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {problems.length > 0 && (
            <Command.Group heading={<span className="label px-3">Problems</span>}>
              {problems.map(([k, w]) => (
                <Command.Item key={k} value={k} onSelect={() => go(`/?reason=${k}`)} className={item}>{w}</Command.Item>
              ))}
            </Command.Group>
          )}
          {fields.length > 0 && (
            <Command.Group heading={<span className="label px-3">Fields</span>}>
              {fields.map(([k, l]) => (
                <Command.Item key={k} value={k} onSelect={() => go(`/?field=${k}`)} className={item}>
                  {l}<span className="num text-[12px] text-ink-3">{k}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </Modal>
  );
}
