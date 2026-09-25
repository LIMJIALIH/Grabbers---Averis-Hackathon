"use client";

/* StrokeText from React Bits (reactbits.dev), ported to TypeScript. The component's CSS rules are inline classes.
   Changes so it can hand over to TechText without a jump: it fills its parent and lays the word out with TechText's
   fit (same size, baseline and `align`) instead of fitting the SVG to the glyph box; `letterSpacing` is in em like
   TechText's. Additions for the two-tone wordmark: `highlightFrom`/`highlightColor` and `underline`, and
   `onComplete` fires when the draw and fill have finished. */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

type Glyph = { char: string; color: string; x1: number; x2: number };
type Layout = { width: number; height: number; size: number; x: number; baseline: number; left: number; right: number; top: number; bottom: number; glyphs: Glyph[] };

export default function StrokeText({
  text = "Draw Attention",
  strokeColor = "#A78BFA",
  fillColor = "#F8FAFC",
  strokeWidth = 1.4,
  drawDuration = 1.6,
  fillDelay = 0.2,
  stagger = 0.05,
  ease = "power2.out",
  trigger = "mount",
  fillMode = "wipe",
  fontSize = 128,
  fontWeight = 800,
  letterSpacing = -0.03,
  reverse = false,
  align = "center",
  highlightFrom = -1,
  highlightColor = "#e78823",
  underline = false,
  onComplete,
  className = "",
  style,
}: {
  text?: string; strokeColor?: string; fillColor?: string; strokeWidth?: number; drawDuration?: number; fillDelay?: number;
  stagger?: number; ease?: string; trigger?: "mount" | "hover" | "scroll" | "loop"; fillMode?: "fade" | "wipe" | "none";
  fontSize?: number; fontWeight?: number; letterSpacing?: number; reverse?: boolean; align?: "center" | "left";
  highlightFrom?: number; highlightColor?: string; underline?: boolean; onComplete?: () => void;
  className?: string; style?: React.CSSProperties;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const wipeRectRef = useRef<SVGRectElement>(null);
  const doneRef = useRef(onComplete);
  const [box, setBox] = useState<Layout | null>(null);

  const wipeId = `stroke-text-wipe-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const characters = useMemo(() => Array.from(String(text ?? "")), [text]);
  const colorAt = (i: number, base: string) => (highlightFrom >= 0 && i >= highlightFrom ? highlightColor : base);

  useEffect(() => { doneRef.current = onComplete; });

  // TechText's layout: shrink to fit 90% of the width and 66% of the height, centre the ink vertically.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const probe = document.createElement("canvas").getContext("2d");
    if (!root || !probe) return undefined;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);
      const family = getComputedStyle(root).fontFamily || "sans-serif";
      const setFont = (size: number) => {
        probe.font = `${fontWeight} ${size}px ${family}`;
        if ("letterSpacing" in probe) probe.letterSpacing = `${letterSpacing * size}px`;
      };
      setFont(fontSize);
      let m = probe.measureText(text);
      const fit = Math.min(
        1,
        (width * 0.9) / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1),
        (height * 0.66) / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1),
      );
      const size = fontSize * fit;
      setFont(size);
      m = probe.measureText(text);
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const x = (align === "left" ? 8 : (width - inkWidth) / 2) + m.actualBoundingBoxLeft;
      const baseline = (height - inkHeight) / 2 + m.actualBoundingBoxAscent;
      let prefix = "";
      const glyphs = characters.map((char, i) => {
        prefix += char;
        const own = probe.measureText(char);
        const gx = x + probe.measureText(prefix).width - own.width;
        return { char, color: colorAt(i, fillColor), x1: gx - own.actualBoundingBoxLeft, x2: gx + own.actualBoundingBoxRight };
      });
      setBox({
        width, height, size, x, baseline, glyphs,
        left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent,
      });
    };

    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, fontSize, fontWeight, letterSpacing, align, highlightFrom, highlightColor, fillColor]);

  const dash = box ? Math.max(box.size * 7, 200) : 200;
  const drawn = box !== null;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !drawn) return undefined;

    const strokes = gsap.utils.toArray<SVGElement>(root.querySelectorAll("[data-stroke-char]"));
    const fills = gsap.utils.toArray<SVGElement>(root.querySelectorAll("[data-fill-char]"));
    const wipe = wipeRectRef.current;
    if (!strokes.length) return undefined;
    const wipeWidth = () => Number(root.querySelector("svg")?.viewBox.baseVal.width ?? 0);

    const fillEnabled = fillMode !== "none";
    const useWipe = fillEnabled && fillMode === "wipe";
    const fillDuration = Math.max(0.4, drawDuration * 0.5);
    const staggerConfig = reverse ? { each: stagger, from: "end" as const } : stagger;
    const targets = [...strokes, ...fills, wipe].filter(Boolean);
    const finish = () => doneRef.current?.();

    const setStart = () => {
      gsap.killTweensOf(targets);
      gsap.set(strokes, { strokeDasharray: dash, strokeDashoffset: dash });
      gsap.set(fills, { opacity: useWipe ? 1 : 0 });
      if (wipe) gsap.set(wipe, { attr: { width: 0 } });
    };

    const setEnd = () => {
      gsap.killTweensOf(targets);
      gsap.set(strokes, { strokeDasharray: dash, strokeDashoffset: 0 });
      gsap.set(fills, { opacity: fillEnabled ? 1 : 0 });
      if (wipe) gsap.set(wipe, { attr: { width: fillEnabled ? wipeWidth() : 0 } });
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setEnd();
      finish();
      return () => { gsap.killTweensOf(targets); };
    }

    const build = () => {
      setStart();
      const tl = gsap.timeline({
        paused: true,
        repeat: trigger === "loop" ? -1 : 0,
        repeatDelay: trigger === "loop" ? 0.9 : 0,
        defaults: { overwrite: "auto" },
        onComplete: finish,
      });
      tl.to(strokes, { strokeDashoffset: 0, duration: drawDuration, ease, stagger: staggerConfig }, 0);
      if (useWipe && wipe) {
        tl.to(wipe, { attr: { width: wipeWidth() }, duration: fillDuration, ease: "power2.inOut" }, drawDuration + fillDelay);
      } else if (fillEnabled) {
        tl.to(fills, { opacity: 1, duration: fillDuration, ease: "power2.out", stagger: staggerConfig }, drawDuration + fillDelay);
      }
      return tl;
    };

    let timeline: gsap.core.Timeline | null = null;
    let scrollTrigger: ScrollTrigger | null = null;
    let removeHover: (() => void) | null = null;

    if (trigger === "hover") {
      setEnd();
      const play = () => {
        timeline?.kill();
        timeline = build();
        timeline.play(0);
      };
      root.addEventListener("pointerenter", play);
      removeHover = () => root.removeEventListener("pointerenter", play);
    } else {
      timeline = build();
      if (trigger === "scroll") {
        scrollTrigger = ScrollTrigger.create({ trigger: root, start: "top 82%", once: true, onEnter: () => timeline?.play(0) });
      } else {
        timeline.play(0);
      }
    }

    return () => {
      removeHover?.();
      scrollTrigger?.kill();
      timeline?.kill();
      gsap.killTweensOf(targets);
    };
    // Re-runs only when the drawing first appears or the animation settings change, not on every resize.
  }, [drawn, dash, drawDuration, fillDelay, stagger, ease, trigger, fillMode, reverse]);

  const fontStyle = box ? { fontSize: `${box.size}px`, fontWeight, letterSpacing: `${letterSpacing * box.size}px` } : undefined;
  const run = box && underline && highlightFrom >= 0 ? box.glyphs.slice(highlightFrom).filter((g) => g.char.trim()) : [];
  const underlineY = box ? box.baseline + box.size * 0.1 : 0;

  return (
    <span
      ref={rootRef}
      className={`block size-full leading-none ${trigger === "hover" ? "cursor-pointer" : ""} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={String(text ?? "")}
    >
      {box && (
        <svg className="block size-full select-none" viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden>
          {fillMode === "wipe" && (
            <defs>
              <clipPath id={wipeId} clipPathUnits="userSpaceOnUse">
                <rect ref={wipeRectRef} x={0} y={0} width={0} height={box.height} />
              </clipPath>
            </defs>
          )}
          <text x={box.x} y={box.baseline} fill="none" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" style={fontStyle}>
            {characters.map((char, i) => (
              <tspan data-stroke-char key={`s-${i}`} stroke={colorAt(i, strokeColor)}>{char}</tspan>
            ))}
          </text>
          <g clipPath={fillMode === "wipe" ? `url(#${wipeId})` : undefined}>
            <text x={box.x} y={box.baseline} stroke="none" style={fontStyle}>
              {characters.map((char, i) => (
                <tspan data-fill-char key={`f-${i}`} fill={colorAt(i, fillColor)}>{char}</tspan>
              ))}
            </text>
            {run.length > 0 && (
              <line x1={run[0].x1} x2={run[run.length - 1].x2} y1={underlineY} y2={underlineY} stroke={highlightColor}
                strokeWidth={Math.max(2, box.size * 0.05)} strokeLinecap="round" />
            )}
          </g>
        </svg>
      )}
    </span>
  );
}
