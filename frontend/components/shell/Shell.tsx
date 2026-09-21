"use client";

import { ViewTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import {
  Bell, Check, ChevronDown, ChevronsLeft, ChevronsRight, History, Inbox, LayoutDashboard,
  LogOut, Mail, Menu as MenuIcon, Moon, RefreshCw, Search, Sun,
} from "lucide-react";
import { greetingName, useAccount, useCases } from "@/lib/app-state";
import { isOpen } from "@/lib/cases";
import { Avatar, Logo, StatusPill, relTime, useNow } from "@/components/ui";
import { SearchPalette } from "./SearchPalette";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/insights", label: "Insights", crumb: ["Work", "Insights"], Icon: LayoutDashboard },
  { href: "/", label: "Queue", crumb: ["Work", "Queue"], Icon: Inbox },
  { href: "/audit", label: "Audit", crumb: ["Work", "Audit"], Icon: History },
];
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
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const isAuthPage = path === "/login";

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("docuverify-sidebar") === "closed"); } catch {}
  }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    const d = drawerRef.current;
    if (d && drawer && !d.open) d.showModal();
    if (d && !drawer && d.open) d.close();
  }, [drawer]);
  // Route guard: no session → /login, with ?next preserved.
  useEffect(() => {
    if (ready && !account && !isAuthPage) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, account, isAuthPage, path, router]);
  // ⌘K / Ctrl+K, never inside an input.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault();
        setSearch(true);
      }
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);

  if (isAuthPage) return <>{children}</>;
  if (!ready || !account) return <div className="min-h-dvh" aria-busy />;

  const compact = collapsed && !narrow;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("docuverify-sidebar", next ? "closed" : "open"); } catch {}
  };
  const crumb = NAV.find((n) => active(path, n.href))?.crumb ?? ["Work", "Queue"];

  return (
    <div className="min-h-dvh" data-chrome>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">Skip to content</a>
      <div className="h-0.5 bg-[#e78823]" aria-hidden />{/* the sponsor signature: only full-width orange */}

      {!narrow && (
        <aside
          className="fixed bottom-0 left-0 top-0.5 z-30 flex flex-col border-r border-line bg-surface transition-[width] duration-180"
          style={{ width: compact ? 72 : 248 }}
        >
          <SidebarBody compact={compact} onToggle={toggle} />
        </aside>
      )}
      {narrow && (
        <dialog ref={drawerRef} className="modal drawer" onClose={() => setDrawer(false)} onClick={(e) => e.target === drawerRef.current && setDrawer(false)} aria-label="Navigation">
          <div className="flex h-full flex-col"><SidebarBody compact={false} /></div>
        </dialog>
      )}

      <div style={{ paddingLeft: narrow ? 0 : compact ? 72 : 248 }} className="transition-[padding] duration-180">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          {narrow && (
            <button className="icon-btn -ml-2" onClick={() => setDrawer(true)} aria-label="Open navigation"><MenuIcon size={20} /></button>
          )}
          <nav aria-label="Breadcrumb" className="min-w-0 text-[13px] text-ink-3">
            <ol className="flex items-center gap-1.5">
              <li className="hidden sm:block">{crumb[0]}</li>
              <li className="hidden sm:block" aria-hidden>›</li>
              <li aria-current="page" className="truncate font-medium text-ink">{crumb[1]}</li>
            </ol>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setSearch(true)}
              className="hidden h-10 w-56 items-center gap-2 rounded-full border border-line-strong bg-paper px-3.5 text-ink-3 transition-colors hover:border-ink-3 md:flex lg:w-72"
              aria-label="Search (Ctrl K)"
            >
              <Search size={15} aria-hidden /><span className="flex-1 text-left">Search emails, fields…</span>
              <kbd className="num rounded-md border border-line px-1.5 text-[11px]">Ctrl K</kbd>
            </button>
            <button className="icon-btn md:hidden" onClick={() => setSearch(true)} aria-label="Search"><Search size={18} /></button>
            <Bell_ />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>
        <main id="main" className="@container mx-auto w-full max-w-[1440px] px-4 pb-10 pt-6 sm:px-6">
          <ViewTransition key={path} enter="page-in" exit="page-out" default="none">{children}</ViewTransition>
        </main>
      </div>
      <SearchPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}

function SidebarBody({ compact, onToggle }: { compact: boolean; onToggle?: () => void }) {
  const path = usePathname();
  const { account } = useAccount();
  const { summary, syncedAt, offline, reload } = useCases();
  const now = useNow();
  const open = summary.open; // needs review + unresolved defects: the real queue depth
  const [spin, setSpin] = useState(false);
  return (
    <>
      <div className={cn("flex h-16 items-center border-b border-line", compact ? "justify-center" : "justify-between px-4")}>
        <Logo size={compact ? 20 : 24} stacked={compact} />
        {onToggle && !compact && (
          <button className="icon-btn -mr-2" onClick={onToggle} aria-label="Collapse sidebar"><ChevronsLeft size={18} /></button>
        )}
      </div>
      {/* Mailbox status strip: which inbox, and is it current? (§0.2) */}
      <div className={cn("border-b border-line p-3", compact && "grid justify-items-center")}>
        <div className={cn("flex items-center gap-3 rounded-[var(--radius-control)] bg-surface-2 p-2.5", compact && "size-11 justify-center p-0")}>
          <Mail size={18} className="shrink-0 text-burgundy" aria-hidden />
          {!compact && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium" title={account!.email}>{greetingName(account!)}</div>
                <div className="text-[12px] text-ink-3-on-2">
                  {offline ? "Not connected" : syncedAt ? `Synced ${relTime(syncedAt, now)}` : "Syncing…"}
                </div>
              </div>
              <button
                className="icon-btn size-8"
                aria-label="Sync now"
                onClick={() => { setSpin(true); reload(); setTimeout(() => setSpin(false), 900); }}
              >
                <RefreshCw size={15} className={spin ? "spin" : ""} />
              </button>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
        {!compact && <div className="label px-3 pb-2 pt-1">Main</div>}
        <ul className="grid gap-0.5">
          {NAV.map(({ href, label, Icon }) => {
            const on = active(path, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 font-medium transition-colors",
                    on ? "bg-burgundy-tint text-burgundy" : "text-ink-2 hover:bg-surface-2",
                    compact && "justify-center px-0",
                  )}
                >
                  {on && <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-burgundy" aria-hidden />}
                  <Icon size={18} aria-hidden />
                  <span className={compact ? "sr-only" : "flex-1 truncate"}>{label}</span>
                  {href === "/" && open > 0 && !compact && (
                    <span className="num pill h-5 bg-review-tint px-2 text-[11px] text-review-ink" aria-live="polite">
                      {open}<span className="sr-only"> open</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={cn("border-t border-line p-3", compact && "grid justify-items-center")}>
        {compact ? (
          <button className="icon-btn" onClick={onToggle} aria-label="Expand sidebar"><ChevronsRight size={18} /></button>
        ) : (
          <div className="flex items-center gap-3 px-1">
            <Avatar name={account!.name} picture={account!.picture} />
            <div className="min-w-0 text-[13px]">
              <div className="truncate font-medium">{account!.name}</div>
              <div className="text-[12px] text-ink-3">Operator</div>
            </div>
          </div>
        )}
      </div>
    </>
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
            <Menu.Item onClick={() => { void signOut(); router.push("/login"); }} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-surface-2">
              <LogOut size={15} aria-hidden /> Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
