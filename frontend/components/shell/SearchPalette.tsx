"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AlertTriangle, FileText, History, Inbox, LayoutDashboard, ListChecks, Mail } from "lucide-react";
import { useAccount, useCases } from "@/lib/app-state";
import { FIELDS, REASON_WORDS, searchText } from "@/lib/cases";
import { Modal } from "@/components/ui";

const PAGES = [
  { href: "/", label: "Queue", Icon: Inbox },
  { href: "/insights", label: "Insights", Icon: LayoutDashboard },
  { href: "/audit", label: "Audit", Icon: History },
];
const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 data-[selected=true]:bg-surface-2";

/* Recent: the last results opened from this palette, newest first. Starts empty; at RECENT_MAX the oldest drops off
   (FIFO), and opening one again moves it back to the top. Per account, in this browser only.
   ponytail: localStorage, so it doesn't follow you to another device; a GET/PUT /api/v1/me/recent would. */
type Recent = { kind: "email" | "file" | "problem" | "field"; label: string; sub?: string; href: string };
const RECENT_MAX = 5;
const readRecent = (key: string): Recent[] => {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
};
export const pushRecent = (list: Recent[], r: Recent) =>
  [r, ...list.filter((x) => x.href !== r.href || x.label !== r.label)].slice(0, RECENT_MAX);
const RECENT_ICON = { email: Mail, file: FileText, problem: AlertTriangle, field: ListChecks };

/** One palette over pages, emails and fields. cmdk does keyboard nav + a11y; the filter is ours
    so a 500-email inbox renders 8 rows, not 500. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cases } = useCases();
  const { account } = useAccount();
  const router = useRouter();
  const [q, setQ] = useState("");
  const recentKey = `docuverify-recent:${account?.email ?? ""}`;
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => { if (!open) setQ(""); else setRecent(readRecent(recentKey)); }, [open, recentKey]);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(
    () =>
      needle
        ? cases.filter((c) => searchText(c).includes(needle)).slice(0, 8)
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
  const go = (href: string, r?: Omit<Recent, "href">) => {
    if (r) try { localStorage.setItem(recentKey, JSON.stringify(pushRecent(readRecent(recentKey), { ...r, href }))); } catch {}
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
              {recent.map((r) => {
                const Icon = RECENT_ICON[r.kind] ?? History;
                return (
                  <Command.Item key={`${r.href}|${r.label}`} value={`recent:${r.href}|${r.label}`} onSelect={() => go(r.href, r)} className={item}>
                    <Icon size={16} aria-hidden className="shrink-0" />
                    {r.sub && <span className="num shrink-0 text-[12px] text-ink-3">{r.sub}</span>}
                    <span className="truncate">{r.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}
          {hits.length > 0 && (
            <Command.Group heading={<span className="label px-3">{needle ? "Emails" : "Needs attention"}</span>}>
              {hits.map((c) => (
                <Command.Item key={c.id} value={c.id} onSelect={() => go(`/case/${c.id}`, { kind: "email", label: c.subject, sub: c.ship.bl ?? c.id })} className={item}>
                  <Mail size={16} aria-hidden className="shrink-0" />
                  <span className="num shrink-0 text-[12px] text-ink-3">{c.ship.bl ?? c.id}</span>
                  <span className="truncate">{c.subject}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {files.length > 0 && (
            <Command.Group heading={<span className="label px-3">Attachments</span>}>
              {files.map((f) => (
                <Command.Item key={f.name} value={f.name} onSelect={() => go(`/case/${f.id}`, { kind: "file", label: f.name })} className={item}>
                  <FileText size={16} aria-hidden className="shrink-0" />
                  <span className="num truncate">{f.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {problems.length > 0 && (
            <Command.Group heading={<span className="label px-3">Problems</span>}>
              {problems.map(([k, w]) => (
                <Command.Item key={k} value={k} onSelect={() => go(`/?reason=${k}`, { kind: "problem", label: w })} className={item}>{w}</Command.Item>
              ))}
            </Command.Group>
          )}
          {fields.length > 0 && (
            <Command.Group heading={<span className="label px-3">Fields</span>}>
              {fields.map(([k, l]) => (
                <Command.Item key={k} value={k} onSelect={() => go(`/?field=${k}`, { kind: "field", label: l, sub: k })} className={item}>
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
