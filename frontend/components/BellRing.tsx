"use client";

/* The ring from React Bits' BellToggle (reactbits.dev), ported to TypeScript: the icon swings on a decaying pendulum
   and sound waves leave its rim on each swing. Only the ring is ported, not the toggle pill; it plays when `ring`
   turns true. Styles are the .bell-ring rules in globals.css. */
import { useEffect, useRef, type ReactNode } from "react";

const SEG_EASE = "cubic-bezier(0.77, 0, 0.175, 1)";
const WARP = 0.6;

const passOffset = (k: number, passes: number) => 1 - Math.pow(1 - (k + 2 / 3) / (passes + 1), WARP);
const ringKeyframes = (from: number, amplitude: number, passes: number, decay: number): Keyframe[] => {
  const frames: Keyframe[] = [{ transform: `rotate(${from}deg)`, offset: 0, easing: SEG_EASE }];
  for (let k = 0; k < passes; k++) {
    const angle = amplitude * Math.pow(1 - k / passes, decay) * (k % 2 ? 1 : -1);
    frames.push({ transform: `rotate(${angle.toFixed(2)}deg)`, offset: passOffset(k, passes), easing: SEG_EASE });
  }
  frames.push({ transform: "rotate(0deg)", offset: 1 });
  return frames;
};
const liveAngle = (el: Element) => {
  const tf = getComputedStyle(el).transform;
  if (!tf || tf === "none") return 0;
  const m = new DOMMatrix(tf);
  return (Math.atan2(m.b, m.a) * 180) / Math.PI;
};

export default function BellRing({
  ring,
  children,
  amplitude = 17,
  passes = 5,
  decay = 1,
  duration = 820,
  pivot = 16,
}: { ring: boolean; children: ReactNode; amplitude?: number; passes?: number; decay?: number; duration?: number; pivot?: number }) {
  const glyphRef = useRef<HTMLSpanElement>(null);
  const waveLeft = useRef<SVGSVGElement>(null);
  const waveRight = useRef<SVGSVGElement>(null);
  const was = useRef(ring);

  useEffect(() => {
    const rose = ring && !was.current;
    was.current = ring;
    const el = glyphRef.current;
    if (!rose || !el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(ringKeyframes(liveAngle(el), amplitude, passes, decay), { duration, easing: "linear" });
    for (let k = 0; k < passes; k++) {
      const side = k % 2 ? waveRight.current : waveLeft.current;
      const strength = Math.pow(1 - k / passes, decay);
      side?.animate(
        [{ opacity: 0, transform: "scale(0.55)" }, { opacity: 0.9 * strength, offset: 0.3 }, { opacity: 0, transform: "scale(1.25)" }],
        { duration: 380, delay: passOffset(k, passes) * duration, easing: "ease-out" },
      );
    }
  }, [ring, amplitude, passes, decay, duration]);

  return (
    <span className="bell-ring" aria-hidden style={{ "--br-pivot": `${pivot}%` } as React.CSSProperties}>
      <span ref={glyphRef} className="bell-ring__glyph">{children}</span>
      <svg ref={waveLeft} className="bell-ring__wave bell-ring__wave--left" viewBox="0 0 14 14">
        <path d="M14 8a6 6 0 0 0-6 6" />
        <path d="M14 4A10 10 0 0 0 4 14" />
      </svg>
      <svg ref={waveRight} className="bell-ring__wave bell-ring__wave--right" viewBox="0 0 14 14">
        <path d="M0 8a6 6 0 0 1 6 6" />
        <path d="M0 4a10 10 0 0 1 10 10" />
      </svg>
    </span>
  );
}
