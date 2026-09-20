import React, { useState } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { ComparisonField } from '../types';
import { recordUserAction } from '../audit/auditTrailStore';

interface FieldCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailId: string;
  field: ComparisonField | null;
  onApplyCorrection: (fieldId: string, correctedValue: string, reason: string) => void;
}

export const FieldCorrectionModal: React.FC<FieldCorrectionModalProps> = ({
  isOpen,
  onClose,
  emailId,
  field,
  onApplyCorrection,
}) => {
  const [correctedValue, setCorrectedValue] = useState('');
  const [reason, setReason] = useState('');
  const [sourcePreference, setSourcePreference] = useState<'SI' | 'BL' | 'CUSTOM'>('SI');

  React.useEffect(() => {
    if (field) {
      setCorrectedValue(field.siValue);
      setSourcePreference('SI');
      setReason(`Adopting verified SI value (${field.siValue}) as authoritative`);
    }
  }, [field]);

  if (!isOpen || !field) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctedValue.trim()) return;

    // Record User Action in the Audit Trail
    recordUserAction({
      actionType: 'CORRECT_FIELD',
      actionLabel: 'Field Correction',
      emailId,
      description: `Corrected field "${field.label}" to "${correctedValue}". Reason: ${reason.trim() || 'Manual verification adjustment'}`,
      metadata: {
        fieldId: field.id,
        fieldLabel: field.label,
        previousSiValue: field.siValue,
        previousBlValue: field.blValue,
        correctedValue,
        sourcePreference,
        reason: reason.trim() || 'Manual verification adjustment',
      },
    });

    onApplyCorrection(field.id, correctedValue, reason);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        id="field-correction-modal"
        className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-indigo-100 text-indigo-700">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Correct Discrepancy</h3>
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
          <div>
            <label className="block font-medium text-zinc-700 mb-1">Target Field</label>
            <div className="p-2.5 rounded-lg bg-zinc-100 font-semibold text-zinc-900">
              {field.label}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-zinc-200 bg-zinc-50">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                SI Document Value
              </span>
              <p className="font-mono text-zinc-800 text-xs break-all">{field.siValue}</p>
              <button
                type="button"
                onClick={() => {
                  setCorrectedValue(field.siValue);
                  setSourcePreference('SI');
                  setReason(`Adopted SI value: ${field.siValue}`);
                }}
                className="mt-2 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Use SI Value
              </button>
            </div>

            <div className="p-3 rounded-lg border border-zinc-200 bg-zinc-50">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                BL Draft Value
              </span>
              <p className="font-mono text-zinc-800 text-xs break-all">{field.blValue}</p>
              <button
                type="button"
                onClick={() => {
                  setCorrectedValue(field.blValue);
                  setSourcePreference('BL');
                  setReason(`Adopted Draft BL value: ${field.blValue}`);
                }}
                className="mt-2 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Use BL Value
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Authoritative Corrected Value</label>
            <input
              type="text"
              required
              value={correctedValue}
              onChange={(e) => {
                setCorrectedValue(e.target.value);
                setSourcePreference('CUSTOM');
              }}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="Enter corrected value..."
            />
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1">Correction Reason / Audit Note</label>
            <textarea
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="e.g. Carrier confirmed clerical typo; verified against JKDM Form K1 declaration & SI packing list"
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
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              Apply & Record Action
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
