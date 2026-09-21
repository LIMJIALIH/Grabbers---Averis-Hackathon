"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Select } from "@base-ui/react/select";
import { AlertTriangle, Check, ChevronDown, Circle, CircleDot, Diamond, Loader2, X } from "lucide-react";
import { CATEGORY_SHADE, HITL_THRESHOLD, categoryLabel, type Case, type Category } from "@/lib/cases";
import { cn } from "@/lib/utils";

/* Status = colour + shape + word (§2.6). Shapes: ● ▲ ◆ ○ ◌ */
const STATUS = {
  OK: { cls: "bg-ok-tint text-ok", Icon: CircleDot, word: "Verified" },
  MISMATCH: { cls: "bg-defect-tint text-defect", Icon: AlertTriangle, word: "Defect" },
  NEEDS_REVIEW: { cls: "bg-review-tint text-review-ink", Icon: Diamond, word: "Needs review" },
  SPAM: { cls: "bg-spam-tint text-spam", Icon: Circle, word: "Spam" },
  PROCESSING: { cls: "bg-spam-tint text-spam", Icon: Loader2, word: "Extracting…" },
} as const;

export function StatusPill({ c }: { c: Pick<Case, "status" | "category" | "defects"> }) {
  const key = c.category === "SPAM" ? "SPAM" : c.status;
  const s = STATUS[key as keyof typeof STATUS];
  // Non-BL emails are never compared, so "Verified" would overclaim.
  const word =
    key === "OK" && c.category !== "BL_COMPARISON" ? "Cleared"
    : key === "MISMATCH" ? `Defect · ${c.defects.length} ${c.defects.length === 1 ? "field" : "fields"}`
    : s.word;
  return (
    <span className={cn("pill", s.cls)}>
      <s.Icon size={12} aria-hidden className={key === "MISMATCH" ? "fill-current" : ""} />
      {word}
    </span>
  );
}

export function CategoryPill({ category }: { category: Category }) {
  return (
    <span className="pill border" style={{ borderColor: "var(--line-strong)", color: "var(--ink)" }}>
      <i className="size-2 rounded-full" style={{ background: CATEGORY_SHADE[category] }} />
      {categoryLabel(category)}
    </span>
  );
}

/** Number + bar; below the HITL threshold picks up the orange treatment (§6). */
export function FieldScore({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-3">—</span>;
  const low = value < HITL_THRESHOLD;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("num w-7 text-right text-[13px]", low && "font-semibold text-review-ink")}>{value}</span>
      <span className="relative h-1.5 w-12 rounded-full bg-surface-2" aria-hidden title={`Human-review gate: ${HITL_THRESHOLD}`}>
        <span className="block h-full rounded-full" style={{ width: `${value}%`, background: low ? "var(--review)" : "var(--ink-3)" }} />
        <i className="absolute -top-0.5 h-2.5 w-px bg-ink" style={{ left: `${HITL_THRESHOLD}%` }} />
      </span>
    </span>
  );
}

/** Honesty label: says on the card when a number is not model output (rule 3). */
export const DemoChip = ({ text = "Demo data", title = "Illustrative: emails carry no received time yet" }: { text?: string; title?: string }) => (
  <span className="pill h-5 bg-surface-2 px-2 text-[11px] text-ink-3-on-2" title={title}>
    {text}
  </span>
);

/** SI / BL defined on hover, wherever the acronym appears. */
export const Abbr = ({ t }: { t: "SI" | "BL" }) => (
  <abbr title={t === "SI" ? "Shipping Instruction" : "Bill of Lading"} className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline">{t}</abbr>
);

/** The one document viewer: attachment text, or why there is none. */
export function DocumentText({ a, className = "max-h-[420px]" }: { a?: { text: string | null; url: string | null }; className?: string }) {
  return (
    <pre className={cn("num overflow-auto whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface-2 p-4 text-[12px] leading-[18px] [overflow-wrap:anywhere]", className)}>
      {a?.text ?? (a?.url ? "No text could be read from this file." : "This attachment is missing.")}
    </pre>
  );
}
export const hasFile = (a?: { url: string | null }) => !!a?.url;

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} aria-hidden />;

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-ink-2">{hint}</p>}
      {action}
    </div>
  );
}

/** Elapsed counter so a long first load visibly ticks instead of looking frozen. */
export function Loading({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setS((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="grid gap-5" aria-busy>
      <p role="status" className="text-ink-2">
        Reading the mailbox and extracting every attachment. The first load can take up to 20 seconds. <span className="num text-ink-3-on-2">{s}s</span>
      </p>
      {children}
    </div>
  );
}

export const OfflineNote = ({ onRetry }: { onRetry: () => void }) => (
  <ErrorNote message="Couldn’t reach the mailbox service, so there is nothing to show." onRetry={onRetry} />
);

export function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-[var(--radius-control)] border border-line-strong bg-surface p-4">
      <p className="text-ink-2">{message}</p>
      <button className="btn btn-sm" onClick={onRetry}>Retry</button>
    </div>
  );
}

/** Native <dialog>: ESC, backdrop click, focus trap and focus-return come from the platform (§8). */
export function Modal({
  open, onClose, title, children, wide, className,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open, mounted]);
  if (!mounted) return null;
  // Portalled to <body>: the print stylesheet hides the app chrome, and a dialog inside it would vanish too.
  return createPortal(
    <dialog
      ref={ref}
      className={cn("modal", className)}
      style={wide ? { maxWidth: "min(880px, calc(100vw - 32px))" } : undefined}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      {open && (
        <div>
          <div className="flex items-center justify-between px-6 pt-5">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
            <button className="icon-btn -mr-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="px-6 pb-6 pt-3">{children}</div>
        </div>
      )}
    </dialog>,
    document.body,
  );
}

/** Counts up once, on first mount only (§6). Re-renders and account switches never replay it. */
/** How long a figure waits, once it is on screen, before it appears and counts up. Charts use the same beat. */
export const COUNT_DELAY = 1000;

/** Hidden until COUNT_DELAY after it scrolls into view, then counts up. Later changes to `to` (a new period, say) count straight away. */
export function CountUp({ to, suffix = "", ms = 900, delay = 0 }: { to: number; suffix?: string; ms?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  const [live, setLive] = useState(false);
  const [v, setV] = useState(0);
  const from = useRef(0);
  const played = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    const run = () => {
      played.current = true;
      setLive(true);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { from.current = to; setV(to); return; }
      const start = from.current;
      const t0 = performance.now();
      raf = requestAnimationFrame(function step(t) {
        const p = Math.min(Math.max((t - t0) / ms, 0), 1);
        from.current = Math.round(start + (to - start) * (1 - (1 - p) ** 3));
        setV(from.current);
        if (p < 1) raf = requestAnimationFrame(step);
      });
    };
    const timer = setTimeout(run, played.current ? 0 : COUNT_DELAY + delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [seen, to, ms, delay]);
  return <span ref={ref} className={cn("num transition-opacity duration-300", !live && "opacity-0")}>{v.toLocaleString()}{suffix}</span>;
}

export function Avatar({ name, picture }: { name: string; picture: string | null }) {
  const [bad, setBad] = useState(false);
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return picture && !bad ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={picture} alt="" className="size-8 rounded-full" onError={() => setBad(true)} />
  ) : (
    <span className="grid size-8 place-items-center rounded-full bg-burgundy-tint text-[12px] font-semibold text-burgundy" aria-hidden>
      {initials}
    </span>
  );
}

export function relTime(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
/** 60s tick so "Synced 2m ago" never freezes for the whole demo. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

export function Logo({ size = 24, stacked = false }: { size?: number; stacked?: boolean }) {
  return (
    <span className={cn("inline-flex items-center", stacked ? "flex-col gap-0.5" : "gap-2")} aria-label="DocuVerify">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--burgundy)" />
        <path d="M12.5 16.5l2.5 2.5 5-5.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn("font-semibold tracking-[-0.01em]", stacked ? "text-[10px] leading-3" : "text-[14px]")}>DocuVerify</span>
    </span>
  );
}

/* Themed replacement for <select>: the native popup ignores the theme. The first option is the "all" state ("" value). */
export function Dropdown({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v ?? "")} items={options}>
      <Select.Trigger aria-label={label}
        className={cn("field flex min-w-[9.5rem] cursor-pointer items-center justify-between gap-3 text-left outline-none transition-colors hover:border-ink-3 focus-visible:border-[#e78823] focus-visible:ring-2 focus-visible:ring-[#e78823]/40 data-[popup-open]:border-ink-3",
          value && "border-ink font-medium")}>
        <Select.Value />
        <Select.Icon className="text-ink-3 transition-transform duration-150 data-[popup-open]:rotate-180"><ChevronDown size={16} aria-hidden /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="pop max-h-[min(320px,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] outline-none">
            <Select.List>
              {options.map((o) => (
                <Select.Item key={o.value} value={o.value}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-lg pl-3 pr-2 text-[14px] outline-none data-[highlighted]:bg-surface-2 data-[selected]:font-medium">
                  <Select.ItemText className="flex-1 whitespace-nowrap">{o.label}</Select.ItemText>
                  <Select.ItemIndicator className="text-ink"><Check size={15} aria-hidden /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
