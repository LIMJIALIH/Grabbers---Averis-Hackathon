"use client";

import React, { useState } from 'react';
import { X, UserCheck, AlertTriangle } from 'lucide-react';
import { recordUserAction } from '@/lib/auditTrailStore';

interface HumanReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailId: string;
  discrepanciesCount: number;
  onRequestSubmitted: (priority: 'low' | 'medium' | 'high', notes: string) => void;
}

export const HumanReviewModal: React.FC<HumanReviewModalProps> = ({
  isOpen,
  onClose,
  emailId,
  discrepanciesCount,
  onRequestSubmitted,
}) => {
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('high');
  const [reviewerTeam, setReviewerTeam] = useState('Jabatan Kastam Diraja Malaysia (JKDM) Trade Compliance');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalNotes = notes.trim() || `Discrepancy inspection required (${discrepanciesCount} unresolved fields)`;

    // Record User Action into Audit Trail
    recordUserAction({
      actionType: 'REQUEST_HUMAN_REVIEW',
      actionLabel: 'Human Review Requested',
      emailId,
      description: `Escalated ${emailId} for manual human review (${priority.toUpperCase()} priority). Reason: ${finalNotes}`,
      metadata: {
        assignedTeam: reviewerTeam,
        priority,
        notes: finalNotes,
        discrepanciesCount,
        requestSource: 'Verification Discrepancy Matrix',
      },
    });

    onRequestSubmitted(priority, finalNotes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        id="human-review-modal"
        className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-rose-100 text-rose-700">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Request Human Review</h3>
              <p className="text-xs text-zinc-500 font-mono">{emailId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200/80 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              This will route the shipping documentation to the designated customs officer or supervisor and record an escalation event in the audit trail.
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Target Review Team</label>
            <select
              value={reviewerTeam}
              onChange={(e) => setReviewerTeam(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            >
              <option value="Jabatan Kastam Diraja Malaysia (JKDM) Trade Compliance">
                Jabatan Kastam Diraja Malaysia (JKDM) Trade Compliance
              </option>
              <option value="Port Klang Westports Gate & Container Inspection Division">
                Port Klang Westports Gate & Container Inspection Division
              </option>
              <option value="Dagang Net e-Permit / SMK Customs Clearance Unit">
                Dagang Net e-Permit / SMK Customs Clearance Unit
              </option>
              <option value="Port of Tanjung Pelepas (PTP) Documentation Specialist">
                Port of Tanjung Pelepas (PTP) Documentation Specialist
              </option>
              <option value="Penang Port Container Terminal Operations (NBCT)">
                Penang Port Container Terminal Operations (NBCT)
              </option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Escalation Urgency / Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`py-2 px-3 rounded-lg border text-center capitalize font-medium transition-colors ${
                    priority === p
                      ? 'bg-rose-50 border-rose-400 text-rose-800 font-semibold'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Review Instructions / Discrepancy Context</label>
            <textarea
              rows={3}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              placeholder="Detail reasons for escalation (e.g. Seal mismatch exceeds automated tolerance threshold)..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Escalate & Record Action
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
