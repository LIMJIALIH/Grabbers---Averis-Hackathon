import React, { useState, useEffect } from 'react';
import {
  Ship,
  History,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  Sparkles,
  Layout,
  PanelRightClose,
  PanelRightOpen,
  ArrowRight,
} from 'lucide-react';
import { INITIAL_SHIPPING_EMAILS } from './data/mockShippingData';
import { ShippingEmail } from './types';
import { ShippingVerificationView } from './components/ShippingVerificationView';
import { AuditTrailPanel } from './components/AuditTrailPanel';
import { recordUserAction, useAuditTrail } from './audit/auditTrailStore';

export default function App() {
  const [emails, setEmails] = useState<ShippingEmail[]>(INITIAL_SHIPPING_EMAILS);
  const [selectedEmailId, setSelectedEmailId] = useState<string>(INITIAL_SHIPPING_EMAILS[0].id);
  const [isAuditPanelOpen, setIsAuditPanelOpen] = useState(true);

  const { actions, count } = useAuditTrail();

  // Initial seed on mount: Log initial workflow state into in-memory array
  useEffect(() => {
    // Only seed if empty
    if (actions.length === 0) {
      recordUserAction({
        actionType: 'OPEN_EMAIL',
        actionLabel: 'Opened Shipping Email',
        emailId: 'EML-2024-8841',
        description: 'Opened shipping case EML-2024-8841 (BUNGA RAYA SATU V.2408W - Containers MISU9023418)',
        metadata: {
          sessionInit: true,
          carrier: 'MISC Berhad (Malaysia International Shipping Corporation)',
          vessel: 'BUNGA RAYA SATU',
          route: 'Port Klang (Northport) -> Port of Tanjung Pelepas, Johor',
          pendingDiscrepancies: 2,
        },
      });

      recordUserAction({
        actionType: 'REVIEW_COMPARISON',
        actionLabel: 'Reviewed Comparison Matrix',
        emailId: 'EML-2024-8841',
        description: 'Automated parser flagged discrepancies in Customs Seal (MY-JKD-849201 vs MY-JKD-849210) and Gross Weight',
        metadata: {
          matchedCount: 6,
          discrepancyCount: 2,
          flaggedFields: ['Customs Seal Number (JKDM)', 'Gross Weight'],
        },
      });
    }
  }, []);

  const handleUpdateEmail = (updatedEmail: ShippingEmail) => {
    setEmails((prev) => prev.map((e) => (e.id === updatedEmail.id ? updatedEmail : e)));
  };

  const handleSimulateQuickWorkflow = () => {
    // Helper to quickly demonstrate the recorder across full workflow
    recordUserAction({
      actionType: 'APPROVE_RESULT',
      actionLabel: 'Approved Verification Result',
      emailId: selectedEmailId,
      description: `Discrepancies resolved and clearance issued for ${selectedEmailId}`,
      metadata: {
        approver: 'Duty Customs Officer (JKDM Westports)',
        clearanceCode: 'JKDM-K1-2026-PKG99',
      },
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-100 text-zinc-900 overflow-hidden font-sans">
      {/* Top Application Header */}
      <header className="h-14 bg-white border-b border-zinc-200 px-5 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white shadow-xs">
            <Ship className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-zinc-900">
                Malaysia Shipping Document Verification
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Audit Recorder Active
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              SI vs. Draft BL automated verification for Malaysian ports (Port Klang, PTP, Penang Port, Kuantan)
            </p>
          </div>
        </div>

        {/* Header Right Controls */}
        <div className="flex items-center gap-2">
          {/* Quick Simulation Trigger */}
          <button
            id="simulate-quick-action-btn"
            onClick={handleSimulateQuickWorkflow}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 transition-colors shadow-xs"
            title="Log quick approval test action to in-memory array"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Quick Test Action</span>
          </button>

          {/* Toggle Audit Trail Panel */}
          <button
            id="toggle-audit-panel-btn"
            onClick={() => setIsAuditPanelOpen(!isAuditPanelOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-xs ${
              isAuditPanelOpen
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                isAuditPanelOpen ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-700'
              }`}
            >
              {count}
            </span>
            {isAuditPanelOpen ? (
              <PanelRightClose className="w-3.5 h-3.5 ml-1 opacity-70" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5 ml-1 opacity-70" />
            )}
          </button>
        </div>
      </header>

      {/* Main App Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Verification Workflow View */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <ShippingVerificationView
            emails={emails}
            selectedEmailId={selectedEmailId}
            onSelectEmail={setSelectedEmailId}
            onUpdateEmail={handleUpdateEmail}
          />
        </main>

        {/* Audit Trail Sidebar Panel */}
        {isAuditPanelOpen && (
          <aside className="w-96 shrink-0 h-full border-l border-zinc-200 shadow-lg z-10">
            <AuditTrailPanel
              selectedEmailId={selectedEmailId}
              onSelectEmail={setSelectedEmailId}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
