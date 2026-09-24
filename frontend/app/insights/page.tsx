"use client";

import { useCases } from "@/lib/app-state";
import { AmendmentsAvoided, CarrierHeatmap, CategoryDonut, ClassifierCertainty, PipelineFlow, StraightThrough } from "@/components/overview/widgets";
import { Loading, OfflineNote, Skeleton } from "@/components/ui";

/* Ordered by what a decision gets made from, not by what looks good:
   is it working → what is it worth → where did it all go → who causes defects → can we trust the model. */
export default function Insights() {
  const { summary, load, offline, reload } = useCases();
  if (load === "loading") return <Loading><Skeleton className="h-28" /><Skeleton className="h-72" /></Loading>;
  return (
    <div className="grid gap-5">
      <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Insights</h1>
      {offline && <OfflineNote onRetry={reload} />}
      <div className="grid gap-5 @4xl:grid-cols-2">
        <StraightThrough />
        <AmendmentsAvoided s={summary} />
      </div>
      <PipelineFlow />
      <CarrierHeatmap />
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ClassifierCertainty />
        <CategoryDonut s={summary} />
      </div>
    </div>
  );
}
