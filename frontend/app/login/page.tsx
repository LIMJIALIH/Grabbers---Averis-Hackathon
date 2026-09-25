"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAccount } from "@/lib/app-state";
import { Abbr, Logo } from "@/components/ui";
import dynamic from "next/dynamic";
import TechText from "@/components/TechText";
import StrokeText from "@/components/StrokeText";
import SpecularButton from "@/components/SpecularButton";
import TextType from "@/components/TextType";
import { clearAuthIntro, markAuthIntro } from "@/components/shell/AuthIntro";

// three.js + postprocessing load on the client only; the page shows its black base until the canvas is ready.
const PixelBlast = dynamic(() => import("@/components/PixelBlast"), { ssr: false });
const DitherVeil = dynamic(() => import("@/components/DitherVeil"), { ssr: false });

// The consignee pair is real (demo email_107): the carrier's draft names a different company. The other rows are shortened context.
const PITCH_ROWS = [
  { field: "Shipper", si: "April Fine Paper Trading", bl: "April Fine Paper Trading", ok: true },
  { field: "Consignee", si: "KTP Co., Ltd", bl: "Vital Solutions Pte. Ltd", ok: false },
  { field: "Port of loading", si: "Port Klang (Westport)", bl: "Port Klang (Westport)", ok: true },
];
// Straight from the demo mailbox, the same figures Insights shows after sign-in.
const PITCH_STATS = [
  { value: "1 in 2", label: "draft BLs had at least one field wrong (65 of 129)" },
  { value: "RM 3,250+", label: "in amendment fees caught before sailing, up to RM 16,250" },
];

// React Bits TextType, typed once. An invisible copy holds the finished size so nothing below jumps while it types;
// screen readers get the whole sentence, and reduced motion shows it straight away.
function Typed({ text, still, onVisible }: { text: string; still: boolean; onVisible?: boolean }) {
  if (still) return <>{text}</>;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="grid">
        <span className="invisible [grid-area:1/1]">{text}{" |"}</span>
        <TextType as="span" className="[grid-area:1/1]" text={text} loop={false} typingSpeed={40} initialDelay={300}
          startOnVisible={onVisible} cursorClassName="text-[#e78823]" />
      </span>
    </>
  );
}

export default function Login() {
  const { account, ready, configured, error, logoutPending, signIn, signOut, retry } = useAccount();
  const router = useRouter();
  // Sign-in lands on Insights, the first nav item; a deep link (a case, a filtered queue) still goes where it pointed.
  const HOME = "/insights";
  const destination = () => {
    const next = new URLSearchParams(location.search).get("next");
    if (!next || next === "/" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return HOME;
    const url = new URL(next, location.origin);
    return url.origin === location.origin && url.pathname !== "/login" ? url.pathname + url.search : HOME;
  };
  // ?view (from the account menu) shows this page to a signed-in user instead of sending them back in.
  useEffect(() => { if (ready && account && !new URLSearchParams(location.search).has("view")) router.replace(destination()); }, [ready, account, router]);
  const [entered, setEntered] = useState(false); // the StrokeText entry has finished; TechText takes over
  const [still, setStill] = useState(false); // honour reduced motion: freeze the background
  useEffect(() => {
    setStill(matchMedia("(prefers-reduced-motion: reduce)").matches);
    // The backend sends a failed Google round trip to /login?auth_error=…: no welcome intro for that.
    // (Not on every mount: the route guard can flash /login while a signed-in session settles.)
    if (new URLSearchParams(location.search).has("auth_error")) clearAuthIntro();
  }, []);
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: still ? "auto" : "smooth" });
  // The sign-in card sits below the fold: bring it into view when it has something to say (a failed sign-in or sign-out).
  useEffect(() => {
    if (error || logoutPending || new URLSearchParams(location.search).has("auth_error")) document.getElementById("signin")?.scrollIntoView();
  }, [error, logoutPending]);
  return (
    // Three screens: hero (wordmark, tagline, two calls to action) → sign-in → why it matters (the pitch).
    <main className="relative bg-[#070707] px-4">
      {/* Background: React Bits PixelBlast, Averis-orange dithered dots on the black page. The pointer drags a liquid
          wobble through them; a click sends a ripple. Frozen (speed 0) under reduced motion. */}
      <div className="fixed inset-0" aria-hidden>
        <PixelBlast variant="circle" pixelSize={6} color="#e78823" patternScale={6} patternDensity={1.35} pixelSizeJitter={0.5}
          enableRipples rippleSpeed={0.4} rippleThickness={0.12} rippleIntensityScale={1.5}
          liquid liquidStrength={0.12} liquidRadius={1.2} liquidWobbleSpeed={5}
          speed={still ? 0 : 0.6} edgeFade={0.25} transparent />
      </div>
      {/* Dark glow behind the wordmark and card so orange "Verify" never sits on orange tape. Clicks pass through. */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_48%_52%_at_30%_52%,rgba(7,7,7,0.92),rgba(7,7,7,0.55)_60%,transparent_85%)]" aria-hidden />
      <div className="h-0.5 fixed inset-x-0 top-0 z-10 bg-[#e78823]" aria-hidden />
      {/* Big wordmark: React Bits TechText, "Docu" white, "Verify" Averis orange and underlined. Hover a letter to
          see its outline; drag one and it springs back. */}
      <section className="relative z-10 mx-auto grid min-h-dvh max-w-[1280px] content-center items-center gap-8 pb-10 lg:grid-cols-2">
        <div className="flex flex-col items-start text-left">
        {/* Entry: React Bits StrokeText draws the outlines, wipes in the fill, then crossfades to TechText. Both lay
            the word out the same way, so the handover doesn't move a pixel. */}
        <div className="relative h-[140px] w-full max-w-[640px] sm:h-[170px]">
          <div className={`size-full transition-opacity duration-500 ${entered ? "opacity-100" : "opacity-0"}`}>
            <TechText text="DocuVerify" highlightFrom={4} highlightColor="#e78823" underline color="#ffffff" accentColor="#ffffff"
              fontWeight={800} fontSize={128} letterSpacing={-0.04} specks={12} speed={0.5} align="left" />
          </div>
          <div aria-hidden className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${entered ? "opacity-0" : "opacity-100"}`}>
            <StrokeText text="DocuVerify" highlightFrom={4} highlightColor="#e78823" underline strokeColor="#ffffff" fillColor="#ffffff"
              fontWeight={800} fontSize={128} letterSpacing={-0.04} align="left" strokeWidth={1.4} drawDuration={1.6}
              stagger={0.07} onComplete={() => setEntered(true)} />
          </div>
        </div>
        <p className="mt-4 max-w-[560px] text-[20px] font-medium leading-[28px] text-white/85 sm:text-[24px] sm:leading-[32px]">
          <Typed text="Every draft Bill of Lading, checked against its Shipping Instruction before it sails." still={still} />
        </p>
        <div className="mt-8 flex gap-3">
          <SpecularButton radius={12} className="h-11 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#141410] transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e78823]" onClick={() => go("signin")}>Get started</SpecularButton>
          <SpecularButton radius={12} className="h-11 rounded-xl bg-white/15 px-5 text-[15px] font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e78823]" onClick={() => go("learn")}>Learn more</SpecularButton>
        </div>
        </div>
        {/* React Bits DitherVeil: the grey container as light dots on the page black (paper = page colour, so the photo's
            white backdrop vanishes). The cursor wipes the dither away to the photo; the mask feathers the box into the page. */}
        <div className="h-[280px] [mask-image:radial-gradient(closest-side,black_70%,transparent)] sm:h-[400px] lg:h-[520px]">
          <DitherVeil src="/container.jpeg" pattern="floyd" pixelSize={2} inkColor="#d6d6d6" paperColor="#070707"
            revealRadius={140} softness={0.6} linger={1} />
        </div>
      </section>

      <div id="signin" className="relative z-10 flex min-h-dvh items-center justify-center py-16">
      <section className="card w-full max-w-[420px] p-8">
        <Logo size={36} />
        <h1 className="mt-8 text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Sign in to DocuVerify</h1>
        <p className="mt-2 text-ink-2">
          Reads your shipping inbox and checks every draft Bill of Lading (<Abbr t="BL" />) against the Shipping Instruction (<Abbr t="SI" />) it came from.
        </p>

        {error && <p role="alert" className="mt-4 text-[13px] text-burgundy">{error}</p>}
        {logoutPending ? (
          <SpecularButton radius={10} lineColor="#e78823" className="btn btn-primary mt-6 w-full" disabled={!ready} onClick={() => void signOut()}>{ready ? "Retry sign out" : "Signing out…"}</SpecularButton>
        ) : (
          <SpecularButton radius={10} lineColor="#e78823" className="btn btn-primary mt-6 w-full" disabled={!ready || !configured} onClick={() => {
            markAuthIntro(); // the app plays the welcome intro once Google sends the user back signed in
            location.assign(`/api/v1/auth/google/login?next=${encodeURIComponent(destination())}`);
          }}>{ready ? "Continue with Google" : "Checking session…"}</SpecularButton>
        )}
        {ready && !configured && <p className="mt-2 text-center text-[12px] text-ink-3">Google sign-in is awaiting configuration.</p>}
        {error && !logoutPending && <SpecularButton radius={10} lineColor="#e78823" className="btn mt-2 w-full" onClick={() => void retry()}>Retry connection</SpecularButton>}

        <div className="my-6 h-px bg-line" />
        <SpecularButton radius={10} lineColor="#e78823" className="btn w-full" disabled={!ready || logoutPending} onClick={() => { if (account) return router.replace(destination()); clearAuthIntro(); signIn(); }}>Continue with demo mailbox</SpecularButton>
        <p className="mt-2 text-center text-[12px] text-ink-3">Explore the shared shipping demo without connecting Gmail.</p>
        <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />
          Read-only access. DocuVerify never sends, deletes or replies.
        </p>
      </section>
      </div>

      {/* Learn more: the pitch in one screen. The cost of a wrong field, the product catching one (a real pair from the
          demo mailbox), the proof from that mailbox, and a one-click way in. Read top to bottom, left to right. */}
      <section id="learn" className="relative z-10 mx-auto flex min-h-dvh max-w-[1120px] flex-col justify-center py-20 text-white">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#e78823]">Why it matters</p>
        <h2 className="mt-3 max-w-[760px] text-[32px] font-bold leading-[38px] tracking-[-0.02em] sm:text-[48px] sm:leading-[54px]">
          <Typed text="A wrong name on a BL costs up to RM 250 once it sails. Catch it before." still={still} onVisible />
        </h2>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {/* The catch: what an operator actually sees. */}
          <figure className="rounded-2xl border border-white/10 bg-black/70 p-6 backdrop-blur">
            <figcaption className="flex items-center justify-between gap-3 text-[13px] text-white/60">
              <span className="num">OOLU1815997062 · Port Klang → Mombasa</span>
              <span className="rounded-full bg-[#e78823]/15 px-2.5 py-0.5 font-semibold text-[#f0a24a]">Held for a person</span>
            </figcaption>
            <dl className="mt-5 grid gap-px overflow-hidden rounded-xl bg-white/10 text-[14px]">
              {PITCH_ROWS.map((r) => (
                <div key={r.field} className="grid grid-cols-[108px_minmax(0,1fr)] gap-x-4 gap-y-1 bg-[#0d0d0c] px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_84px]">
                  <dt className="text-white/60">{r.field}</dt>
                  <dd className="num text-white/85 sm:order-none"><span className="text-white/40 sm:hidden">SI </span>{r.si}</dd>
                  <dd className={`num col-start-2 sm:col-start-auto ${r.ok ? "text-white/85" : "text-[#ff8a9f] underline decoration-[#ff8a9f]/60 underline-offset-4"}`}>
                    <span className="text-white/40 no-underline sm:hidden">BL </span>{r.bl}
                  </dd>
                  <dd className={`col-start-2 text-[12px] font-semibold sm:col-start-auto sm:text-right ${r.ok ? "text-[#5cc98b]" : "text-[#ff8a9f]"}`}>{r.ok ? "● Match" : "▲ Differs"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[13px] leading-[20px] text-white/60">
              The carrier typed a different consignee onto the draft. DocuVerify flagged it in seconds, before anyone opened the file.
            </p>
          </figure>

          {/* The proof: numbers from the same demo mailbox. */}
          <div className="grid gap-4">
            {PITCH_STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-black/70 p-6 backdrop-blur">
                <div className="text-[40px] font-bold leading-[44px] tracking-[-0.03em]">{s.value}</div>
                <p className="mt-1 text-[14px] text-white/70">{s.label}</p>
              </div>
            ))}
            <p className="rounded-xl bg-black/70 px-3 py-2 text-[12px] text-white/60 backdrop-blur">From the 520-email demo mailbox. Fees: published Malaysian carrier tariffs, RM 50–250 per amended BL.</p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <SpecularButton radius={12} className="h-11 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#141410] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e78823]"
            disabled={!ready || logoutPending} onClick={() => { if (account) return router.replace(destination()); clearAuthIntro(); signIn(); }}>Try the demo mailbox</SpecularButton>
          <SpecularButton radius={12} className="h-11 rounded-xl bg-white/15 px-5 text-[15px] font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e78823]" onClick={() => go("signin")}>Connect your inbox</SpecularButton>
          <span className="flex items-center gap-2 text-[13px] text-white/60"><ShieldCheck size={16} className="text-[#5cc98b]" aria-hidden />Read-only. Never sends, deletes or replies.</span>
        </div>
      </section>
      <p className="relative z-10 pb-6 text-center text-[12px] text-white/60">DocuVerify · built for AVERIS SDOC</p>
    </main>
  );
}
