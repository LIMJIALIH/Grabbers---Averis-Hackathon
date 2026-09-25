"use client";

/* BorderGlow from React Bits (reactbits.dev), ported to TypeScript. Styles are the .border-glow rules in globals.css,
   changed to follow the app theme: the card's fill and border come from tokens, and the light/dark blend switch
   keys off [data-theme="dark"] instead of reading `backgroundColor`. */
import { useCallback, useEffect, useRef, type ReactNode } from "react";

function parseHSL(hslStr: string) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor: string, intensity: number) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];
  const vars: Record<string, string> = {};
  for (let i = 0; i < opacities.length; i++) vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  return vars;
}

const GRADIENT_POSITIONS = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const GRADIENT_KEYS = ["--gradient-one", "--gradient-two", "--gradient-three", "--gradient-four", "--gradient-five", "--gradient-six", "--gradient-seven"];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors: string[]) {
  const vars: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars["--gradient-base"] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x: number) => x * x * x;

function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }: {
  start?: number; end?: number; duration?: number; delay?: number; ease?: (x: number) => number; onUpdate: (v: number) => void; onEnd?: () => void;
}) {
  const t0 = performance.now() + delay;
  function tick() {
    const t = Math.min((performance.now() - t0) / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else onEnd?.();
  }
  setTimeout(() => requestAnimationFrame(tick), delay);
}

export default function BorderGlow({
  children,
  className = "",
  edgeSensitivity = 30,
  glowColor = "40 80 80",
  backgroundColor = "var(--surface)",
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1.0,
  coneSpread = 25,
  animated = false,
  colors = ["#c084fc", "#f472b6", "#38bdf8"],
  fillOpacity = 0.5,
}: {
  children: ReactNode; className?: string; edgeSensitivity?: number; glowColor?: string; backgroundColor?: string;
  borderRadius?: number; glowRadius?: number; glowIntensity?: number; coneSpread?: number; animated?: boolean;
  colors?: string[]; fillOpacity?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    // Edge proximity: 0 at the centre, 1 on the edge, whichever of x/y is closer to its edge.
    const kx = dx !== 0 ? cx / Math.abs(dx) : Infinity;
    const ky = dy !== 0 ? cy / Math.abs(dy) : Infinity;
    const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    let angle = dx === 0 && dy === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    card.style.setProperty("--edge-proximity", `${(edge * 100).toFixed(3)}`);
    card.style.setProperty("--cursor-angle", `${angle.toFixed(3)}deg`);
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!animated || !card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const angleStart = 110;
    const angleEnd = 465;
    const setAngle = (v: number) => card.style.setProperty("--cursor-angle", `${(angleEnd - angleStart) * (v / 100) + angleStart}deg`);
    card.classList.add("sweep-active");
    card.style.setProperty("--cursor-angle", `${angleStart}deg`);
    animateValue({ duration: 500, onUpdate: (v) => card.style.setProperty("--edge-proximity", `${v}`) });
    animateValue({ ease: easeInCubic, duration: 1500, end: 50, onUpdate: setAngle });
    animateValue({ ease: easeOutCubic, delay: 1500, duration: 2250, start: 50, end: 100, onUpdate: setAngle });
    animateValue({
      ease: easeInCubic, delay: 2500, duration: 1500, start: 100, end: 0,
      onUpdate: (v) => card.style.setProperty("--edge-proximity", `${v}`),
      onEnd: () => card.classList.remove("sweep-active"),
    });
  }, [animated]);

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      className={`border-glow-card ${className}`}
      style={{
        "--card-bg": backgroundColor,
        "--edge-sensitivity": edgeSensitivity,
        "--border-radius": `${borderRadius}px`,
        "--glow-padding": `${glowRadius}px`,
        "--cone-spread": coneSpread,
        "--fill-opacity": fillOpacity,
        ...buildGlowVars(glowColor, glowIntensity),
        ...buildGradientVars(colors),
      } as React.CSSProperties}
    >
      <span className="edge-light" />
      <div className="border-glow-inner">{children}</div>
    </div>
  );
}
