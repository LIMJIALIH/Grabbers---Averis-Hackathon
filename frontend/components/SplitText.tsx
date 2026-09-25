"use client";

/* SplitText from React Bits (reactbits.dev), ported to TypeScript. useGSAP is swapped for a layout effect with
   gsap.context, so @gsap/react isn't needed. Addition: with reduced motion the text shows at rest, unsplit. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText as GSAPSplitText } from "gsap/SplitText";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, GSAPSplitText);

type Tween = gsap.TweenVars;

export default function SplitText({
  text,
  className = "",
  delay = 50,
  duration = 1.25,
  ease = "power3.out",
  splitType = "chars",
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = "-100px",
  textAlign = "center",
  tag = "p",
  onLetterAnimationComplete,
}: {
  text: string; className?: string; delay?: number; duration?: number; ease?: string;
  splitType?: "chars" | "words" | "lines" | "words, chars"; from?: Tween; to?: Tween; threshold?: number; rootMargin?: string;
  textAlign?: React.CSSProperties["textAlign"]; tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span"; onLetterAnimationComplete?: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null); // any of the tags; typed as one so the ref fits them all
  const done = useRef(false);
  const onComplete = useRef(onLetterAnimationComplete);
  onComplete.current = onLetterAnimationComplete;
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    if (document.fonts.status === "loaded") setFontsLoaded(true);
    else document.fonts.ready.then(() => setFontsLoaded(true));
  }, []);

  const fromKey = JSON.stringify(from);
  const toKey = JSON.stringify(to);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text || !fontsLoaded || done.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const startPct = (1 - threshold) * 100;
    const m = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin);
    const value = m ? parseFloat(m[1]) : 0;
    const unit = m ? m[2] || "px" : "px";
    const sign = value === 0 ? "" : value < 0 ? `-=${Math.abs(value)}${unit}` : `+=${value}${unit}`;
    const start = `top ${startPct}%${sign}`;

    let split: GSAPSplitText | null = null;
    const ctx = gsap.context(() => {
      split = new GSAPSplitText(el, {
        type: splitType,
        smartWrap: true,
        autoSplit: splitType === "lines",
        linesClass: "split-line",
        wordsClass: "split-word",
        charsClass: "split-char",
        reduceWhiteSpace: false,
        onSplit: (self) => {
          const targets =
            (splitType.includes("chars") && self.chars.length && self.chars) ||
            (splitType.includes("words") && self.words.length && self.words) ||
            (splitType.includes("lines") && self.lines.length && self.lines) ||
            self.chars;
          return gsap.fromTo(targets, { ...from }, {
            ...to,
            duration,
            ease,
            stagger: delay / 1000,
            scrollTrigger: { trigger: el, start, once: true, fastScrollEnd: true, anticipatePin: 0.4 },
            onComplete: () => { done.current = true; onComplete.current?.(); },
            willChange: "transform, opacity",
            force3D: true,
          });
        },
      });
    }, el);
    return () => {
      ctx.revert();
      try { (split as GSAPSplitText | null)?.revert(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay, duration, ease, splitType, fromKey, toKey, threshold, rootMargin, fontsLoaded]);

  const Tag = tag;
  return (
    <Tag ref={ref} className={`split-parent ${className}`}
      style={{ textAlign, overflow: "hidden", display: "inline-block", whiteSpace: "normal", wordWrap: "break-word", willChange: "transform, opacity" }}>
      {text}
    </Tag>
  );
}
