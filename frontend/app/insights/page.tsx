"use client";

import Link from "next/link";
import { greetingName, useAccount, useCases } from "@/lib/app-state";
import { AmendmentsAvoided, CategoryDonut, ClassifierCertainty, DefectBreakdown, PipelineFlow, StraightThrough, TrendChart } from "@/components/overview/widgets";
import { Abbr, CountUp, Loading, OfflineNote, Skeleton } from "@/components/ui";
import { isOpen } from "@/lib/cases";

/* Ordered the way a documentation lead reads it, most actionable first:
   what is still waiting on us → what to fix and who to chase → how we perform and what it is worth
   → volume over time → how the system itself is doing. */
export default function Insights() {
  const { summary, load, offline, reload } = useCases();
  if (load === "loading") return <Loading><Skeleton className="h-28" /><Skeleton className="h-72" /></Loading>;
  return (
    <div className="grid gap-5">
      {offline && <OfflineNote onRetry={reload} />}
      {/* What is waiting (the headline) on the left, where every email went on the right. */}
      <div className="grid gap-5 @4xl:grid-cols-2">
        <Welcome />
        <PipelineFlow />
      </div>
      {/* The two headline numbers stack on the left; the defects card spans both rows on the right and shares them
          (subgrid), so straight-through ends level with its stat strip and the cost card with its bar lists. */}
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <StraightThrough />
        <AmendmentsAvoided s={summary} />
        <DefectBreakdown />
      </div>
      <TrendChart />
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ClassifierCertainty />
        <CategoryDonut s={summary} />
      </div>
    </div>
  );
}

/** The page's one claim, stated once and biggest: how many BL drafts still need a person. The greeting stays, but small. */
function Welcome() {
  const { account } = useAccount();
  const { cases, resolutions } = useCases();
  const bl = cases.filter((c) => c.category === "BL_COMPARISON");
  const blOpen = bl.filter((c) => isOpen(c, resolutions)).length;
  const otherOpen = cases.filter((c) => c.category !== "BL_COMPARISON" && isOpen(c, resolutions)).length;
  return (
    <section className="card enter flex flex-col justify-between gap-6 p-6" aria-label="What is waiting">
      <div className="grid gap-2">
        <p className="text-[14px] text-ink-2">Welcome back{account ? `, ${greetingName(account)}` : ""}</p>
        {blOpen > 0 ? (
          <>
            <div className="text-[96px] font-semibold leading-[96px] tracking-[-0.04em]"><CountUp to={blOpen} /></div>
            {/* The sentence is set as a heading so the number reads as a claim, not one stat among the page's others. */}
            <p className="text-[26px] font-semibold leading-8 tracking-[-0.01em]">
              <span className="text-ink-2">of <span className="num">{bl.length}</span></span> <Abbr t="BL" /> drafts still need a person.
            </p>
            {otherOpen > 0 && <p className="text-[14px] text-ink-2">Plus <span className="num">{otherOpen}</span> other {otherOpen === 1 ? "email" : "emails"} to look at.</p>}
          </>
        ) : (
          <p className="text-[24px] font-semibold leading-8">Every BL draft is checked. Nothing is waiting for you.</p>
        )}
      </div>
      <Link href="/?scope=open" className="btn btn-primary self-start">Open the queue</Link>
    </section>
  );
}
