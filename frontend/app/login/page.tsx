"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAccount } from "@/lib/app-state";
import { Abbr, Logo } from "@/components/ui";

export default function Login() {
  const { signIn } = useAccount();
  const router = useRouter();
  const enter = () => {
    signIn();
    const next = new URLSearchParams(location.search).get("next");
    router.replace(next && next.startsWith("/") ? next : "/"); // same-origin paths only
  };
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="h-0.5 fixed inset-x-0 top-0 bg-[#e78823]" aria-hidden />
      <section className="card enter w-full max-w-[420px] p-8">
        <Logo size={36} />
        <h1 className="mt-8 text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Sign in to DocuVerify</h1>
        <p className="mt-2 text-ink-2">
          Reads your shipping inbox and checks every draft Bill of Lading (<Abbr t="BL" />) against the Shipping Instruction (<Abbr t="SI" />) it came from.
        </p>

        <button className="btn btn-primary mt-6 w-full" onClick={enter}>Continue</button>
        <p className="mt-2 text-center text-[12px] text-ink-3">Reads the live mailbox from the backend.</p>

        <div className="my-6 h-px bg-line" />
        <button className="btn w-full" disabled>Continue with Google</button>
        <p className="mt-2 text-center text-[12px] text-ink-3">Not connected on this backend yet.</p>
        <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />
          Read-only access. DocuVerify never sends, deletes or replies.
        </p>
      </section>
      <p className="fixed bottom-5 text-[12px] text-ink-3">DocuVerify · built for AVERIS SDOC</p>
    </main>
  );
}
