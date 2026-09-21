"use client";

import { Suspense } from "react";
import { useCases } from "@/lib/app-state";
import { QueueStatusRow, QueueTable } from "@/components/QueueTable";
import { Loading, OfflineNote, Skeleton } from "@/components/ui";

export default function Queue() {
  const { load, offline, reload } = useCases();
  if (load === "loading")
    return <Loading><Skeleton className="h-10 w-96" /><Skeleton className="h-96" /></Loading>;
  return (
    <div className="grid gap-5">
      <h1 className="sr-only">Queue</h1>
      {offline && <OfflineNote onRetry={reload} />}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <QueueStatusRow />
        <QueueTable />
      </Suspense>
    </div>
  );
}
