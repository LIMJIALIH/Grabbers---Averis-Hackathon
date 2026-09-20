"use client";

import React, { useState, useMemo } from 'react';
import {
  History,
  Mail,
  FileText,
  GitCompare,
  CheckCircle2,
  Edit3,
  UserCheck,
  FileSpreadsheet,
  Trash2,
  Download,
  Filter,
  ArrowUpDown,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuditTrail, recordUserAction } from '@/lib/auditTrailStore';
import { ActionType, UserAction } from '@/types/shipping';

interface AuditTrailPanelProps {
  selectedEmailId?: string;
  onSelectEmail?: (emailId: string) => void;
  className?: string;
}

const ACTION_CONFIG: Record<
  ActionType,
  { label: string; bg: string; text: string; border: string; icon: React.FC<{ className?: string }> }
> = {
  OPEN_EMAIL: {
    label: 'Open Email',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: Mail,
  },
  VIEW_ATTACHMENT: {
    label: 'View Attachment',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: FileText,
  },
  REVIEW_COMPARISON: {
    label: 'Review Comparison',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: GitCompare,
  },
  APPROVE_RESULT: {
    label: 'Approve Result',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  CORRECT_FIELD: {
    label: 'Correct Field',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    icon: Edit3,
  },
  REQUEST_HUMAN_REVIEW: {
    label: 'Human Review',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: UserCheck,
  },
  GENERATE_REPORT: {
    label: 'Generate Report',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    icon: FileSpreadsheet,
  },
  SYSTEM_NOTE: {
    label: 'System Note',
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
    icon: Info,
  },
};

export const AuditTrailPanel: React.FC<AuditTrailPanelProps> = ({
  selectedEmailId,
  onSelectEmail,
  className = '',
}) => {
  const { actions, clearAuditTrail } = useAuditTrail();
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterEmail, setFilterEmail] = useState<string>(selectedEmailId || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); // default: newest first
  const [expandedActionIds, setExpandedActionIds] = useState<Record<string, boolean>>({});

  // Synchronize email filter if selectedEmailId changes
  React.useEffect(() => {
    if (selectedEmailId && filterEmail !== 'ALL') {
      setFilterEmail(selectedEmailId);
    }
  }, [selectedEmailId]);

  // Unique email IDs present in actions
  const emailIdsInActions = useMemo(() => {
    const set = new Set<string>();
    actions.forEach((a) => {
      if (a.emailId) set.add(a.emailId);
    });
    return Array.from(set);
  }, [actions]);

  // Filter and sort actions chronologically
  const filteredActions = useMemo(() => {
    return actions
      .filter((act) => {
        if (filterType !== 'ALL' && act.actionType !== filterType) return false;
        if (filterEmail !== 'ALL' && act.emailId !== filterEmail) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDesc = act.description.toLowerCase().includes(q);
          const matchLabel = act.actionLabel.toLowerCase().includes(q);
          const matchEmail = act.emailId ? act.emailId.toLowerCase().includes(q) : false;
          const matchMeta = act.metadata ? JSON.stringify(act.metadata).toLowerCase().includes(q) : false;
          return matchDesc || matchLabel || matchEmail || matchMeta;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'desc') {
          return b.timestampRaw - a.timestampRaw;
        }
        return a.timestampRaw - b.timestampRaw;
      });
  }, [actions, filterType, filterEmail, searchQuery, sortOrder]);

  const toggleExpand = (id: string) => {
    setExpandedActionIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(actions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `audit-trail-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleRecordSampleAction = () => {
    recordUserAction({
      actionType: 'REVIEW_COMPARISON',
      actionLabel: 'Discrepancy Spot Check',
      emailId: selectedEmailId || 'EML-2024-8841',
      description: 'Quick spot-check comparison triggered via Port Klang audit control.',
      metadata: {
        portAuthority: 'Port Klang Authority (LPK)',
        checkedFields: ['Customs Seal Number (JKDM)', 'Gross Weight'],
        toleranceCheck: 'Gross weight discrepancy exceeds 10% tolerance for Form K1',
      },
    });
  };

  return (
    <div id="audit-trail-panel" className={`flex flex-col h-full bg-zinc-50 border-l border-zinc-200 ${className}`}>
      {/* Top Header */}
      <div className="p-4 border-b border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-zinc-900 text-white shadow-xs">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900 flex items-center gap-2">
                Audit Trail Recorder
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                  {actions.length} {actions.length === 1 ? 'event' : 'events'}
                </span>
              </h2>
              <p className="text-xs text-zinc-500">Pure in-memory chronological recorder</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            <button
              id="export-audit-json-btn"
              onClick={handleExportJson}
              disabled={actions.length === 0}
              title="Export in-memory trail as JSON"
              className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-xs font-medium flex items-center gap-1 border border-zinc-200 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </button>
            <button
              id="clear-audit-trail-btn"
              onClick={() => {
                if (window.confirm('Clear all in-memory audit logs? (This will reset the array to empty)')) {
                  clearAuditTrail();
                }
              }}
              disabled={actions.length === 0}
              title="Clear in-memory array"
              className="p-1.5 rounded-md text-rose-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors border border-rose-200 shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Transient Storage Notice */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-50/80 border border-amber-200/70 text-amber-900 text-[11px] leading-tight">
          <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>
            <strong>In-Memory Only:</strong> Logs reside strictly in JavaScript memory and clear automatically when refreshed.
          </span>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-3 space-y-2">
          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              id="audit-search-input"
              type="text"
              placeholder="Search descriptions, fields, or metadata..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:bg-white text-zinc-800 placeholder-zinc-400"
            />
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-12 gap-1.5 text-xs">
            {/* Action Type Filter */}
            <div className="col-span-5 relative">
              <select
                id="audit-filter-type-select"
                aria-label="Filter by action type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full py-1.5 pl-2 pr-6 bg-white border border-zinc-200 rounded-md text-zinc-700 font-medium text-[11px] appearance-none focus:outline-none focus:border-zinc-400 truncate"
              >
                <option value="ALL">All Action Types</option>
                <option value="OPEN_EMAIL">Open Email</option>
                <option value="VIEW_ATTACHMENT">View Attachment</option>
                <option value="REVIEW_COMPARISON">Review Comparison</option>
                <option value="APPROVE_RESULT">Approve Result</option>
                <option value="CORRECT_FIELD">Correct Field</option>
                <option value="REQUEST_HUMAN_REVIEW">Human Review</option>
                <option value="GENERATE_REPORT">Generate Report</option>
              </select>
              <Filter className="w-3 h-3 absolute right-2 top-2.5 text-zinc-400 pointer-events-none" />
            </div>

            {/* Email Filter */}
            <div className="col-span-4 relative">
              <select
                id="audit-filter-email-select"
                aria-label="Filter by email ID"
                value={filterEmail}
                onChange={(e) => setFilterEmail(e.target.value)}
                className="w-full py-1.5 pl-2 pr-6 bg-white border border-zinc-200 rounded-md text-zinc-700 font-medium text-[11px] appearance-none focus:outline-none focus:border-zinc-400 truncate"
              >
                <option value="ALL">All Emails</option>
                {emailIdsInActions.map((eid) => (
                  <option key={eid} value={eid}>
                    {eid}
                  </option>
                ))}
              </select>
              <Mail className="w-3 h-3 absolute right-2 top-2.5 text-zinc-400 pointer-events-none" />
            </div>

            {/* Sort Order Toggle */}
            <button
              id="audit-sort-order-btn"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              title={sortOrder === 'desc' ? 'Showing Newest First (click for Oldest First)' : 'Showing Oldest First (click for Newest First)'}
              className="col-span-3 py-1.5 px-2 bg-white border border-zinc-200 rounded-md text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-1 text-[11px] font-medium"
            >
              <ArrowUpDown className="w-3 h-3 text-zinc-500" />
              <span>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action List (Chronological Timeline) */}
      <div id="audit-events-list" className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-6 bg-white rounded-lg border border-dashed border-zinc-300">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-2">
              <Layers className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-zinc-700">No actions recorded</p>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px]">
              Perform actions in the verification view (open an email, view SI/BL, correct a field) to populate this audit trail.
            </p>
            <button
              onClick={handleRecordSampleAction}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Record Test Action
            </button>
          </div>
        ) : (
          filteredActions.map((action, idx) => {
            const config = ACTION_CONFIG[action.actionType] || ACTION_CONFIG.SYSTEM_NOTE;
            const IconComponent = config.icon;
            const isExpanded = !!expandedActionIds[action.id];

            return (
              <div
                key={action.id}
                id={`audit-action-${action.id}`}
                className="bg-white rounded-lg border border-zinc-200 shadow-xs hover:border-zinc-300 transition-all p-3 text-xs"
              >
                {/* Timeline Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${config.bg} ${config.text} ${config.border}`}
                    >
                      <IconComponent className="w-3 h-3" />
                      {action.actionLabel}
                    </span>

                    {action.emailId && (
                      <button
                        onClick={() => onSelectEmail && onSelectEmail(action.emailId!)}
                        title={`Focus email ${action.emailId}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-mono text-[10px] border border-zinc-200 transition-colors"
                      >
                        <Mail className="w-2.5 h-2.5 text-zinc-400" />
                        {action.emailId}
                      </button>
                    )}

                    {action.documentType && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-50 text-zinc-600 font-mono text-[10px] border border-zinc-200">
                        {action.documentType}
                      </span>
                    )}
                  </div>

                  {/* Sequence number & Timestamp */}
                  <div className="text-right shrink-0">
                    <span className="font-mono text-[10px] text-zinc-400 block" title={action.timestampIso}>
                      {action.timestamp}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div className="mt-2 text-zinc-800 text-xs font-normal leading-relaxed">
                  {action.description}
                </div>

                {/* Metadata details toggle */}
                {action.metadata && Object.keys(action.metadata).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-zinc-100">
                    <button
                      onClick={() => toggleExpand(action.id)}
                      className="flex items-center justify-between w-full text-[11px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        <span>Details & Payload</span>
                        <span className="px-1.5 py-0.2 rounded bg-zinc-100 text-[10px] font-mono text-zinc-600">
                          {Object.keys(action.metadata).length} {Object.keys(action.metadata).length === 1 ? 'key' : 'keys'}
                        </span>
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 p-2.5 bg-zinc-50 rounded-md border border-zinc-200 font-mono text-[11px] text-zinc-700 overflow-x-auto space-y-1">
                        {Object.entries(action.metadata).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2">
                            <span className="text-zinc-400 shrink-0 font-semibold">{key}:</span>
                            <span className="text-zinc-800 break-all">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-zinc-200 bg-white text-[11px] text-zinc-500 flex items-center justify-between">
        <span>Active Session Store</span>
        <span className="font-mono text-zinc-400">
          Showing {filteredActions.length} of {actions.length}
        </span>
      </div>
    </div>
  );
};
