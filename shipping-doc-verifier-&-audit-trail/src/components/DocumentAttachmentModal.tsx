import React from 'react';
import { X, FileText, Download, CheckCircle, ShieldCheck } from 'lucide-react';
import { ShippingEmail } from '../types';

interface DocumentAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: ShippingEmail;
  docType: 'SI' | 'BL';
}

export const DocumentAttachmentModal: React.FC<DocumentAttachmentModalProps> = ({
  isOpen,
  onClose,
  email,
  docType,
}) => {
  if (!isOpen) return null;

  const isSI = docType === 'SI';
  const doc = isSI ? email.siDocument : email.blDocument;
  const docTitle = isSI ? 'Shipping Instruction (SI)' : 'Ocean Bill of Lading (Draft BL)';
  const docRef = isSI ? email.shippingInstructionNo : email.billOfLadingNo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        id="attachment-modal"
        className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isSI ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">{docTitle}</h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-200 text-zinc-800">
                  {docRef}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                File: <span className="font-mono text-zinc-700">{doc.fileName}</span> ({doc.fileSize})
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

        {/* Content Viewer */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-100/80 border border-zinc-200 font-mono text-[11px]">
            <span>Carrier: <strong>{email.carrier}</strong></span>
            <span>Vessel/Voyage: <strong>{email.vesselName} / {email.voyageNumber}</strong></span>
            <span>Email Ref: <strong>{email.id}</strong></span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg border border-zinc-200 bg-white space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block">
                1. Shipper / Exporter
              </span>
              <p className="font-medium text-zinc-800 leading-relaxed">{doc.shipper}</p>
            </div>

            <div className="p-3.5 rounded-lg border border-zinc-200 bg-white space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block">
                2. Consignee
              </span>
              <p className="font-medium text-zinc-800 leading-relaxed">{doc.consignee}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg border border-zinc-200 bg-white space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block">
                3. Port of Loading (POL)
              </span>
              <p className="font-mono font-medium text-zinc-800">{doc.portOfLoading}</p>
            </div>

            <div className="p-3.5 rounded-lg border border-zinc-200 bg-white space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block">
                4. Port of Discharge (POD)
              </span>
              <p className="font-mono font-medium text-zinc-800">{doc.portOfDischarge}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-zinc-200 bg-white space-y-1">
            <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block">
              5. Goods & Commercial Cargo Description
            </span>
            <p className="font-medium text-zinc-800 leading-relaxed">{doc.cargoDescription}</p>
          </div>

          <div className="grid grid-cols-4 gap-3 p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 font-mono text-center">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block mb-1">
                Container
              </span>
              <span className="font-semibold text-zinc-800 text-xs">{doc.containerNo}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block mb-1">
                Seal No
              </span>
              <span className="font-semibold text-zinc-800 text-xs">{doc.sealNo}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block mb-1">
                Gross Weight
              </span>
              <span className="font-semibold text-zinc-800 text-xs">{doc.grossWeight}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block mb-1">
                Measurement
              </span>
              <span className="font-semibold text-zinc-800 text-xs">{doc.measurement}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-blue-50/60 rounded-lg border border-blue-200/60 text-blue-900 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Document digital hash verified. Verified against automated parser snapshot.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 bg-zinc-50 text-xs">
          <span className="text-zinc-500 font-mono text-[11px]">
            Action logged: Viewed {docType} Attachment
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 font-medium transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
