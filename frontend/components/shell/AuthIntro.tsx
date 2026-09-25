"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/ui";
import { cn } from "@/lib/utils";

// three.js only loads when the intro actually plays, not with every app page.
const CRTWarp = dynamic(() => import("@/components/CRTWarp"), { ssr: false });

/* One-shot welcome after Google sign-in. The login page flags the tab right before leaving for Google
   (the backend's callback redirect carries no marker); the app plays this once and clears the flag.
   A failed sign-in lands back on /login, which clears the flag too. */
const KEY = "docuverify-auth-intro";
export const markAuthIntro = () => { try { sessionStorage.setItem(KEY, "1"); } catch {} };
export const clearAuthIntro = () => { try { sessionStorage.removeItem(KEY); } catch {} };

export function AuthIntro({ name }: { name: string }) {
  const [phase, setPhase] = useState<"off" | "on" | "out">("off");
  // The flag is cleared only when the intro ends, not on mount: the shell can remount while the session
  // settles (and dev StrictMode re-runs effects), and a remount should carry on, not lose the intro.
  const finish = () => { clearAuthIntro(); setPhase("off"); };

  useEffect(() => {
    let flagged = false;
    try { flagged = sessionStorage.getItem(KEY) === "1"; } catch {}
    if (!flagged) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { clearAuthIntro(); return; }
    setPhase("on");    const fade = setTimeout(() => setPhase("out"), 2400);
    const done = setTimeout(finish, 3000);
    const skip = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    addEventListener("keydown", skip);
    return () => { clearTimeout(fade); clearTimeout(done); removeEventListener("keydown", skip); };
  }, []);

  if (phase === "off") return null;
  return (
    <div
      role="status"
      onClick={finish}
      className={cn(
        "fixed inset-0 z-[100] grid cursor-pointer place-items-center bg-[#0f0306] transition-opacity duration-500",
        phase === "out" && "pointer-events-none opacity-0",
      )}
    >
      <div className="absolute inset-0" aria-hidden>
        <CRTWarp color="#e78823" color2="#a81233" backgroundColor="#0f0306" />
      </div>
      <div className="enter relative grid justify-items-center gap-3 rounded-[24px] bg-black/45 px-10 py-8 text-center text-white backdrop-blur-sm">
        <LogoMark size={64} />
        <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#e78823]">Gmail connected</p>
        <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">Welcome, {name}</h1>
        <p className="text-white/80">Opening your shipping inbox…</p>
      </div>
    </div>
  );
}
