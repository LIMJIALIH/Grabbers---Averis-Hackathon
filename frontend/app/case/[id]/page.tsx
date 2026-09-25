"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useCases } from "@/lib/app-state";
import { recordOpened } from "@/lib/recent";
import { defaultOrder, useQueue } from "@/components/QueueTable";
import { CasePane } from "@/components/inbox/CasePane";
import { Empty, Loading, OfflineNote, Skeleton } from "@/components/ui";

function CasePage() {
  const { id } = useParams<{ id: string }>();
  const { load, cases, offline, reload } = useCases();
  const qs = useQueue();
  const router = useRouter();
  const order = defaultOrder(qs.rows);
  const at = order.findIndex((c) => c.id === id);
  const go = (to: number) => order[to] && router.replace(`/case/${order[to].id}${qs.search}`);

  const known = cases.some((c) => c.id === id);
  useEffect(() => {
    if (known) recordOpened(id);
  }, [id, known]);

  // J / K walk the filtered queue without going back to the list.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if (document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if (k === "j") go(at + 1);
      if (k === "k") go(at - 1);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });

  if (load === "loading") return <Loading><Skeleton className="h-[70vh]" /></Loading>;
  const current = cases.find((c) => c.id === id);
  return (
    <div className="grid gap-5">
      {offline && <OfflineNote onRetry={reload} />}
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${qs.search}`} className="btn btn-ghost btn-sm"><ArrowLeft size={14} aria-hidden />Queue</Link>
        {at >= 0 && (
          <span className="flex items-center gap-1 text-[13px] text-ink-3">
            <span className="num">{at + 1} of {order.length}</span>
            <button className="icon-btn size-9" disabled={at <= 0} onClick={() => go(at - 1)} aria-label="Previous email (K)"><ChevronLeft size={16} /></button>
            <button className="icon-btn size-9" disabled={at >= order.length - 1} onClick={() => go(at + 1)} aria-label="Next email (J)"><ChevronRight size={16} /></button>
          </span>
        )}
      </div>
      {current ? (
        <CasePane key={current.id} c={current} />
      ) : (
        <div className="card"><Empty title={`No email ${id} in this mailbox`} hint="The link may belong to a different account. Pick an email from the queue." /></div>
      )}
    </div>
  );
}

export default function CaseRoute() {
  return <Suspense fallback={<Skeleton className="h-[70vh]" />}><CasePage /></Suspense>;
}
