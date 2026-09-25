"use client";

import { ViewTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Menu } from "@base-ui/react/menu";
import {
  Bell, Check, ChevronDown, History, Inbox, LayoutDashboard,
  LogIn, LogOut, Mail, Menu as MenuIcon, Moon, RefreshCw, Search, Sun,
} from "lucide-react";
import { greetingName, useAccount, useCases } from "@/lib/app-state";
import { isOpen } from "@/lib/cases";
import { Avatar, LogoMark, StatusPill, relTime, useNow } from "@/components/ui";
import { SearchPalette } from "./SearchPalette";
import BorderGlow from "@/components/BorderGlow";
import { AuthIntro } from "./AuthIntro";
import { Toaster } from "./Toaster";
import { animate, useReducedMotion } from "motion/react";
import { spring } from "@/components/JellyRadio";import { cn } from "@/lib/utils";

// Insights first: sign-in lands there (what is waiting), then the Queue to work it, then Audit to prove it.
const NAV = [
  { href: "/insights", label: "Insights", title: "Insights", Icon: LayoutDashboard },
  { href: "/", label: "Queue", title: "Verification queue", Icon: Inbox },
  { href: "/audit", label: "Audit", title: "Audit trail", Icon: History },
];
const RAIL = (compact: boolean) => (compact ? 68 : 224);
const active = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/case") : path.startsWith(href));

function useMedia(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { account, ready } = useAccount();
  const narrow = useMedia("(max-width: 900px)");
  const [collapsed, setCollapsed] = useState(true); // design 1 (icon rail) by default; the toggle opens design 2
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const isAuthPage = path === "/login";
  // /v2 and /v3 are alternative UIs with their own chrome and their own route guard (public landing pages included).
  const ownChrome = ["/v2", "/v3"].some((p) => path === p || path.startsWith(`${p}/`));

  // Opened via the logo; closes itself after 10s.
  useEffect(() => {
    if (collapsed) return;
    const t = setTimeout(() => setCollapsed(true), 10_000);
    return () => clearTimeout(t);
  }, [collapsed]);
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    const d = drawerRef.current;
    if (d && drawer && !d.open) d.showModal();
    if (d && !drawer && d.open) d.close();
  }, [drawer]);
  // Route guard: no session → /login, with ?next preserved.
  useEffect(() => {
    if (ready && !account && !isAuthPage && !ownChrome) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, account, isAuthPage, ownChrome, path, router]);
  // `/` (Ctrl K still works), never inside an input.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const hit = (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k");
      if (hit && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setSearch(true);
      }
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);

  if (isAuthPage || ownChrome) return <>{children}</>;
  if (!ready || !account) return <div className="min-h-dvh" aria-busy />;

  const compact = collapsed && !narrow;
  const toggle = () => setCollapsed((c) => !c);
  const title = NAV.find((n) => active(path, n.href))?.title ?? "Verification queue";

  return (
    <div className={cn("min-h-dvh", !narrow && "h-dvh overflow-hidden bg-[var(--rail)]")} data-chrome>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">Skip to content</a>
      <div className="h-0.5 bg-[#e78823]" aria-hidden />{/* the sponsor signature: only full-width orange */}

      {!narrow && (
        <aside
          className="fixed bottom-3 left-3 top-3.5 z-30 flex flex-col rounded-[24px] border border-[var(--rail-line)] bg-[var(--rail)] text-[var(--rail-ink)] transition-[width] duration-180"
          style={{ width: RAIL(compact) }}
        >
          <SidebarBody compact={compact} onToggle={toggle} />
        </aside>
      )}
      {narrow && (
        <dialog ref={drawerRef} className="modal drawer" onClose={() => setDrawer(false)} onClick={(e) => e.target === drawerRef.current && setDrawer(false)} aria-label="Navigation">
          <div className="flex h-full flex-col bg-[var(--rail)] text-[var(--rail-ink)]"><SidebarBody compact={false} /></div>
        </dialog>
      )}

      {/* Desktop: the page is a rounded panel on the dark frame, flush against the rail, so the expanded
          rail's active tab runs straight into it. The panel is the scroll container. */}
      <div
        // Collapsed rail: 8px gap to the page. Expanded: flush, so the active tab can join the page.
        style={{ marginLeft: narrow ? 0 : 12 + RAIL(compact) + (compact ? 8 : 0) }}
        className={cn(!narrow && "mb-3 mr-3 mt-3 h-[calc(100dvh-26px)] overflow-y-auto rounded-[24px] border border-[var(--rail-line)] bg-paper transition-[margin] duration-180")}
      >
        {/* No bar: the page title and the tools share one row, on the page's own background and width. */}
        <header className="sticky top-0 z-20 bg-paper">
          <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6">
            {narrow && (
              <button className="icon-btn -ml-2" onClick={() => setDrawer(true)} aria-label="Open navigation"><MenuIcon size={20} /></button>
            )}
            <h1 className="min-w-0 truncate text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">{title}</h1>
            <div className="ml-auto flex items-center gap-1.5">
              {/* Glow on the edge nearest the pointer, in the logo's orange-to-plum. The wrapper owns the size and the
                  mobile hide, since the glow card sets its own display. */}
              <div className="hidden w-48 md:block lg:w-[17.33rem]">
                <BorderGlow backgroundColor="var(--search-bg)" borderRadius={8} glowRadius={16} edgeSensitivity={20} coneSpread={25}
                  glowColor="28 85 60" colors={["#f07a1f", "#c2452a", "#7a1848"]}>
                  <button
                    onClick={() => setSearch(true)}
                    className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[14px] text-ink-3"
                    aria-label="Search (press /)"
                    aria-keyshortcuts="/ Control+K"
                  >
                    <Search size={16} aria-hidden /><span className="flex-1 truncate text-left">Search BL no., booking, vessel, port</span>
                    <kbd className="grid h-6 min-w-6 place-items-center rounded-md border border-line-strong bg-surface px-1.5 text-[12px] text-ink">/</kbd>
                  </button>
                </BorderGlow>
              </div>
              <button className="icon-btn md:hidden" onClick={() => setSearch(true)} aria-label="Search"><Search size={18} /></button>
              {/* Queue and Audit put their own actions here instead (see HeaderActions); every other page keeps these. */}
              {PAGE_ACTIONS.includes(path) ? <div id={HEADER_ACTIONS} className="flex items-center gap-2" /> : <><Bell_ /><ThemeToggle /><AccountMenu /></>}
            </div>
          </div>
        </header>
        <main id="main" className="@container mx-auto w-full max-w-[1440px] px-4 pb-10 pt-2 sm:px-6">
          <ViewTransition key={path} enter="page-in" exit="page-out" default="none">{children}</ViewTransition>
        </main>
      </div>
      <SearchPalette open={search} onClose={() => setSearch(false)} />
      <AuthIntro name={greetingName(account)} />
      <Toaster />
    </div>
  );
}

const HEADER_ACTIONS = "header-actions";
const PAGE_ACTIONS = ["/", "/audit"];

/** Renders a page's own buttons into the header, where the bell, theme toggle and account menu sit on other pages. */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(HEADER_ACTIONS)), []);
  return slot ? createPortal(children, slot) : null;
}

/** Burgundy rail. Compact = icons only; expanded = pills, and the active pill becomes a tab joined to the page (`.rail-tab`). */
function SidebarBody({ compact, onToggle }: { compact: boolean; onToggle?: () => void }) {
  const path = usePathname();
  const { account } = useAccount();
  const { summary, syncedAt, offline, reload } = useCases();
  const now = useNow();
  const open = summary.open; // needs review + unresolved defects: the real queue depth
  const [spin, setSpin] = useState(false);
  const joined = !compact && !!onToggle; // the tab only joins the page on the desktop rail, not in the drawer
  const sync = () => { setSpin(true); reload(); setTimeout(() => setSpin(false), 900); };
  const status = offline ? "Not connected" : syncedAt ? `Synced ${relTime(syncedAt, now)}` : "Syncing…";
  const ring = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--rail-focus)]";
  return (
    <>
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5", compact ? "justify-center" : "px-4")}>
        {onToggle ? (
          // Desktop rail: the logo opens/closes the sidebar (it auto-closes after 10s, see Shell).
          <button className={cn("shrink-0 rounded-xl", ring)} onClick={onToggle} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!compact}>
            <LogoMark />
          </button>
        ) : (
          <LogoMark className="shrink-0" />
        )}
        {!compact && <span className="text-[15px] font-semibold tracking-[-0.01em]">DocuVerify</span>}
        <span className="sr-only">DocuVerify</span>
      </div>
      {/* Mailbox status: which inbox, and is it current? (§0.2) */}
      {!compact && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--rail-fill)] p-2.5">
            <Mail size={17} className="shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium" title={account!.email}>{greetingName(account!)}</div>
              <div className="text-[12px] text-[var(--rail-ink-2)]">{status}</div>
            </div>
            <button className={cn("grid size-8 place-items-center rounded-full hover:bg-[var(--rail-hover)]", ring)} aria-label="Sync now" onClick={sync}>
              <RefreshCw size={15} className={spin ? "spin" : ""} />
            </button>
          </div>
        </div>
      )}
      <nav aria-label="Main" className="flex-1 p-3">{/* no overflow clip: the active tab reaches past the rail's outline */}
        <ul className="grid gap-2">
          {NAV.map(({ href, label, Icon }) => (
            <NavItem key={href} href={href} label={label} on={active(path, href)} compact={compact} joined={joined} ring={ring} onClick={onToggle}>
              <Icon size={18} aria-hidden />
              <span className={compact ? "sr-only" : "flex-1 truncate"}>{label}</span>
              {href === "/" && open > 0 && !compact && (
                <span className="num pill h-5 bg-review-tint px-2 text-[11px] text-review-ink" aria-live="polite">
                  {open}<span className="sr-only"> open</span>
                </span>
              )}
            </NavItem>
          ))}
        </ul>
      </nav>
      <div className={cn("flex items-center gap-3 p-3", compact ? "justify-center" : "px-4")} title={compact ? account!.name : undefined}>
        <Avatar name={account!.name} picture={account!.picture} />
        {!compact && (
          <div className="min-w-0 text-[13px]">
            <div className="truncate font-medium">{account!.name}</div>
            <div className="text-[12px] text-[var(--rail-ink-2)]">Operator</div>
          </div>
        )}
      </div>
    </>
  );
}

/** A sidebar link with JellyRadio's spring: on becoming active it lands wide-then-tall and wobbles to rest.
    Collapsed, the whole circle wobbles; expanded, only its contents do, so the joined tab's seam never moves. */
function NavItem({ href, label, on, compact, joined, ring, onClick, children }: {
  href: string; label: string; on: boolean; compact: boolean; joined: boolean; ring: string; onClick?: () => void; children: React.ReactNode;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const was = useRef(on);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = compact ? linkRef.current : innerRef.current;
    if (on && !was.current && el && !reduce) {      animate(el, { scaleX: [1.16, 1], scaleY: [0.86, 1] }, {
        scaleX: spring(700, 0.8, 0.55),
        scaleY: { ...spring(480, 0.95, 0.35), delay: 0.05 },
      });
    }
    was.current = on;
  }, [on, compact, reduce]);
  return (
    <li className={compact ? "grid justify-items-center" : undefined}>
      <Link
        ref={linkRef}
        href={href}
        onClick={onClick /* desktop rail: like the logo, opens a collapsed sidebar and closes an open one */}
        aria-current={on ? "page" : undefined}
        title={compact ? label : undefined}
        className={cn(
          "relative flex h-10 items-center rounded-full font-medium transition-colors", ring,
          compact ? "size-10 justify-center" : "px-3.5",
          on ? "bg-white text-burgundy" : cn("text-[var(--rail-nav)] hover:bg-[var(--rail-hover)] hover:text-[var(--rail-ink)]", !compact && "bg-[var(--rail-fill)]"),
          on && joined && "rail-tab -mr-[14px] rounded-r-none bg-paper",
        )}
      >
        <span ref={innerRef} className="flex min-w-0 flex-1 items-center justify-center gap-3">{children}</span>
      </Link>
    </li>
  );
}

function Bell_() {
  const { cases, resolutions, summary } = useCases();
  const router = useRouter();
  const top = cases.filter((c) => isOpen(c, resolutions)).sort((a, b) => (a.status === "NEEDS_REVIEW" ? 0 : 1) - (b.status === "NEEDS_REVIEW" ? 0 : 1)).slice(0, 3);
  return (
    <Menu.Root>
      <Menu.Trigger className="icon-btn relative" aria-label={`Notifications, ${summary.open} open`}>
        <Bell size={18} />
        {top.length > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-review ring-2 ring-surface" aria-hidden />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50">
          <Menu.Popup className="pop w-80 rounded-[var(--radius-card)] border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] outline-none">
            <div className="label px-3 py-2">Open</div>
            {top.length === 0 && <p className="px-3 pb-3 text-ink-2">Nothing is open right now.</p>}
            {top.map((c) => (
              <Menu.Item key={c.id} onClick={() => router.push(`/case/${c.id}`)} className="cursor-pointer rounded-lg px-3 py-2 data-[highlighted]:bg-surface-2 outline-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-[12px] text-ink-3">{c.id}</span>
                  <StatusPill c={c} />
                </div>
                <div className="mt-1 truncate text-[13px]">{c.subject}</div>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  return (
    <button
      className="icon-btn"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("docuverify-theme", next); } catch {}
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function AccountMenu() {
  const { account, signOut } = useAccount();
  const router = useRouter();
  if (!account) return null;
  return (
    <Menu.Root>
      <Menu.Trigger className="flex h-10 items-center gap-2 rounded-full border border-line-strong py-1 pl-1 pr-2.5 hover:bg-surface-2" aria-label="Account">
        <Avatar name={account.name} picture={account.picture} />
        <span className="hidden max-w-32 truncate text-[13px] font-medium lg:block">{greetingName(account)}</span>
        <ChevronDown size={14} className="text-ink-3" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50">
          <Menu.Popup className="pop w-72 rounded-[var(--radius-card)] border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] outline-none">
            <div className="label px-3 py-2">Signed in account</div>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <Avatar name={account.name} picture={account.picture} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{greetingName(account)}</div>
                <div className="break-all text-[12px] leading-4 text-ink-3">{account.email}</div>
              </div>
              <Check size={16} className="text-ok" aria-label="Active" />
            </div>
            <Menu.Separator className="my-1 h-px bg-line" />
            {/* Opens the login page without signing out; ?view stops it bouncing a signed-in user straight back. */}
            <Menu.Item onClick={() => router.push("/login?view")} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2">
              <LogIn size={15} aria-hidden /> Back to login page
            </Menu.Item>
            <Menu.Item onClick={() => { void signOut(); router.push("/login"); }} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2">
              <LogOut size={15} aria-hidden /> Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
