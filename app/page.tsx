'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  Flag,
  Pencil,
  Search,
  ShieldCheck,
  Ship,
  X,
} from 'lucide-react'

const queueItems = [
  { id: '#EML-8042', subject: 'Draft BL / MV Pacific Trader', time: '09:42', status: 'Mismatch detected', tone: 'alert', active: true },
  { id: '#EML-8039', subject: 'SI update / Evergreen Atlas', time: '09:36', status: 'Low confidence', tone: 'warning' },
  { id: '#EML-8037', subject: 'BL approval / Maersk Lumen', time: '09:21', status: 'Pending review', tone: 'pending' },
  { id: '#EML-8031', subject: 'Shipping instruction / ONE Way', time: '08:57', status: 'Mismatch detected', tone: 'alert' },
  { id: '#EML-8028', subject: 'Draft BL / CMA CGM Kerguelen', time: '08:44', status: 'Pending review', tone: 'pending' },
  { id: '#EML-8024', subject: 'SI confirmation / Hansa Unity', time: '08:31', status: 'Low confidence', tone: 'warning' },
]

const fields = [
  { label: 'Shipper', si: 'Global Tech Exports', bl: 'Global Tech Exports', status: 'match' },
  { label: 'Consignee', si: 'Nordic Components AB', bl: 'Nordic Components AB', status: 'match' },
  { label: 'Notify Party', si: 'Same as consignee', bl: 'Same as consignee', status: 'match' },
  { label: 'Port of Loading', si: 'MYTPP', bl: 'Tanjung Pelepas', status: 'mismatch' },
  { label: 'Port of Discharge', si: 'NLRTM', bl: 'NLRTM', status: 'match' },
  { label: 'Container Count', si: '3', bl: '4', status: 'mismatch' },
  { label: 'Gross Weight (KG)', si: '68,400', bl: '68,400', status: 'match' },
]

function StatusMark({ tone }: { tone: string }) {
  return <span className={`status-mark status-${tone}`} aria-hidden="true" />
}

function FieldValue({ value, status, side, onEdit }: { value: string; status: string; side: string; onEdit: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (editing) {
    return (
      <div className="field-edit">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={`Edit ${side} value`} autoFocus />
        <button className="save-edit" onClick={() => { setEditing(false); onEdit() }}>Save</button>
        <button className="cancel-edit" onClick={() => setEditing(false)} aria-label="Cancel edit"><X /></button>
      </div>
    )
  }
  return (
    <div className={`field-value ${status !== 'match' ? `field-${status}` : ''}`}>
      {status === 'match' ? <Check className="match-icon" aria-label="Matches reference" /> : <AlertTriangle className="alert-icon" aria-label="Needs review" />}
      <span>{draft}</span>
      {status !== 'match' && <button className="edit-button" onClick={() => { setEditing(true); onEdit() }}><Pencil /> Edit</button>}
    </div>
  )
}

export default function Page() {
  const [activeId, setActiveId] = useState('#EML-8042')
  const [approved, setApproved] = useState(false)
  const [escalated, setEscalated] = useState(false)

  return (
    <main className="app-shell">
      <aside className="queue-panel" aria-label="Verification inbox">
        <div className="brand-lockup">
          <div className="brand-mark"><Ship /></div>
          <div><strong>Harborline</strong><span>Document control</span></div>
        </div>
        <div className="queue-heading"><span>Verification queue</span><b>06</b></div>
        <div className="queue-list">
          {queueItems.map((item) => (
            <button key={item.id} className={`queue-item ${activeId === item.id ? 'queue-active' : ''}`} onClick={() => setActiveId(item.id)}>
              <div className="queue-row"><span className="email-id">{item.id}</span><time>{item.time}</time></div>
              <div className="queue-subject">{item.subject}</div>
              <div className="queue-status"><StatusMark tone={item.tone} />{item.status}</div>
            </button>
          ))}
        </div>
        <div className="queue-footer"><span className="online-dot" />Operator session active<span className="operator">JR</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="record-heading">
            <div className="record-id"><CircleDot /> {activeId}</div>
            <h1>Draft BL / MV Pacific Trader</h1>
            <span className="header-status"><StatusMark tone="alert" /> 2 discrepancies</span>
          </div>
          <div className="header-actions">
            <button className={`action-button ${escalated ? 'action-done' : ''}`} onClick={() => setEscalated(!escalated)}><ArrowUpRight /> {escalated ? 'Escalated' : 'Escalate to Carrier'}</button>
            <button className="action-button" onClick={() => document.querySelector<HTMLInputElement>('.field-edit input')?.focus()}><Pencil /> Override Extract</button>
            <button className={`approve-button ${approved ? 'approved' : ''}`} onClick={() => setApproved(true)}>{approved ? <Check /> : <ShieldCheck />} {approved ? 'Document Approved' : 'Approve Document'}</button>
          </div>
        </header>

        <div className="workspace-meta"><span><FileText /> SOURCE: SI_8042.PDF + BL_DRAFT_8042.PDF</span><span>LAST SYNC 09:42:18 UTC</span><span className="confidence"><span className="confidence-line" /> Extraction confidence 96%</span></div>

        <div className="comparison-grid">
          <section className="comparison-column reference-column">
            <div className="column-heading"><div><span className="column-index">01</span><h2>Shipping Instruction</h2></div><span className="column-tag">Reference truth</span></div>
            <div className="field-list">
              {fields.map((field) => <div className={`field-row ${field.status !== 'match' ? 'row-flagged' : ''}`} key={`si-${field.label}`}><div className="field-label">{field.label}</div><FieldValue value={field.si} status="match" side="SI" onEdit={() => {}} /></div>)}
            </div>
            <div className="column-note"><CheckCircle2 /> Reference values are locked</div>
          </section>

          <section className="comparison-column draft-column">
            <div className="column-heading"><div><span className="column-index">02</span><h2>Bill of Lading</h2></div><span className="column-tag tag-alert">Needs review</span></div>
            <div className="field-list">
              {fields.map((field) => <div className={`field-row ${field.status !== 'match' ? 'row-flagged' : ''}`} key={`bl-${field.label}`}><div className="field-label">{field.label}</div><FieldValue value={field.bl} status={field.status} side="BL" onEdit={() => {}} /></div>)}
            </div>
            <div className="column-note note-alert"><AlertTriangle /> Review both flagged values before approval</div>
          </section>

          <section className="document-column">
            <div className="column-heading"><div><span className="column-index">03</span><h2>Source document</h2></div><button className="icon-button" aria-label="Search document"><Search /></button></div>
            <div className="document-toolbar"><span>BL_DRAFT_8042.PDF</span><span>Page 1 / 2</span><div><button aria-label="Zoom out">−</button><button aria-label="Zoom in">+</button></div></div>
            <div className="document-stage">
              <div className="paper-sheet">
                <div className="paper-header"><span>OCEAN CARRIER BILL OF LADING</span><b>ORIGINAL</b></div>
                <div className="paper-rule" />
                <div className="paper-grid"><div><small>SHIPPER</small><strong>Global Tech Exports</strong></div><div><small>BOOKING NO.</small><strong>HL-8042-PT</strong></div></div>
                <div className="paper-grid"><div><small>CONSIGNEE</small><strong>Nordic Components AB</strong></div><div><small>VESSEL / VOYAGE</small><strong>MV Pacific Trader / 118E</strong></div></div>
                <div className="paper-grid"><div className="highlight-box"><small>PORT OF LOADING</small><strong>Tanjung Pelepas</strong><span className="extract-pin">AI extract</span></div><div><small>PORT OF DISCHARGE</small><strong>Rotterdam</strong></div></div>
                <div className="paper-rule" />
                <div className="paper-grid"><div><small>CONTAINER COUNT</small><strong>4 x 40&apos; HC</strong></div><div><small>GROSS WEIGHT</small><strong>68,400 KG</strong></div></div>
                <div className="paper-lines"><i /><i /><i /><i /><i /></div>
                <div className="paper-stamp">DRAFT<br /><span>NOT VALID FOR CARRIAGE</span></div>
              </div>
            </div>
            <div className="document-caption"><Flag /> Highlighted region: Port of Loading <strong>·</strong> BL extraction</div>
          </section>
        </div>

        <footer className="status-footer"><div><span className="status-mark status-alert" /> <strong>Action required</strong> Resolve 2 discrepancies to approve this document</div><button className="details-button">View extraction details <ChevronRight /></button></footer>
      </section>
    </main>
  )
}
