"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { FileText, History, Inbox, LayoutDashboard, Mail } from "lucide-react";
import { useCases } from "@/lib/app-state";
import { FIELDS, REASON_WORDS } from "@/lib/cases";
import { Modal } from "@/components/ui";

const PAGES = [
  { href: "/", label: "Queue", Icon: Inbox },
  { href: "/insights", label: "Insights", Icon: LayoutDashboard },
  { href: "/audit", label: "Audit", Icon: History },
];
const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 data-[selected=true]:bg-surface-2";

/** One palette over pages, emails and fields. cmdk does keyboard nav + a11y; the filter is ours
    so a 500-email inbox renders 8 rows, not 500. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cases } = useCases();
  const router = useRouter();
  const [q, setQ] = useState("");
  useEffect(() => { if (!open) setQ(""); }, [open]);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(
    () =>
      needle
        ? cases.filter((c) => `${c.id} ${c.subject} ${c.sender}`.toLowerCase().includes(needle)).slice(0, 8)
        : cases.filter((c) => c.status !== "OK").slice(0, 5),
    [cases, needle],
  );
  const files = useMemo(
    () => (needle ? cases.flatMap((c) => c.attachments.filter((a) => a.name.toLowerCase().includes(needle)).map((a) => ({ id: c.id, name: a.name }))).slice(0, 5) : []),
    [cases, needle],
  );
  const problems = (Object.entries(REASON_WORDS) as [string, string][]).filter(([, w]) => needle && w.includes(needle));
  const fields = FIELDS.filter(([k, l]) => needle && `${k} ${l}`.toLowerCase().includes(needle));
  const pages = PAGES.filter((p) => !needle || p.label.toLowerCase().includes(needle));
  const go = (href: string) => { onClose(); router.push(href); };

  return (
    <Modal open={open} onClose={onClose} title="Search">
      <Command shouldFilter={false} label="Search" loop>
        <Command.Input value={q} onValueChange={setQ} placeholder="Search emails, senders, fields, pages…" className="field mb-3 w-full" autoFocus />
        <Command.List className="max-h-80 overflow-y-auto">
          <Command.Empty className="px-3 py-6 text-center text-ink-2">Nothing matches “{q}”. Try an email id or a sender.</Command.Empty>
          {pages.length > 0 && (
            <Command.Group heading={<span className="label px-3">Go to</span>}>
              {pages.map(({ href, label, Icon }) => (
                <Command.Item key={href} value={href} onSelect={() => go(href)} className={item}><Icon size={16} aria-hidden />{label}</Command.Item>
              ))}
            </Command.Group>
          )}
          {hits.length > 0 && (
            <Command.Group heading={<span className="label px-3">{needle ? "Emails" : "Needs attention"}</span>}>
              {hits.map((c) => (
                <Command.Item key={c.id} value={c.id} onSelect={() => go(`/case/${c.id}`)} className={item}>
                  <Mail size={16} aria-hidden className="shrink-0" />
                  <span className="num shrink-0 text-[12px] text-ink-3">{c.id}</span>
                  <span className="truncate">{c.subject}</span>
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
