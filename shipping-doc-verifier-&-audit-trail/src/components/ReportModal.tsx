import React from 'react';
import { X, FileSpreadsheet, CheckCircle, AlertTriangle, Printer, Download } from 'lucide-react';
import { ShippingEmail } from '../types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: ShippingEmail;
  reportId: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  email,
  reportId,
}) => {
  if (!isOpen) return null;

  const matchedCount = email.comparisonFields.filter((f) => f.status === 'matched').length;
  const correctedCount = email.comparisonFields.filter((f) => f.status === 'corrected').length;
  const discrepancyCount = email.comparisonFields.filter((f) => f.status === 'discrepancy').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        id="report-modal"
        className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-100 text-teal-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Document Verification Audit Certificate
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                Report Reference: <strong className="text-zinc-800">{reportId}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Certificate Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
          {/* Certificate Banner */}
          <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 block mb-0.5">
                Official Malaysian Shipping & Customs Audit Summary (JKDM / MITI)
              </span>
              <h4 className="text-sm font-bold text-teal-950">
                Ocean Bill of Lading vs. Shipping Instruction (Form K1/K2 Clearance)
              </h4>
              <p className="text-xs text-teal-800 mt-1">
                Carrier: {email.carrier} | Vessel: {email.vesselName} ({email.voyageNumber})
              </p>
            </div>
            <div className="text-right font-mono text-[11px] text-teal-900">
              <div className="font-semibold uppercase px-2 py-1 rounded bg-teal-200/80 inline-block">
                Status: {email.status.toUpperCase()}
              </div>
              <div className="text-[10px] text-teal-700 mt-1">Email: {email.id}</div>
            </div>
          </div>

          {/* Verification Statistics */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Matched Fields</span>
              <span className="text-lg font-bold text-emerald-900">{matchedCount}</span>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <span className="text-[10px] uppercase font-bold text-indigo-600 block">Corrected Fields</span>
              <span className="text-lg font-bold text-indigo-900">{correctedCount}</span>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
              <span className="text-[10px] uppercase font-bold text-rose-600 block">Discrepancies</span>
              <span className="text-lg font-bold text-rose-900">{discrepancyCount}</span>
            </div>
          </div>

          {/* Table Breakdown */}
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-100 border-b border-zinc-200 text-zinc-600 text-[11px]">
                  <th className="py-2 px-3 font-semibold">Verification Field</th>
                  <th className="py-2 px-3 font-semibold">SI Document</th>
                  <th className="py-2 px-3 font-semibold">Draft BL</th>
                  <th className="py-2 px-3 font-semibold text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-[11px] font-mono">
                {email.comparisonFields.map((field) => (
                  <tr key={field.id} className="hover:bg-zinc-50">
                    <td className="py-2 px-3 font-sans font-medium text-zinc-900">{field.label}</td>
                    <td className="py-2 px-3 text-zinc-700 truncate max-w-[150px]">{field.siValue}</td>
                    <td className="py-2 px-3 text-zinc-700 truncate max-w-[150px]">{field.blValue}</td>
                    <td className="py-2 px-3 text-right">
                      {field.status === 'matched' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-sans font-medium">
                          <CheckCircle className="w-3 h-3" /> Matched
                        </span>
                      ) : field.status === 'corrected' ? (
                        <span className="inline-flex items-center gap-1 text-indigo-700 font-sans font-medium">
                          Corrected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-sans font-medium">
                          <AlertTriangle className="w-3 h-3" /> Discrepancy
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {email.humanReviewNote && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-900">
              <strong>Human Review Note ({email.humanReviewPriority?.toUpperCase()}):</strong>{' '}
              {email.humanReviewNote}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 bg-zinc-50 text-xs">
          <span className="text-zinc-500 font-mono text-[11px]">
            Action logged: Generated Verification Report
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-medium transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
