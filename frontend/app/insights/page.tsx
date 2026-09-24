"use client";

import { useCases } from "@/lib/app-state";
import { AmendmentsAvoided, CategoryDonut, ClassifierCertainty, DefectBreakdown, PipelineFlow, StraightThrough, TrendChart } from "@/components/overview/widgets";
import { Loading, OfflineNote, Skeleton } from "@/components/ui";

/* Ordered the way a documentation lead reads it, most actionable first:
   what is still waiting on us → what to fix and who to chase → how we perform and what it is worth
   → volume over time (demo data, so never near the top) → how the system itself is doing. */
export default function Insights() {
  const { summary, load, offline, reload } = useCases();
  if (load === "loading") return <Loading><Skeleton className="h-28" /><Skeleton className="h-72" /></Loading>;
  return (
    <div className="grid gap-5">
      <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Insights</h1>
      {offline && <OfflineNote onRetry={reload} />}
      <PipelineFlow />
      <DefectBreakdown />
      <div className="grid gap-5 @4xl:grid-cols-2">
        <StraightThrough />
        <AmendmentsAvoided s={summary} />
      </div>
      <TrendChart />
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ClassifierCertainty />
        <CategoryDonut s={summary} />
      </div>
    </div>
  );
}
