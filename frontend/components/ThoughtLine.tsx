"use client";

/* ThoughtLine from React Bits (reactbits.dev), ported to TypeScript. Hugeicons are swapped for the lucide icons the
   app already ships; renderLabel, elapsed and settleAfter are left out. Styles are the .thought-line rules in globals.css. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Sparkles } from "lucide-react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const GLYPH_DONE = 0.55;
const EMPTY_STEPS: string[] = [];

const fmt = (ds: number) => (ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`);
const spoken = (ds: number) =>
  ds < 600 ? `${(ds / 10).toFixed(1)} seconds` : `${Math.floor(ds / 600)} minutes ${((ds % 600) / 10).toFixed(1)} seconds`;

type Props = {
  label?: string; doneLabel?: string; glyph?: "sparkle" | "dot" | "none" | ReactNode; steps?: string[];
  collapsible?: boolean; collapseOnSettle?: boolean; color?: string; glyphColor?: string; fontSize?: number;
  breathPeriod?: number; breathDepth?: number; shimmer?: boolean; shimmerDuration?: number; settleDuration?: number;
  settleBlur?: number; working?: boolean; showTimer?: boolean; onSettle?: (seconds: number) => void;
  className?: string; style?: React.CSSProperties;
};

export default function ThoughtLine({
  label = "Thinking…",
  doneLabel = "",
  glyph = "sparkle",
  steps = EMPTY_STEPS,
  collapsible = true,
  collapseOnSettle = true,
  color = "currentColor",
  glyphColor = "",
  fontSize = 16,
  breathPeriod = 1.6,
  breathDepth = 0.45,
  shimmer = true,
  shimmerDuration = 1.8,
  settleDuration = 350,
  settleBlur = 2,
  working = true,
  showTimer = true,
  onSettle,
  className = "",
  style,
}: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const doneText = doneLabel || (showTimer ? "Thought for" : "Done thinking");
  const hasTrace = steps.length > 0;
  const depth = reduce ? Math.min(breathDepth, 0.2) : breathDepth;
  const period = reduce ? breathPeriod * 1.5 : breathPeriod;
  const trough = 1 - depth;
  const sheen = shimmer && !reduce;

  const glyphRef = useRef<HTMLSpanElement>(null);
  const breathRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const stackRef = useRef<HTMLSpanElement>(null);
  const workRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef<HTMLSpanElement>(null);
  const dsRef = useRef(0);
  const prevWorking = useRef(working);
  const settleRef = useRef(onSettle);
  settleRef.current = onSettle;
  const [announce, setAnnounce] = useState(label);

  useEffect(() => {
    if (working) setOpen(true);
    else if (collapseOnSettle) setOpen(false);
  }, [working, collapseOnSettle]);

  useEffect(() => {
    const glyphEl = glyphRef.current;
    const breathEl = breathRef.current;
    if (!breathEl) return;
    const s = settleDuration / 1000;
    const loop = (el: HTMLElement, delay: number) =>
      animate(el, { opacity: [trough, 1, trough] }, { duration: period, ease: EASE_IN_OUT, repeat: Infinity, delay });
    let cancelled = false;
    const running: { stop: () => void }[] = [];
    if (working) {
      if (depth > 0) {
        if (sheen) running.push(animate(breathEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }));
        if (glyphEl) {
          const lead = animate(glyphEl, { opacity: trough }, { duration: 0.2, ease: EASE_OUT });
          running.push(lead);
          lead.then(() => {
            if (cancelled) return;
            running.push(loop(glyphEl, 0));
            if (!sheen) running.push(loop(breathEl, 0.14));
          });
        } else if (!sheen) {
          running.push(loop(breathEl, 0.14));
        }
      } else {
        if (glyphEl) running.push(animate(glyphEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }));
        running.push(animate(breathEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }));
      }
    } else {
      if (glyphEl) running.push(animate(glyphEl, { opacity: GLYPH_DONE }, { duration: s, ease: EASE_OUT }));
      running.push(animate(breathEl, { opacity: 1 }, { duration: s, ease: EASE_OUT }));
    }
    return () => {
      cancelled = true;
      running.forEach((a) => a.stop());
    };
  }, [working, period, depth, trough, settleDuration, glyph, sheen]);

  useLayoutEffect(() => {
    if (!working) return;
    const paint = (ds: number) => {
      dsRef.current = ds;
      if (timerRef.current) timerRef.current.textContent = fmt(ds);
    };
    const startedAt = performance.now();
    paint(0);
    const id = setInterval(() => paint(Math.floor((performance.now() - startedAt) / 100)), 100);
    return () => clearInterval(id);
  }, [working]);

  // The timer glides from after the working label to after the settled one.
  useLayoutEffect(() => {
    const t = timerRef.current;
    const stack = stackRef.current;
    if (!t || !stack) return;
    const place = (glide: boolean) => {
      const active = working ? workRef.current : doneRef.current;
      if (!active) return;
      if (!glide) t.style.transition = "none";
      t.style.transform = `translateX(${active.offsetWidth - stack.offsetWidth}px)`;
      if (!glide) {
        void t.offsetWidth;
        t.style.transition = "";
      }
    };
    place(prevWorking.current !== working);
    prevWorking.current = working;
    const ro = new ResizeObserver(() => place(false));
    if (workRef.current) ro.observe(workRef.current);
    if (doneRef.current) ro.observe(doneRef.current);
    return () => ro.disconnect();
  }, [working, label, doneText, fontSize, showTimer]);

  useEffect(() => {
    if (working) {
      setAnnounce(label);
      return;
    }
    setAnnounce(showTimer ? `${doneText} ${spoken(dsRef.current)}` : doneText);
    settleRef.current?.(dsRef.current / 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working]);

  const toggle = hasTrace && collapsible;
  const head = (
    <>
      {glyph !== "none" ? (
        <span ref={glyphRef} className="thought-line__glyph" aria-hidden="true">
          {glyph === "sparkle" ? <Sparkles strokeWidth={2} /> : glyph === "dot" ? <span className="thought-line__dot" /> : glyph}
        </span>
      ) : null}
      <span ref={stackRef} className="thought-line__label" aria-hidden="true">
        <span ref={workRef} className="thought-line__text" data-active={working ? "" : undefined}>
          <span ref={breathRef} className="thought-line__breath" data-shimmer={sheen ? "" : undefined}>{label}</span>
        </span>
        <span ref={doneRef} className="thought-line__text thought-line__text--done" data-active={working ? undefined : ""}>{doneText}</span>
      </span>
      {showTimer ? (
        <span ref={timerRef} className="thought-line__timer" data-done={working ? undefined : ""} aria-hidden="true">0.0s</span>
      ) : null}
      {collapsible ? (
        <span className="thought-line__chevron" data-on={hasTrace ? "" : undefined} aria-hidden="true">
          <ChevronDown size="1em" strokeWidth={2.2} />
        </span>
      ) : null}
      <span className="thought-line__sr" role="status">{announce}</span>
    </>
  );

  return (
    <div
      className={`thought-line${className ? ` ${className}` : ""}`}
      data-working={working ? "" : undefined}
      data-open={open && hasTrace ? "" : undefined}
      style={{
        "--tl-font": `${fontSize}px`,
        "--tl-color": color,
        "--tl-glyph": glyphColor || color,
        "--tl-settle": `${settleDuration}ms`,
        "--tl-blur": `${settleBlur}px`,
        "--tl-shimmer": `${shimmerDuration}s`,
        ...style,
      } as React.CSSProperties}
    >
      {collapsible ? (
        <button type="button" className="thought-line__head" data-toggle={toggle ? "" : undefined} aria-expanded={toggle ? open : undefined}
          tabIndex={toggle ? 0 : -1} onClick={() => { if (toggle) setOpen((v) => !v); }}>
          {head}
        </button>
      ) : (
        <div className="thought-line__head">{head}</div>
      )}
      {hasTrace ? (
        <div className="thought-line__trace" data-open={open ? "" : undefined} aria-hidden={!open}>
          <div className="thought-line__fold">
            <div className="thought-line__steps">
              {steps.map((text, i) => {
                const done = !working || i < steps.length - 1;
                return (
                  <div key={`${i}-${text}`} className="thought-line__step" data-done={done ? "" : undefined}>
                    <span className="thought-line__mark" aria-hidden="true">
                      {done ? <Check size="1em" strokeWidth={2.5} /> : <i className="thought-line__pulse" />}
                    </span>
                    <span className="thought-line__step-text">{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
