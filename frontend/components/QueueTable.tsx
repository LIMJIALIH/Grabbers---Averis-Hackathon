"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Mail, MoreHorizontal, Search, X } from "lucide-react";
import SwipeRow from "@/components/SwipeRow";
import { toast } from "@/lib/toast";
import { useCases } from "@/lib/app-state";
import JellyRadio from "@/components/JellyRadio";
import { DEMO_FIRST, readRecent } from "@/lib/recent";
import { CATEGORIES, REASON_WORDS, RESOLUTION_WORD, categoryLabel, fieldLabel, isOpen, searchText, type Case } from "@/lib/cases";
import { CategoryPill, Dropdown, Empty, FieldScore, StatusPill } from "@/components/ui";

const PAGE = 10;
const STATUS_RANK = { NEEDS_REVIEW: 0, MISMATCH: 1, OK: 2 } as const;
type SortKey = "id" | "category" | "status" | "confidence" | "date";
const pad = (n: number) => String(n).padStart(2, "0");
const ddmmyy = (ms: number | null) => {
  if (ms == null) return "—";
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${pad(d.getFullYear() % 100)}`;
};

/** Filters live in the URL so a donut click, a deep link and a reload all agree. */
export function useQueue() {
  const { cases, resolutions } = useCases();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const status = params.get("status") ?? "";
  const field = params.get("field") ?? "";
  const reason = params.get("reason") ?? "";
  const scope = params.get("scope") ?? ""; // "open" | "resolved" | "other": the summary chips, so each count equals its list
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    next.delete("page");
    router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (!n || searchText(c).includes(n)) &&
        (!category || c.category === category) &&
        (!status || c.status === status) &&
        (!field || c.defects.includes(field)) &&
        (!reason || c.reason === reason) &&
        // Same rule as every "open" count, so a link that says 12 waiting opens 12.
        (scope !== "open" || isOpen(c, resolutions)) &&
        (scope !== "resolved" || (c.status !== "OK" && resolutions[c.id] === "approved")) &&
        (scope !== "escalated" || resolutions[c.id] === "escalated") &&
        (scope !== "awaiting" || resolutions[c.id] === "awaiting") &&
        (scope !== "other" || c.category !== "BL_COMPARISON"),
    );
  }, [cases, resolutions, q, category, status, field, reason, scope]);
  const active = !!(q || category || status || field || reason || scope);
  // Carried into /case/[id] so J/K there walks the same filtered list.
  const search = params.size ? `?${params}` : "";
  return { rows, resolutions, q, category, status, field, reason, scope, set, active, search, clear: () => set({ q: "", category: "", status: "", field: "", reason: "", scope: "" }) };
}

export function Filters({ q: qs }: { q: ReturnType<typeof useQueue> }) {
  const { q, category, status, field, reason, set } = qs;
  const { cases } = useCases();
  const [focus, setFocus] = useState(false);
  // Same Recent list as the search palette (lib/recent.ts); with nothing opened yet, the Verified showcase case.
  const recent = useMemo(() => {
    if (!focus) return [];
    const opened = readRecent().flatMap((r) => { const c = cases.find((x) => x.id === r.id); return c ? [{ c, at: r.at as number | null }] : []; });
    if (opened.length) return opened;
    const c = cases.find((x) => x.id === DEMO_FIRST[0]);
    return c ? [{ c, at: null as number | null }] : [];
  }, [focus, cases]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[200px] flex-1">
        <span className="sr-only">Search emails</span>
        <Search size={15} className="pointer-events-none absolute left-3 top-3 text-ink-3" aria-hidden />
        <input className="field w-full pl-9" placeholder="Search BL no., booking, vessel, port, sender" value={q} autoComplete="off" name="queue-search"
          onChange={(e) => set({ q: e.target.value })} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
        {!q && recent.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
            <span className="label px-3">Recent</span>
            {recent.map(({ c, at }) => (
              <Link key={c.id} href={`/case/${c.id}`} onMouseDown={(e) => e.preventDefault()}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                <Mail size={16} aria-hidden className="shrink-0" />
                <span className="num shrink-0 text-[12px] text-ink-3">{c.ship.bl ?? c.id}</span>
                <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                {at != null && <span className="num shrink-0 text-[12px] text-ink-3">{pad(new Date(at).getDate())}/{pad(new Date(at).getMonth() + 1)}</span>}
              </Link>
            ))}
          </div>
        )}
      </label>
      <Dropdown label="Category" value={category} onChange={(v) => set({ category: v, scope: "" })}
        options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))]} />
      <Dropdown label="Status" value={status} onChange={(v) => set({ status: v, scope: "" })}
        options={[{ value: "", label: "All statuses" }, { value: "NEEDS_REVIEW", label: "Needs review" }, { value: "MISMATCH", label: "Defect" }, { value: "OK", label: "Verified" }]} />
      {field && (
        <button className="btn btn-sm" onClick={() => set({ field: "" })}>Field: {fieldLabel(field)} <X size={13} aria-hidden /></button>
      )}
      {reason && (
        <button className="btn btn-sm" onClick={() => set({ reason: "" })}>Problem: {REASON_WORDS[reason as keyof typeof REASON_WORDS] ?? reason} <X size={13} aria-hidden /></button>
      )}
    </div>
  );
}

export const defaultOrder = (rows: Case[]) => sortRows(rows, null, 1);

const pin = (c: Case) => { const i = DEMO_FIRST.indexOf(c.id); return i < 0 ? DEMO_FIRST.length : i; };

function sortRows(rows: Case[], key: SortKey | null, dir: 1 | -1) {
  return [...rows].sort((a, b) => {
    if (!key) return pin(a) - pin(b) || STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.id.localeCompare(b.id, undefined, { numeric: true });
    const v = key === "status" ? STATUS_RANK[a.status] - STATUS_RANK[b.status]
      : key === "confidence" ? (a.confidence ?? 101) - (b.confidence ?? 101)
      : key === "date" ? (a.receivedAt ?? 0) - (b.receivedAt ?? 0)
      : String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true });
    return v * dir;
  });
}

/** One row of counts, each a filter. The only place these numbers appear. */
export function QueueStatusRow() {
  const { summary: s } = useCases();
  const qs = useQueue();
  // These partition the inbox: open review + open defects + verified + resolved + not compared = all emails.
  const chips = [
    { label: "All emails", n: s.total, on: !qs.status && !qs.category && !qs.scope, patch: { status: "", category: "", scope: "" }, cls: "" },
    // Chip colours go in as --jr-* vars (the jelly skin reads them); orange stays reserved for Needs review.
    { label: "Needs review", n: s.needsOpen, on: qs.status === "NEEDS_REVIEW" && qs.scope === "open", patch: { status: "NEEDS_REVIEW", category: "", scope: "open" }, cls: "[--jr-chip:var(--review-tint)] [--jr-text:var(--review-ink)] [--jr-ring:inset_0_0_0_1px_var(--review)]" },
    { label: "Defect", n: s.defectsOpen, on: qs.status === "MISMATCH" && qs.scope === "open", patch: { status: "MISMATCH", category: "", scope: "open" }, cls: "" },
    { label: "Verified", n: s.blOk, on: qs.status === "OK" && qs.category === "BL_COMPARISON", patch: { status: "OK", category: "BL_COMPARISON", scope: "" }, cls: "" },
    // Waiting on someone else is not done: these two sit apart from Resolved so the backlog stays honest.
    { label: "Awaiting carrier", n: s.awaiting, on: qs.scope === "awaiting", patch: { status: "", category: "", scope: "awaiting" }, cls: "" },
    { label: "Escalated", n: s.escalated, on: qs.scope === "escalated", patch: { status: "", category: "", scope: "escalated" }, cls: "" },
    { label: "Resolved", n: s.resolved, on: qs.scope === "resolved", patch: { status: "", category: "", scope: "resolved" }, cls: "" },
    { label: "Other", n: s.total - s.blTotal, on: qs.scope === "other", patch: { status: "", category: "", scope: "other" }, cls: "" },
  ];
  return (
    <JellyRadio
      ariaLabel="Queue summary"
      className="-mx-[var(--jr-pad-x)] flex-wrap [--jr-ring:inset_0_0_0_1px_var(--line-strong)]"
      items={chips.map((c) => ({
        value: c.label,
        className: c.cls,
        label: <span className="flex items-center gap-1.5"><span className="num text-[15px] font-semibold">{c.n}</span>{c.label}</span>,
      }))}
      value={chips.find((c) => c.on)?.label ?? ""}
      onChange={(v) => qs.set(chips.find((c) => c.label === v)!.patch)}
      chipColor="var(--surface)"
      activeColor="var(--ink)"
      textColor="var(--ink-2)"
      activeTextColor="var(--paper)"
      swell={0.12}
    />
  );
}

export function QueueTable() {
  const qs = useQueue();
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [page, setPage] = useState(1);
  const sorted = useMemo(() => sortRows(qs.rows, sort.key, sort.dir), [qs.rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const p = Math.min(page, pages);
  const shown = sorted.slice((p - 1) * PAGE, p * PAGE);
  const th = (key: SortKey, text: string, cls = "") => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={cls}>
      <button className="group flex h-10 items-center gap-1 label" onClick={() => setSort((s) => {
        const first = key === "date" ? -1 : 1; // date opens latest → earliest
        return { key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : first };
      })}>
        {text}
        {sort.key === key ? (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40 group-hover:opacity-100" />}
      </button>
    </th>
  );
  const open = (id: string) => router.push(`/case/${id}${qs.search}`);

  return (
    <section id="queue" className="card min-w-0 scroll-mt-24">
      <div className="card-head flex-wrap">
        <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.01em]">Emails to verify</h2>
        <span className="text-[13px] text-ink-3" aria-live="polite">{qs.rows.length} {qs.rows.length === 1 ? "email" : "emails"}</span>
      </div>
      <div className="border-b border-line p-4"><Filters q={qs} /></div>
      {shown.length === 0 ? (
        <Empty
          title={qs.active ? "No emails match these filters" : "Nothing in the queue"}
          hint={qs.active ? "Try a different search, or clear the filters." : "New emails appear here once the pipeline has read them."}
          action={qs.active ? <button className="btn btn-sm" onClick={qs.clear}>Clear filters</button> : undefined}
        />
      ) : (
        <>
        {/* Below 900px (the shell's narrow breakpoint) the queue is swipe cards: tap opens, swipe left for Open / Copy id.
            Desktop keeps the sortable table. CSS picks one, so only one is ever in the tab order. */}
        <ol className="grid gap-2 p-3 min-[900px]:hidden" aria-label="Emails to verify">
          {shown.map((c) => (
            <li key={c.id} className="min-w-0">{/* grid items default to min-width:auto, which defeats truncate */}
              <SwipeRow
                label={`${c.id}: ${c.subject}`}
                fullSwipe={false}
                height="auto"
                actionWidth={76}
                rowColor="var(--surface-2)"
                textColor="var(--ink)"
                actionColor="#a81233"
                drawerColor="#4a4441"
                actions={[
                  { id: "open", label: "Open", icon: <ExternalLink size={18} />, onSelect: () => open(c.id) },
                  { id: "copy", label: "Copy id", icon: <Copy size={18} />, onSelect: () => copyId(c.id) },
                ]}
              >
                <Link href={`/case/${c.id}${qs.search}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 outline-none focus-visible:underline">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.subject}</span>
                    <span className="num block truncate text-[12px] text-ink-3">{c.id}{c.ship.bl ? ` · ${c.ship.bl}` : ""}{c.ship.pol && c.ship.pod ? ` · ${c.ship.pol} → ${c.ship.pod}` : ""}</span>
                  </span>
                  <StatusPill c={c} />
                </Link>
              </SwipeRow>
            </li>
          ))}
        </ol>
        <div className="hidden overflow-x-auto min-[900px]:block">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left">
              <tr>
                {th("id", "Email id", "pl-5")}
                <th scope="col" className="label">Subject</th>
                <th scope="col" className="label hidden lg:table-cell">Shipment</th>
                {th("date", "Date", "hidden pr-6 lg:table-cell")}
                {th("category", "Category")}
                {th("status", "Status")}
                {th("confidence", "Lowest field score")}
                <th scope="col" className="w-12"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  onClick={() => open(c.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(c.id); }
                  }}
                  className="h-11 cursor-pointer border-b border-line outline-none last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-burgundy"
                >
                  <td className="num whitespace-nowrap pl-5 pr-3">{c.id}</td>
                  <td className="max-w-[300px] truncate pr-4" title={`${c.subject}
${c.sender}`}>{c.subject}</td>
                  <td className="hidden whitespace-nowrap pr-4 lg:table-cell"><ShipmentCell c={c} /></td>
                  <td className="num hidden whitespace-nowrap pr-6 lg:table-cell">{ddmmyy(c.receivedAt)}</td>
                  <td className="pr-3"><CategoryPill category={c.category} /></td>
                  <td className="pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusPill c={c} />
                      {qs.resolutions[c.id] && <span className="text-[12px] text-ink-3">{RESOLUTION_WORD[qs.resolutions[c.id]]}</span>}
                    </span>
                  </td>
                  <td className="pr-3"><FieldScore value={c.confidence} /></td>
                  <td onClick={(e) => e.stopPropagation()}><RowMenu id={c.id} onOpen={() => open(c.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-3">
        <span className="num">{sorted.length ? `${(p - 1) * PAGE + 1}–${Math.min(p * PAGE, sorted.length)} of ${sorted.length}` : "0 of 0"}</span>
        <span className="flex gap-1">
          <button className="icon-btn size-9" disabled={p <= 1} onClick={() => setPage(p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
          <button className="icon-btn size-9" disabled={p >= pages} onClick={() => setPage(p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        </span>
      </div>
    </section>
  );
}

/** Copy an email id and confirm it; only toasts once the clipboard write has actually succeeded. */
const copyId = (id: string) =>
  navigator.clipboard?.writeText(id).then(() => toast({ title: "Email id copied", description: id, icon: <Copy />, tone: "info", duration: 2000 }));

function RowMenu({ id, onOpen }: { id: string; onOpen: () => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="icon-btn" aria-label={`Actions for ${id}`}><MoreHorizontal size={16} /></Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className="pop w-44 rounded-[var(--radius-control)] border border-line bg-surface p-1 shadow-[var(--shadow-pop)] outline-none">
            <Menu.Item onClick={onOpen} className="cursor-pointer rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2">Open email</Menu.Item>
            <Menu.Item onClick={() => copyId(id)} className="cursor-pointer rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2">Copy email id</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}


/** BL no. over its lane, both mono: the two things an ops person reads a shipment by. */
function ShipmentCell({ c }: { c: Case }) {
  const { bl, pol, pod } = c.ship;
  if (!bl && !pol) return <span className="text-ink-3">—</span>;
  return (
    <span className="grid leading-4">
      <span className="num text-[12px]">{bl ?? "no BL no."}</span>
      {pol && pod && <span className="num max-w-[220px] truncate text-[11px] text-ink-3" title={`${pol} → ${pod}`}>{pol} → {pod}</span>}
    </span>
  );
}
