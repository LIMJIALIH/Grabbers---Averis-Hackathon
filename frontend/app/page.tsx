"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileSearch,
  FileText,
  Flag,
  GitBranch,
  Inbox,
  Layers3,
  LayoutDashboard,
  Mail,
  Menu,
  Moon,
  Sun,
  PanelLeftClose,
  Plus,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Ship,
  Upload,
  X,
} from "lucide-react";

type Field = {
  key: string;
  label: string;
  si: string;
  bl: string;
  confidence: number;
};
type Case = {
  id: string;
  vessel: string;
  company: string;
  time: string;
  kind: string;
  fields: Field[];
  body: string;
  attachments: { name: string; url: string | null; text: string | null }[];
  state: "review" | "approved" | "escalated";
};
const fieldKeys = ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"];
const QUEUE_PAGE_SIZE = 10;
const stages = [
  { title: "Classify", sub: "Email intent", icon: Mail },
  { title: "Ingest", sub: "Text · DOCX · PDF", icon: Layers3 },
  { title: "Extract", sub: "7 required fields", icon: ScanLine },
  { title: "Compare", sub: "Normalize & match", icon: GitBranch },
  { title: "Human review", sub: "You are here", icon: ShieldCheck },
];
const matches = (f: Field) =>
  f.si.trim().toLowerCase() === f.bl.trim().toLowerCase() ||
  (f.key === "port_of_loading" &&
    f.si === "MYTPP" &&
    f.bl.trim().toLowerCase() === "tanjung pelepas");
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}

export default function Page() {
  const [cases, setCases] = useState<Case[]>([]);
  const [activeId, setActiveId] = useState("");
  const [view, setView] = useState("Overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All cases");
  const [queuePage, setQueuePage] = useState(1);
  const queueList = useRef<HTMLDivElement>(null);
  const [attachmentIndex, setAttachmentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const navigationToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const resize = () => {
      setIsMobile(media.matches);
      setMobileNav(false);
    };
    resize();
    media.addEventListener("change", resize);
    try {
      setSidebarCollapsed(
        localStorage.getItem("docuverify-sidebar") === "closed",
      );
      const saved = localStorage.getItem("docuverify-theme");
      const resolved =
        saved === "dark" || saved === "light"
          ? saved
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      setTheme(resolved);
      document.documentElement.dataset.theme = resolved;
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        navigationToggle.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [mobileNav]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    fetch("/api/v1/cases", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load sample emails. Check the backend and resources folder.");
        return response.json() as Promise<Case[]>;
      })
      .then((items) => { setCases(items); setActiveId(items[0]?.id ?? ""); })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#171d19" : "#f5f6f2");
    try {
      localStorage.setItem("docuverify-theme", next);
    } catch {}
  }
  function toggleSidebar() {
    if (isMobile) {
      setMobileNav((open) => !open);
      return;
    }
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("docuverify-sidebar", next ? "closed" : "open");
    } catch {}
  }
  const [audit, setAudit] = useState<{ time: string; text: string }[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const active = cases.find((c) => c.id === activeId);
  const attachment = active?.attachments[attachmentIndex];
  const unresolved = active?.fields.filter(
    (f) => !matches(f) || f.confidence < 85,
  ).length ?? 0;
  const filtered = cases.filter(
    (c) =>
      `${c.id} ${c.vessel} ${c.company}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All cases" ||
        (filter === "Needs review"
          ? c.state === "review"
          : c.state === "approved")),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / QUEUE_PAGE_SIZE));
  const currentPage = Math.min(queuePage, pageCount);
  const pageStart = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const paginatedCases = filtered.slice(pageStart, pageStart + QUEUE_PAGE_SIZE);
  useEffect(() => {
    setQueuePage(1);
  }, [search, filter]);
  useEffect(() => {
    setQueuePage((page) => Math.min(page, pageCount));
  }, [pageCount]);
  useEffect(() => {
    queueList.current?.scrollTo({ top: 0 });
  }, [currentPage, search, filter]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function log(text: string) {
    setAudit((a) => [
      {
        time: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        text,
      },
      ...a,
    ]);
  }
  function exportReport() {
    if (!active) return;
    const data = {
      demo: true,
      email_id: `EML-${active.id}`,
      state: active.state,
      fields: Object.fromEntries(
        active.fields.map((f) => [
          f.key,
          {
            si: ["container_count", "gross_weight_kg"].includes(f.key)
              ? Number(f.si)
              : f.si,
            bl: ["container_count", "gross_weight_kg"].includes(f.key)
              ? Number(f.bl)
              : f.bl,
            confidence: f.confidence / 100,
            result: matches(f)
              ? "No mismatch detected"
              : `SI: ${f.si} / BL: ${f.bl}`,
          },
        ]),
      ),
      audit,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `docuverify-${activeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("JSON discrepancy report downloaded.");
  }
  function choose(id: string) {
    setActiveId(id);
    setAttachmentIndex(0);
    setView("Overview");
  }
  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => {
            setMobileNav(false);
            navigationToggle.current?.focus();
          }}
        />
      )}
      <aside
        id="workspace-sidebar"
        className={`sidebar ${mobileNav ? "mobile-open" : ""}`}
      >
        <a href="/" className="brand">
          <span className="brand-symbol">
            <Ship size={23} />
          </span>
          <span>
            DocuVerify<span className="brand-dot">.</span>
            <small>SHIPPING INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">A</span>
          <div>
            Averis workspace<small>Operations team</small>
          </div>
          <Badge tone="dark">PRO</Badge>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { label: "Overview", icon: LayoutDashboard },
            { label: "Verification inbox", icon: Inbox },
            { label: "Documents", icon: FileText },
            { label: "Audit trail", icon: Clock3 },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${view === label ? "active" : ""}`}
              onClick={() => {
                setView(label);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "Verification inbox" && (
                <b>{cases.filter((c) => c.state === "review").length}</b>
              )}
            </button>
          ))}
          <Link href="/verification" className="nav-item">
            <ShieldCheck size={18} />
            <span>Verification workspace</span>
          </Link>
        </nav>
        <div className="nav-label tools-label">CONFIGURATION</div>
        <button
          className="nav-item"
          onClick={() => setModal("Pipeline settings")}
        >
          <GitBranch size={18} />
          <span>Pipeline settings</span>
        </button>
        <button className="nav-item" onClick={() => setModal("Integrations")}>
          <Layers3 size={18} />
          <span>Integrations</span>
          <span className="tiny-dot" />
        </button>
        <div className="sidebar-bottom">
          <div className="trust-card">
            <div className="trust-orbit">
              <ShieldCheck size={23} />
            </div>
            <strong>
              A second pair of eyes.
              <br />
              For every shipment.
            </strong>
            <p>AI precision. Human confidence.</p>
            <button onClick={() => setModal("How it works")}>
              Explore the pipeline <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="nav-item"
            onClick={() => setModal("Help & resources")}
          >
            <CircleHelp size={18} />
            Help & resources
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">JR</span>
            <div>
              Jamie Roberts<small>Operations specialist</small>
            </div>
            <button
              className="icon-button"
              aria-label="Operator settings"
              onClick={() => setModal("Operator settings")}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={navigationToggle}
              className="icon-button sidebar-toggle"
              aria-label="Toggle navigation"
              title={
                (isMobile ? mobileNav : !sidebarCollapsed)
                  ? "Close sidebar"
                  : "Open sidebar"
              }
              aria-controls="workspace-sidebar"
              aria-expanded={isMobile ? mobileNav : !sidebarCollapsed}
              onClick={toggleSidebar}
            >
              {(isMobile ? mobileNav : !sidebarCollapsed) ? (
                <PanelLeftClose size={20} />
              ) : (
                <Menu size={20} />
              )}
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
              title={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
            </button>
            <span className="demo-status">
              <i />
              Interactive demo
            </span>
            <span className="top-divider" />
            <button
              className="icon-button notification"
              aria-label="View notifications"
              onClick={() => setModal("Notifications")}
            >
              <Bell size={18} />
              <i />
            </button>
            <span className="avatar small">JR</span>
          </div>
        </header>
        <main id="main" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <i /> YOUR OPERATIONS, IN CLEAR VIEW
              </div>
              <h1>
                {view === "Overview"
                  ? "Clear documents. Confident shipments."
                  : view}
              </h1>
              <p>
                From inbox to approval. Every detail checked, every decision
                traceable.
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setFiles([]);
                setModal("Upload documents");
              }}
            >
              <Plus size={17} />
              New verification
            </button>
          </div>
          <section className="metrics" aria-label="Demo workspace statistics">
            {[
              {
                label: "Documents in queue",
                value: cases.length,
                icon: FileText,
                note: "Sample emails",
              },
              {
                label: "Needs your attention",
                value: cases.filter((c) => c.state === "review").length,
                icon: FileSearch,
                note: "Ready for human review",
              },
              {
                label: "Approved this session",
                value: cases.filter((c) => c.state === "approved").length,
                icon: FileCheck2,
                note: "Verified by your team",
              },
              {
                label: "Fields per verification",
                value: 7,
                icon: ScanLine,
                note: "One consistent standard",
              },
            ].map(({ label, value, icon: Icon, note }, i) => (
              <div
                key={label}
                className={`metric ${i === 1 ? "attention" : ""}`}
              >
                <div className="metric-top">
                  <span>{label}</span>
                  <Icon size={17} />
                </div>
                <div className="metric-value">
                  {String(value).padStart(2, "0")}
                  <svg viewBox="0 0 110 32" aria-hidden="true">
                    <path d="M1 29 L14 24 L24 26 L35 17 L46 20 L56 9 L68 13 L80 5 L91 8 L108 1" />
                  </svg>
                </div>
                <div className="metric-note">
                  <i />
                  {note}
                </div>
              </div>
            ))}
          </section>
          <section className="pipeline" aria-label="Verification pipeline">
            <div className="pipeline-label">
              <span className="pipeline-icon">
                <Activity size={18} />
              </span>
              <div>
                <strong>Your verification pipeline</strong>
                <small>From unstructured to understood</small>
              </div>
            </div>
            <div className="pipeline-stages">
              {stages.map(({ title, sub, icon: Icon }, i) => (
                <button
                  onClick={() => setModal(title)}
                  key={title}
                  className={`pipeline-step ${i === 4 ? "current" : ""}`}
                >
                  <span className="step-node">
                    {i < 4 ? <Check size={13} /> : <Icon size={15} />}
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{sub}</small>
                  </span>
                  {i < 4 && <ChevronRight className="step-arrow" size={14} />}
                </button>
              ))}
            </div>
          </section>
          {view === "Audit trail" ? (
            <section className="panel secondary-panel">
              <div className="section-heading">
                <h2>Every decision, documented.</h2>
                <Badge>Session activity</Badge>
              </div>
              {audit.map((item, i) => (
                <div className="audit-row" key={i}>
                  <Clock3 size={16} />
                  <time>{item.time}</time>
                  <span>{item.text}</span>
                </div>
              ))}
            </section>
          ) : view === "Documents" ? (
            <section className="panel secondary-panel">
              <div className="section-heading">
                <h2>Document library</h2>
                <Badge>Demo documents</Badge>
              </div>
              <p className="muted">
                Explore the sample source documents associated with each
                verification.
              </p>
              <div className="document-library">
                {cases.map((c) => (
                  <button key={c.id} onClick={() => choose(c.id)}>
                    <span className="file-icon">
                      <FileText />
                    </span>
                    <strong>{c.vessel}</strong>
                    <span>
                      {c.attachments.map((file) => file.name).join(" · ") || "No attachments"}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              <div className="workbench-heading">
                <div>
                  <h2>
                    Verification workspace{" "}
                    <span className="live-pill">HUMAN IN THE LOOP</span>
                  </h2>
                  <p>A little human judgment goes a long way.</p>
                </div>
                <button className="text-button" onClick={exportReport}>
                  <ArrowDownToLine size={15} />
                  Export report
                </button>
              </div>
              <section className="workbench">
                <aside className="queue" aria-label="Verification queue">
                  <div className="queue-title">
                    <h3>
                      Review queue <span>{filtered.length}</span>
                    </h3>
                    <button
                      className="icon-button"
                      aria-label="Reset queue filters"
                      onClick={() => {
                        setSearch("");
                        setFilter("All cases");
                      }}
                    >
                      <Settings2 size={16} />
                    </button>
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      aria-label="Search cases"
                      placeholder="Search subject, sender or ID…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="queue-filter">
                    <select
                      aria-label="Filter cases"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option>All cases</option>
                      <option>Needs review</option>
                      <option>Approved</option>
                    </select>
                    <span>SAMPLE INBOX</span>
                  </div>
                  <div className="queue-list" ref={queueList}>
                    {paginatedCases.map((c) => (
                      <button
                        className={`queue-item ${activeId === c.id ? "selected" : ""}`}
                        aria-pressed={activeId === c.id}
                        key={c.id}
                        onClick={() => choose(c.id)}
                      >
                        <div className="queue-item-meta">
                          <span>{c.id}</span>
                          <time>{c.time}</time>
                        </div>
                        <strong>{c.vessel}</strong>
                        <p>{c.company}</p>
                        <div className="queue-item-bottom">
                          <Badge
                            tone={
                              c.state === "approved"
                                ? "green"
                                : c.state === "escalated"
                                  ? "neutral"
                                  : c.kind === "Discrepancy"
                                    ? "orange"
                                    : c.kind === "Low confidence"
                                      ? "yellow"
                                      : "neutral"
                            }
                          >
                            {c.state === "review"
                              ? c.kind
                              : c.state === "approved"
                                ? "Approved locally"
                                : "Escalated locally"}
                          </Badge>
                          <span>
                            <FileText size={11} />{c.attachments.length}
                          </span>
                        </div>
                      </button>
                    ))}
                    {!filtered.length && (
                      <div className="empty-state">
                        <Search />
                        <strong>No cases found</strong>
                        <p>Try another email or clear your filters.</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSearch("");
                            setFilter("All cases");
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                  </div>
                  <nav className="queue-pagination" aria-label="Review queue pagination">
                    <span role="status">
                      {filtered.length ? pageStart + 1 : 0}–{Math.min(pageStart + QUEUE_PAGE_SIZE, filtered.length)} of {filtered.length} emails
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous queue page"
                        disabled={currentPage === 1}
                        onClick={() => setQueuePage(currentPage - 1)}
                      >
                        <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
                      </button>
                      <span>Page {currentPage} of {pageCount}</span>
                      <button
                        className="icon-button"
                        aria-label="Next queue page"
                        disabled={currentPage === pageCount}
                        onClick={() => setQueuePage(currentPage + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </nav>
                  <div className="queue-foot">
                    <ShieldCheck size={13} />
                    Your judgment makes the difference.
                  </div>
                </aside>
                {active ? <div className="case-workspace" key={active.id}>
                  <div className="case-header">
                    <div>
                      <div className="case-kicker">
                        DOCUMENT COMPARISON <span>/</span> {active.id}
                      </div>
                      <h2>
                        {active.vessel}
                        <ArrowUpRight size={18} />
                      </h2>
                      <div className="case-subtitle">
                        <Ship size={13} />
                        {active.company}
                        <span>•</span>{active.attachments.length} attachments
                      </div>
                    </div>
                    <Badge
                      tone={active.state === "approved" ? "green" : "orange"}
                    >
                      {active.state === "review"
                        ? active.fields.length ? `${unresolved} fields to review` : "Awaiting extraction"
                        : `${active.state} locally`}
                    </Badge>
                  </div>
                  <div className="review-body">
                    <section className="comparison">
                      <div className="subsection-heading"><h3>Sample email</h3></div>
                      <p><strong>From:</strong> {active.company}</p>
                      <p><strong>Subject:</strong> {active.vessel}</p>
                      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", lineHeight: 1.6 }}>{active.body || "This email has no body."}</pre>
                      <div className="info-note">Field extraction and comparison have not been run for this email.</div>
                    </section>
                    <section className="source-panel">
                      <div className="subsection-heading"><h3>Attachments</h3><span>{active.attachments.length} files</span></div>
                      {active.attachments.length ? <>
                        <label className="form-label">Select attachment
                          <select value={attachmentIndex} onChange={(event) => setAttachmentIndex(Number(event.target.value))}>
                            {active.attachments.map((file, index) => <option key={index} value={index}>{file.name}</option>)}
                          </select>
                        </label>
                        {attachment?.url ? <>
                          <a className="text-button" href={attachment.url} target="_blank" rel="noreferrer">Open / download {attachment.name} <ArrowDownToLine size={14} /></a>
                          {attachment.text !== null ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 600, overflow: "auto", lineHeight: 1.6 }}>{attachment.text}</pre>
                            : <p className="info-note">Download this attachment to view its original contents.</p>}
                        </> : <p role="status">This attachment is missing from the sample bundle.</p>}
                      </> : <p>No attachments on this email.</p>}
                    </section>
                  </div>
                  <div className="case-footer">
                    <span>
                      <ShieldCheck size={15} />
                      {active.state !== "review"
                        ? "Decision recorded in this demo session"
                        : unresolved
                          ? `${unresolved} fields need your confirmation`
                          : "Awaiting field extraction and comparison."}
                    </span>
                    <div>
                      <button
                        className="button"
                        disabled={active.state !== "review"}
                        onClick={() => {
                          setReason("");
                          setModal("Escalate case");
                        }}
                      >
                        <Flag size={14} />
                        Escalate
                      </button>
                      <button
                        className="button approve"
                        disabled={active.state !== "review" || !active.fields.length || unresolved > 0}
                        onClick={() => setModal("Approve & submit")}
                      >
                        <ShieldCheck size={15} />
                        Approve & submit
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div> : <div className="empty-state" role="status">{loading ? "Loading sample emails…" : loadError || "No sample emails found."}{loadError && <button className="button" onClick={() => setReload((value) => value + 1)}>Retry</button>}</div>}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} />
              Built for precision. Designed for people.
            </span>
            <span>DocuVerify · Averis × Monash · Demo workspace</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="dialog-title"
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setModal(null);
        }}
      >
        <div className="modal-heading">
          <span className="modal-icon">
            <Layers3 size={21} />
          </span>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="dialog-title">{modal}</h2>
        {modal === "Upload documents" ? (
          <>
            <p>
              Add a Shipping Instruction and draft Bill of Lading to start a
              verification.
            </p>
            <label className="upload-zone">
              <Upload size={28} />
              <strong>Choose your shipping documents</strong>
              <span>PDF, DOCX, TXT or JSON · up to 20 MB each</span>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.json"
                onChange={(e) => {
                  const chosen = Array.from(e.target.files || []);
                  if (
                    chosen.some(
                      (f) =>
                        f.size > 20 * 1024 * 1024 ||
                        !/\.(pdf|docx|txt|json)$/i.test(f.name),
                    )
                  ) {
                    setToast(
                      "Choose PDF, DOCX, TXT or JSON files under 20 MB.",
                    );
                    return;
                  }
                  setFiles(chosen);
                }}
              />
            </label>
            {files.map((f, i) => (
              <div className="file-preview" key={`${f.name}-${i}`}>
                <FileText size={16} />
                <span>{f.name}</span>
                <Check size={14} />
              </div>
            ))}
            <div className="info-note">
              Frontend preview: files stay on your device. Extraction and inbox
              ingestion require a connected backend.
            </div>
            <button
              className="button primary full-width"
              disabled={!files.length}
              onClick={() => {
                setModal(null);
                setToast(
                  `${files.length} files selected. Connect the ingestion API to process documents.`,
                );
              }}
            >
              <ScanLine size={16} />
              Prepare verification
            </button>
          </>
        ) : modal === "Escalate case" ? (
          <>
            <p>Record why EML-{activeId} needs further review.</p>
            <label className="form-label">
              Reason for escalation
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe the discrepancy or missing information…"
              />
            </label>
            <div className="info-note">
              This records a local demo decision. No email will be sent to the
              carrier.
            </div>
            <button
              className="button primary full-width"
              disabled={!reason.trim()}
              onClick={() => {
                setCases((cs) =>
                  cs.map((c) =>
                    c.id === activeId ? { ...c, state: "escalated" } : c,
                  ),
                );
                log(`EML-${activeId} escalated: ${reason}`);
                setModal(null);
                setToast("Escalation recorded locally.");
              }}
            >
              Record escalation
              <ArrowUpRight size={16} />
            </button>
          </>
        ) : modal === "Approve & submit" ? (
          <>
            <p>
              All seven fields have been verified for{" "}
              <strong>{active?.vessel}</strong>. Record your approval and prepare
              the output.
            </p>
            <div className="info-note">
              Demo mode: approval is recorded in this session. POST /submit is
              not connected.
            </div>
            <button
              className="button primary full-width"
              onClick={() => {
                setCases((cs) =>
                  cs.map((c) =>
                    c.id === activeId ? { ...c, state: "approved" } : c,
                  ),
                );
                log(
                  `EML-${activeId} approved locally. Awaiting backend submission integration.`,
                );
                setModal(null);
                setToast("Approved locally. Your report is ready to export.");
              }}
            >
              <ShieldCheck size={16} />
              Confirm local approval
            </button>
          </>
        ) : modal === "Notifications" ? (
          <>
            <p>
              {cases.filter((c) => c.state === "review").length} cases are
              waiting for your expertise.
            </p>
            {cases
              .filter((c) => c.state === "review")
              .slice(0, 3)
              .map((c) => (
                <button
                  className="notification-row"
                  key={c.id}
                  onClick={() => {
                    choose(c.id);
                    setModal(null);
                  }}
                >
                  <Inbox size={17} />
                  <span>
                    <strong>{c.vessel}</strong>
                    <small>
                      {c.kind} · {c.id}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
          </>
        ) : (
          <>
            <p>
              {modal === "Classify"
                ? "Incoming emails are categorized before document processing. Only comparison requests enter verification."
                : modal === "Ingest"
                  ? "Text and DOCX use layout parsers. Scanned or image PDFs are routed to vision extraction."
                  : modal === "Extract"
                    ? "Extract seven mandatory fields with a strict schema, confidence scores, and traceable source spans."
                    : modal === "Compare"
                      ? "The planned pipeline normalizes party names, port aliases, and weight units before comparing SI against draft BL. This demo recognizes MYTPP and Tanjung Pelepas as the same port."
                      : modal === "Human review"
                        ? "Missing fields, unreadable documents, and confidence below 85% require an operator. Select a field to locate its source, edit the extracted value, and save to confirm."
                        : modal === "Integrations"
                          ? "Connection points for the end-to-end document verification workflow."
                          : modal === "Operator settings"
                            ? "Jamie Roberts · Operations specialist · Averis workspace. Identity and access management will be connected to your organization’s sign-in."
                            : modal === "Help & resources"
                              ? "Select a case and inspect its seven fields. Click Review to correct or confirm a value. Approval becomes available when all fields are resolved. Escalate genuine document discrepancies to the carrier."
                              : "Five stages. One auditable decision. Review the complete processing flow below."}
            </p>
            <div className="modal-features">
              {(modal === "Classify"
                ? [
                    "DOCUMENT_COMPARISON → process",
                    "NEW_SI_REQUEST → log & skip",
                    "INVOICE_QUERY → log & skip",
                    "GENERAL → log & skip",
                    "SPAM → log & skip",
                  ]
                : modal === "Integrations"
                  ? [
                      "Email inbox / JSON loader",
                      "FastAPI extraction service",
                      "Vision model for scanned PDFs",
                      "JSON evaluator · POST /submit",
                    ]
                  : modal === "Extract"
                    ? fieldKeys
                    : modal === "Compare"
                      ? [
                          "Party names · fuzzy string comparison",
                          "Port codes · alias normalization",
                          "Gross weight · LBS / tons → kg",
                          "Discrepancies · SI: [value] / BL: [value]",
                        ]
                      : stages.map((s) => `${s.title} · ${s.sub}`)
              ).map((text, i) => (
                <div key={text}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {text}
                  <ChevronRight size={14} />
                </div>
              ))}
            </div>
            <div className="info-note">
              Interactive frontend prototype. Emails and attachments load from the backend sample bundle. Decisions are
              session-only; extraction and submission are not connected.
            </div>
          </>
        )}
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
