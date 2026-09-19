"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
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
  Sparkles,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
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
  state: "review" | "approved" | "escalated";
};
const base: Field[] = [
  {
    key: "shipper",
    label: "Shipper",
    si: "Global Tech Exports",
    bl: "Global Tech Exports",
    confidence: 99,
  },
  {
    key: "consignee",
    label: "Consignee",
    si: "Nordic Components AB",
    bl: "Nordic Components AB",
    confidence: 98,
  },
  {
    key: "notify_party",
    label: "Notify party",
    si: "Same as consignee",
    bl: "Same as consignee",
    confidence: 97,
  },
  {
    key: "port_of_loading",
    label: "Port of loading",
    si: "MYTPP",
    bl: "Tanjung Pelepas",
    confidence: 99,
  },
  {
    key: "port_of_discharge",
    label: "Port of discharge",
    si: "NLRTM",
    bl: "NLRTM",
    confidence: 98,
  },
  {
    key: "container_count",
    label: "Container count",
    si: "3",
    bl: "4",
    confidence: 96,
  },
  {
    key: "gross_weight_kg",
    label: "Gross weight (kg)",
    si: "68400",
    bl: "68400",
    confidence: 81,
  },
];
const companies = [
  "Global Tech Exports",
  "Atlas Trading Ltd",
  "Lumen Industries",
  "Oceanic Supply Co",
  "Kerguelen Logistics",
  "Hansa Exports",
];
const initial: Case[] = [
  "Pacific Trader",
  "Evergreen Atlas",
  "Maersk Lumen",
  "ONE Way",
  "CMA CGM Kerguelen",
  "Hansa Unity",
].map((vessel, i) => ({
  id: ["8042", "8039", "8037", "8031", "8028", "8024"][i],
  vessel,
  company: companies[i],
  time: ["09:42", "09:36", "09:21", "08:57", "08:44", "08:31"][i],
  kind:
    i === 1 || i === 5
      ? "Low confidence"
      : i === 2 || i === 4
        ? "Pending review"
        : "Discrepancy",
  state: "review",
  fields: base.map((f, n) => ({
    ...f,
    ...(n === 0 ? { si: companies[i], bl: companies[i] } : {}),
    ...(i > 0 && n === 5
      ? { si: String(i + 2), bl: String(i + 2 + (i === 3 ? 1 : 0)) }
      : {}),
    ...(n === 6 && i > 0
      ? {
          si: String(24000 + i * 7200),
          bl: String(24000 + i * 7200),
          confidence: i === 1 || i === 5 ? 78 : 98,
        }
      : {}),
  })),
}));
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
  const [cases, setCases] = useState(initial);
  const [activeId, setActiveId] = useState("8042");
  const [view, setView] = useState("Overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All cases");
  const [selectedField, setSelectedField] = useState("container_count");
  const [source, setSource] = useState<"si" | "bl">("bl");
  const [zoom, setZoom] = useState(100);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
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
  const [audit, setAudit] = useState([
    {
      time: "09:42",
      text: "EML-8042 routed to human review: container mismatch and low-confidence weight.",
    },
  ]);
  const dialog = useRef<HTMLDialogElement>(null);
  const active = cases.find((c) => c.id === activeId)!;
  const unresolved = active.fields.filter(
    (f) => !matches(f) || f.confidence < 85,
  ).length;
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
  function updateField(key: string, value: string) {
    if (
      !value.trim() ||
      (["container_count", "gross_weight_kg"].includes(key) &&
        (!Number.isFinite(Number(value)) ||
          Number(value) <= 0 ||
          (key === "container_count" && !Number.isInteger(Number(value)))))
    ) {
      setToast(
        "Enter a positive value. Container count must be a whole number.",
      );
      return;
    }
    setCases((items) =>
      items.map((c) =>
        c.id === activeId
          ? {
              ...c,
              fields: c.fields.map((f) =>
                f.key === key ? { ...f, bl: value.trim(), confidence: 100 } : f,
              ),
            }
          : c,
      ),
    );
    setEditing(null);
    log(`EML-${activeId}: ${key} verified by operator.`);
    setToast("Extraction updated. Comparison recalculated.");
  }
  function exportReport() {
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
    setEditing(null);
    setSelectedField("container_count");
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
                note: "SI + BL document pairs",
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
                      SI_{c.id}.pdf · BL_DRAFT_{c.id}.pdf
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
                      placeholder="Search vessel or case ID…"
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
                    <span>NEWEST FIRST</span>
                  </div>
                  <div className="queue-list">
                    {filtered.map((c) => (
                      <button
                        className={`queue-item ${activeId === c.id ? "selected" : ""}`}
                        aria-pressed={activeId === c.id}
                        key={c.id}
                        onClick={() => choose(c.id)}
                      >
                        <div className="queue-item-meta">
                          <span>EML-{c.id}</span>
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
                            <FileText size={11} />2
                          </span>
                        </div>
                      </button>
                    ))}
                    {!filtered.length && (
                      <div className="empty-state">
                        <Search />
                        <strong>No cases found</strong>
                        <p>Try another vessel or clear your filters.</p>
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
                  <div className="queue-foot">
                    <ShieldCheck size={13} />
                    Your judgment makes the difference.
                  </div>
                </aside>
                <div className="case-workspace" key={active.id}>
                  <div className="case-header">
                    <div>
                      <div className="case-kicker">
                        DOCUMENT COMPARISON <span>/</span> EML-{active.id}
                      </div>
                      <h2>
                        {active.vessel}
                        <ArrowUpRight size={18} />
                      </h2>
                      <div className="case-subtitle">
                        <Ship size={13} />
                        Tanjung Pelepas <ArrowRight size={12} /> Rotterdam
                        <span>•</span>2 attachments
                      </div>
                    </div>
                    <Badge
                      tone={active.state === "approved" ? "green" : "orange"}
                    >
                      {active.state === "review"
                        ? `${unresolved} fields to review`
                        : `${active.state} locally`}
                    </Badge>
                  </div>
                  <div className="review-notice">
                    <Sparkles size={17} />
                    <p>
                      <strong>
                        {unresolved
                          ? "The heavy lifting is done. Your expertise comes next."
                          : "Looking good. All seven fields are verified."}
                      </strong>
                      <span>
                        {unresolved
                          ? "Review highlighted values against the source before approving."
                          : "You can now approve this case and export the result."}
                      </span>
                    </p>
                    <span className="confidence-meter">
                      <i />
                      <strong>
                        {Math.round(
                          active.fields.reduce((s, f) => s + f.confidence, 0) /
                            7,
                        )}
                        %
                      </strong>
                      <small>confidence</small>
                    </span>
                  </div>
                  <div className="review-body">
                    <section className="comparison">
                      <div className="subsection-heading">
                        <h3>Field comparison</h3>
                        <span>7 mandatory fields</span>
                      </div>
                      <div className="comparison-table">
                        <div className="table-head">
                          <span>EXTRACTED FIELD</span>
                          <span>
                            SHIPPING INSTRUCTION
                            <small>Reference document</small>
                          </span>
                          <span>
                            BILL OF LADING<small>Draft document</small>
                          </span>
                        </div>
                        {active.fields.map((f) => {
                          const issue = !matches(f) || f.confidence < 85;
                          return (
                            <div
                              className={`comparison-row ${issue ? "flagged" : ""} ${selectedField === f.key ? "focused-row" : ""}`}
                              key={f.key}
                            >
                              <button
                                className="field-label"
                                onClick={() => {
                                  setSelectedField(f.key);
                                  setSource("bl");
                                }}
                              >
                                <span>{f.label}</span>
                                <small>
                                  {!matches(f) ? (
                                    <>
                                      <i className="issue-dot" />
                                      Mismatch
                                    </>
                                  ) : f.confidence < 85 ? (
                                    <>
                                      <i className="issue-dot" />
                                      Low confidence
                                    </>
                                  ) : f.si !== f.bl ? (
                                    <>
                                      <CheckCheck size={11} />
                                      Normalized match
                                    </>
                                  ) : (
                                    <>
                                      <Check size={11} />
                                      Match
                                    </>
                                  )}
                                </small>
                              </button>
                              <div className="reference-value">{f.si}</div>
                              <div className="draft-value">
                                {editing === f.key ? (
                                  <form
                                    className="edit-form"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      updateField(f.key, draft);
                                    }}
                                  >
                                    <input
                                      aria-label={`Edit ${f.label}`}
                                      autoFocus
                                      value={draft}
                                      onChange={(e) => setDraft(e.target.value)}
                                    />
                                    <button
                                      aria-label="Save field"
                                      type="submit"
                                    >
                                      <Check size={15} />
                                    </button>
                                    <button
                                      aria-label="Cancel edit"
                                      type="button"
                                      onClick={() => setEditing(null)}
                                    >
                                      <X size={14} />
                                    </button>
                                  </form>
                                ) : (
                                  <>
                                    <button
                                      className="value-button"
                                      onClick={() => setSelectedField(f.key)}
                                    >
                                      {f.bl}
                                      <span>{f.confidence}%</span>
                                    </button>
                                    {active.state === "review" && (
                                      <button
                                        className="field-action"
                                        aria-label={`${issue ? "Review" : "Edit"} ${f.label}`}
                                        onClick={() => {
                                          setEditing(f.key);
                                          setDraft(f.bl);
                                          setSelectedField(f.key);
                                        }}
                                      >
                                        {issue ? "Review" : "Edit"}
                                        <ArrowUpRight size={11} />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="normalization-note">
                        <CheckCheck size={14} />
                        <p>
                          <strong>Different format. Same meaning.</strong> Port
                          aliases are recognized. Unit normalization is a
                          planned pipeline feature.
                        </p>
                        <button
                          className="icon-button"
                          aria-label="View normalization rules"
                          onClick={() => setModal("Compare")}
                        >
                          <CircleHelp size={14} />
                        </button>
                      </div>
                    </section>
                    <section className="source-panel">
                      <div className="subsection-heading">
                        <h3>
                          <ScanLine size={15} />
                          Source grounding
                        </h3>
                        <Badge tone="green">Linked</Badge>
                      </div>
                      <div className="source-toolbar">
                        <div className="segmented">
                          <button
                            aria-pressed={source === "si"}
                            className={source === "si" ? "chosen" : ""}
                            onClick={() => setSource("si")}
                          >
                            SI
                          </button>
                          <button
                            aria-pressed={source === "bl"}
                            className={source === "bl" ? "chosen" : ""}
                            onClick={() => setSource("bl")}
                          >
                            Draft BL
                          </button>
                        </div>
                        <div>
                          <button
                            className="icon-button"
                            aria-label="Zoom out"
                            disabled={zoom <= 80}
                            onClick={() => setZoom((z) => z - 10)}
                          >
                            <ZoomOut size={14} />
                          </button>
                          <span>{zoom}%</span>
                          <button
                            className="icon-button"
                            aria-label="Zoom in"
                            disabled={zoom >= 140}
                            onClick={() => setZoom((z) => z + 10)}
                          >
                            <ZoomIn size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="paper-stage">
                        <div
                          className="paper"
                          style={{ width: `${zoom}%`, minWidth: `${zoom}%` }}
                        >
                          <div className="paper-brand">
                            <Ship size={18} />
                            <strong>
                              OCEAN LINE
                              <small>GLOBAL SHIPPING & LOGISTICS</small>
                            </strong>
                            <span>
                              {source === "bl" ? "DRAFT" : "REFERENCE"}
                            </span>
                          </div>
                          <h4>
                            {source === "bl"
                              ? "BILL OF LADING"
                              : "SHIPPING INSTRUCTION"}
                          </h4>
                          <div className="paper-number">
                            BOOKING NO. OL-{active.id} · NON-NEGOTIABLE
                          </div>
                          {initial
                            .find((c) => c.id === activeId)!
                            .fields.map((f) => (
                              <button
                                key={f.key}
                                className={`paper-field ${selectedField === f.key ? "highlight" : ""}`}
                                onClick={() => setSelectedField(f.key)}
                              >
                                <small>{f.label.toUpperCase()}</small>
                                <strong>{f[source]}</strong>
                                {selectedField === f.key && (
                                  <span className="extract-tag">
                                    <ScanLine size={9} />
                                    Source span
                                  </span>
                                )}
                              </button>
                            ))}
                          <div className="paper-signature">
                            <span>Authorized carrier signature</span>
                            <i>Ocean Line</i>
                          </div>
                        </div>
                      </div>
                      <div className="source-caption">
                        <i />
                        <span>
                          Sample source preview · click a field to locate it
                        </span>
                      </div>
                    </section>
                  </div>
                  <div className="case-footer">
                    <span>
                      <ShieldCheck size={15} />
                      {active.state !== "review"
                        ? "Decision recorded in this demo session"
                        : unresolved
                          ? `${unresolved} fields need your confirmation`
                          : "All fields verified. Ready for approval."}
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
                        disabled={active.state !== "review" || unresolved > 0}
                        onClick={() => setModal("Approve & submit")}
                      >
                        <ShieldCheck size={15} />
                        Approve & submit
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
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
              <strong>{active.vessel}</strong>. Record your approval and prepare
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
                      {c.kind} · EML-{c.id}
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
                    ? base.map((f) => f.key)
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
              Interactive frontend prototype. Sample data and decisions are
              session-only; backend services are not connected.
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
