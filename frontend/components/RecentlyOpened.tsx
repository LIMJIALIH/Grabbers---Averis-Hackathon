"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useCases } from "@/lib/app-state";
import { DEMO_FIRST, readRecent, type Recent } from "@/lib/recent";
import { StatusPill } from "@/components/ui";
import BorderGlow from "@/components/BorderGlow";

const pad = (n: number) => String(n).padStart(2, "0");
const ddmmyy = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${pad(d.getFullYear() % 100)}`;
};

/** The last three emails this operator opened, newest first. Hidden until there is one. */
export function RecentlyOpened() {
  const { cases } = useCases();
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  const opened = recent.flatMap((r) => {
    const c = cases.find((x) => x.id === r.id);
    return c ? [{ c, at: r.at as number | null }] : [];
  });
  // Nothing opened yet: start with just email_001, the Verified showcase case.
  const seeded = opened.length === 0;
  const items = seeded
    ? DEMO_FIRST.slice(0, 1).flatMap((id) => { const c = cases.find((x) => x.id === id); return c ? [{ c, at: null as number | null }] : []; })
    : opened;
  if (!items.length) return null;
  return (
    <section aria-label="Recently opened" className="grid gap-2">
      <h2 className="label">Recently opened</h2>
      <ul className="grid gap-3 min-[700px]:grid-cols-3">
        {items.map(({ c, at }) => (
          <li key={c.id} className="min-w-0">
            <BorderGlow className="recent-glow" backgroundColor="var(--recent-bg)" glowColor="270 95 75" colors={["#c084fc", "#f472b6", "#38bdf8"]}
              borderRadius={16} glowRadius={28} edgeSensitivity={30} coneSpread={25} fillOpacity={0.35}>
              <Link href={`/case/${encodeURIComponent(c.id)}`} className="flex min-w-0 flex-col gap-2 p-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-burgundy">
                <span className="truncate font-semibold text-[var(--recent-ink)]" title={c.subject}>{c.subject}</span>
                <span className="flex items-center gap-2 text-[12px] text-[var(--recent-ink-3)]">
                  <Mail size={14} aria-hidden className="shrink-0" />
                  <span className="num truncate">{at == null ? c.id : `${c.id} · Opened ${ddmmyy(at)}`}</span>
                  <span className="ml-auto shrink-0"><StatusPill c={c} /></span>
                </span>
              </Link>
            </BorderGlow>
          </li>
        ))}
      </ul>
    </section>
  );
}
