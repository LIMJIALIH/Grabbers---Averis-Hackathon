"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useAccount } from "@/lib/app-state";
import { Abbr, Logo } from "@/components/ui";

export default function Login() {
  const { account, ready, configured, error, logoutPending, signIn, signOut, retry } = useAccount();
  const router = useRouter();
  const destination = () => {
    const next = new URLSearchParams(location.search).get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
    const url = new URL(next, location.origin);
    return url.origin === location.origin && url.pathname !== "/login" ? url.pathname + url.search : "/";
  };
  useEffect(() => { if (ready && account) router.replace(destination()); }, [ready, account, router]);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="h-0.5 fixed inset-x-0 top-0 bg-[#e78823]" aria-hidden />
      <section className="card enter w-full max-w-[420px] p-8">
        <Logo size={36} />
        <h1 className="mt-8 text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Sign in to DocuVerify</h1>
        <p className="mt-2 text-ink-2">
          Reads your shipping inbox and checks every draft Bill of Lading (<Abbr t="BL" />) against the Shipping Instruction (<Abbr t="SI" />) it came from.
        </p>

        {error && <p role="alert" className="mt-4 text-[13px] text-burgundy">{error}</p>}
        {logoutPending ? (
          <button className="btn btn-primary mt-6 w-full" disabled={!ready} onClick={() => void signOut()}>{ready ? "Retry sign out" : "Signing out…"}</button>
        ) : (
          <button className="btn btn-primary mt-6 w-full" disabled={!ready || !configured} onClick={() => {
            location.assign(`/api/v1/auth/google/login?next=${encodeURIComponent(destination())}`);
          }}>{ready ? "Continue with Google" : "Checking session…"}</button>
        )}
        {ready && !configured && <p className="mt-2 text-center text-[12px] text-ink-3">Google sign-in is awaiting configuration.</p>}
        {error && !logoutPending && <button className="btn mt-2 w-full" onClick={() => void retry()}>Retry connection</button>}

        <div className="my-6 h-px bg-line" />
        <button className="btn w-full" disabled={!ready || logoutPending} onClick={signIn}>Continue with demo mailbox</button>
        <p className="mt-2 text-center text-[12px] text-ink-3">Explore the shared shipping demo without connecting Gmail.</p>
        <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />
          Read-only access. DocuVerify never sends, deletes or replies.
        </p>
      </section>
      <p className="fixed bottom-5 text-[12px] text-ink-3">DocuVerify · built for AVERIS SDOC</p>
    </main>
  );
}
