import React, { useState } from 'react';
import {
  Mail,
  FileText,
  GitCompare,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  FileSpreadsheet,
  Edit3,
  Ship,
  Calendar,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Info,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { ComparisonField, ShippingEmail, VerificationStatus } from '../types';
import { recordUserAction } from '../audit/auditTrailStore';
import { FieldCorrectionModal } from './FieldCorrectionModal';
import { HumanReviewModal } from './HumanReviewModal';
import { DocumentAttachmentModal } from './DocumentAttachmentModal';
import { ReportModal } from './ReportModal';

interface ShippingVerificationViewProps {
  emails: ShippingEmail[];
  selectedEmailId: string;
  onSelectEmail: (emailId: string) => void;
  onUpdateEmail: (updatedEmail: ShippingEmail) => void;
}

export const ShippingVerificationView: React.FC<ShippingVerificationViewProps> = ({
  emails,
  selectedEmailId,
  onSelectEmail,
  onUpdateEmail,
}) => {
  const currentEmail = emails.find((e) => e.id === selectedEmailId) || emails[0];

  // Active view tab: 'comparison' | 'documents'
  const [activeTab, setActiveTab] = useState<'comparison' | 'documents'>('comparison');

  // Modals state
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [activeDocType, setActiveDocType] = useState<'SI' | 'BL'>('SI');
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [fieldToCorrect, setFieldToCorrect] = useState<ComparisonField | null>(null);
  const [isHumanReviewOpen, setIsHumanReviewOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [generatedReportId, setGeneratedReportId] = useState('');

  // Counts
  const matchedCount = currentEmail.comparisonFields.filter((f) => f.status === 'matched').length;
  const discrepancyCount = currentEmail.comparisonFields.filter((f) => f.status === 'discrepancy').length;
  const correctedCount = currentEmail.comparisonFields.filter((f) => f.status === 'corrected').length;

  // Handler: Selecting/Opening an Email
  const handleEmailClick = (email: ShippingEmail) => {
    if (email.id === selectedEmailId) return;

    // Call reusable recordUserAction
    recordUserAction({
      actionType: 'OPEN_EMAIL',
      actionLabel: 'Opened Shipping Email',
      emailId: email.id,
      description: `Opened email case ${email.id} from ${email.sender} (${email.carrier})`,
      metadata: {
        subject: email.subject,
        carrier: email.carrier,
        vessel: email.vesselName,
        voyage: email.voyageNumber,
        status: email.status,
      },
    });

    onSelectEmail(email.id);
  };

  // Handler: View Attachment
  const handleViewAttachment = (docType: 'SI' | 'BL') => {
    setActiveDocType(docType);
    const doc = docType === 'SI' ? currentEmail.siDocument : currentEmail.blDocument;

    // Call reusable recordUserAction
    recordUserAction({
      actionType: 'VIEW_ATTACHMENT',
      actionLabel: `Viewed ${docType} Attachment`,
      emailId: currentEmail.id,
      documentType: docType,
      description: `Inspected ${docType === 'SI' ? 'Shipping Instruction' : 'Ocean Draft BL'} attachment (${doc.fileName})`,
      metadata: {
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        carrier: currentEmail.carrier,
        uploadedOrIssuedAt: docType === 'SI' ? currentEmail.siDocument.uploadedAt : currentEmail.blDocument.issuedAt,
      },
    });

    setIsAttachmentOpen(true);
  };

  // Handler: Review Comparison Results
  const handleReviewComparisonTab = () => {
    setActiveTab('comparison');

    // Call reusable recordUserAction
    recordUserAction({
      actionType: 'REVIEW_COMPARISON',
      actionLabel: 'Reviewed Comparison Matrix',
      emailId: currentEmail.id,
      description: `Evaluated automated comparison matrix for ${currentEmail.id}: ${matchedCount} matched, ${discrepancyCount} discrepancies, ${correctedCount} corrected`,
      metadata: {
        matchedCount,
        discrepancyCount,
        correctedCount,
        discrepancyFields: currentEmail.comparisonFields
          .filter((f) => f.status === 'discrepancy')
          .map((f) => f.label),
      },
    });
  };

  // Handler: Approve Result
  const handleApproveResult = () => {
    const updatedEmail: ShippingEmail = {
      ...currentEmail,
      status: 'approved',
    };
    onUpdateEmail(updatedEmail);

    // Call reusable recordUserAction
    recordUserAction({
      actionType: 'APPROVE_RESULT',
      actionLabel: 'Approved Verification Result',
      emailId: currentEmail.id,
      description: `Approved shipping documentation verification for ${currentEmail.id} (${currentEmail.vesselName} / ${currentEmail.carrier})`,
      metadata: {
        approvalStatus: 'Approved & Cleared',
        blNo: currentEmail.billOfLadingNo,
        siNo: currentEmail.shippingInstructionNo,
        totalFieldsVerified: currentEmail.comparisonFields.length,
        discrepanciesResolved: correctedCount,
      },
    });
  };

  // Handler: Correct Field
  const handleOpenCorrection = (field: ComparisonField) => {
    setFieldToCorrect(field);
    setIsCorrectionOpen(true);
  };

  const handleApplyCorrection = (fieldId: string, correctedValue: string, reason: string) => {
    const updatedFields = currentEmail.comparisonFields.map((f) => {
      if (f.id === fieldId) {
        return {
          ...f,
          status: 'corrected' as const,
          correctedValue,
          correctionReason: reason,
        };
      }
      return f;
    });

    const hasRemainingDiscrepancies = updatedFields.some((f) => f.status === 'discrepancy');
    const newStatus: VerificationStatus = hasRemainingDiscrepancies ? 'pending' : 'corrected';

    const updatedEmail: ShippingEmail = {
      ...currentEmail,
      status: newStatus,
      comparisonFields: updatedFields,
    };

    onUpdateEmail(updatedEmail);
  };

  // Handler: Request Human Review
  const handleRequestHumanReview = () => {
    setIsHumanReviewOpen(true);
  };

  const handleHumanReviewSubmitted = (priority: 'low' | 'medium' | 'high', notes: string) => {
    const updatedEmail: ShippingEmail = {
      ...currentEmail,
      status: 'under_review',
      humanReviewPriority: priority,
      humanReviewNote: notes,
    };
    onUpdateEmail(updatedEmail);
  };

  // Handler: Generate Report
  const handleGenerateReport = () => {
    const reportId = `VER-REP-${Date.now().toString().slice(-6)}`;
    setGeneratedReportId(reportId);

    // Call reusable recordUserAction
    recordUserAction({
      actionType: 'GENERATE_REPORT',
      actionLabel: 'Generated Verification Report',
      emailId: currentEmail.id,
      description: `Generated Verification & Discrepancy Certificate #${reportId} for ${currentEmail.id}`,
      metadata: {
        reportId,
        emailId: currentEmail.id,
        carrier: currentEmail.carrier,
        vessel: currentEmail.vesselName,
        matchedFields: matchedCount,
        correctedFields: correctedCount,
        discrepancies: discrepancyCount,
        status: currentEmail.status,
      },
    });

    setIsReportOpen(true);
  };

  return (
    <div id="shipping-verification-view" className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
      {/* Top Workflow Bar */}
      <div className="bg-white border-b border-zinc-200 px-6 py-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Email Inbox Selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 shrink-0 mr-1">
              Case Emails:
            </span>
            {emails.map((em) => {
              const isSelected = em.id === currentEmail.id;
              const hasDiscrepancy = em.comparisonFields.some((f) => f.status === 'discrepancy');

              return (
                <button
                  key={em.id}
                  id={`email-item-${em.id}`}
                  onClick={() => handleEmailClick(em)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Mail className={`w-3.5 h-3.5 ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`} />
                  <span className="font-mono">{em.id}</span>
                  {hasDiscrepancy && em.status !== 'approved' && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-amber-400' : 'bg-amber-500'
                      }`}
                    />
                  )}
                  {em.status === 'approved' && (
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-emerald-600'}`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Core Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="action-btn-human-review"
              onClick={handleRequestHumanReview}
              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Request Review
            </button>

            <button
              id="action-btn-generate-report"
              onClick={handleGenerateReport}
              className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Generate Report
            </button>

            <button
              id="action-btn-approve-result"
              onClick={handleApproveResult}
              disabled={currentEmail.status === 'approved'}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {currentEmail.status === 'approved' ? 'Approved' : 'Approve Verification'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Email Header Card */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
                  {currentEmail.id}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize border ${
                    currentEmail.status === 'approved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : currentEmail.status === 'under_review'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : currentEmail.status === 'corrected'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  Status: {currentEmail.status.replace('_', ' ')}
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  Received {currentEmail.receivedDate}
                </span>
              </div>

              <h2 className="text-base font-semibold text-zinc-900 leading-snug">
                {currentEmail.subject}
              </h2>

              <p className="text-xs text-zinc-600">
                From: <span className="font-medium text-zinc-800">{currentEmail.sender}</span>{' '}
                <span className="text-zinc-400 font-mono">&lt;{currentEmail.senderEmail}&gt;</span>
              </p>
            </div>

            {/* Quick Attachment Launchers */}
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
              <button
                id="btn-view-si-attachment"
                onClick={() => handleViewAttachment('SI')}
                className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-800 text-xs font-medium transition-colors flex items-center gap-2 shadow-xs"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <div className="text-left">
                  <div className="leading-tight font-semibold">View SI Attachment</div>
                  <div className="text-[10px] text-blue-600 font-mono">{currentEmail.siDocument.fileName}</div>
                </div>
              </button>

              <button
                id="btn-view-bl-attachment"
                onClick={() => handleViewAttachment('BL')}
                className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 text-xs font-medium transition-colors flex items-center gap-2 shadow-xs"
              >
                <FileText className="w-4 h-4 text-emerald-600" />
                <div className="text-left">
                  <div className="leading-tight font-semibold">View Draft BL</div>
                  <div className="text-[10px] text-emerald-600 font-mono">{currentEmail.blDocument.fileName}</div>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-4 pt-4 border-t border-zinc-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-[11px] text-zinc-400 uppercase font-semibold block">Carrier</span>
              <span className="font-medium text-zinc-800">{currentEmail.carrier}</span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 uppercase font-semibold block">Vessel & Voyage</span>
              <span className="font-medium text-zinc-800">
                {currentEmail.vesselName} / {currentEmail.voyageNumber}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 uppercase font-semibold block">SI Reference</span>
              <span className="font-mono font-medium text-zinc-800">{currentEmail.shippingInstructionNo}</span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 uppercase font-semibold block">BL Reference</span>
              <span className="font-mono font-medium text-zinc-800">{currentEmail.billOfLadingNo}</span>
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center justify-between border-b border-zinc-200">
          <div className="flex items-center gap-4">
            <button
              id="tab-comparison-results"
              onClick={handleReviewComparisonTab}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'comparison'
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <GitCompare className="w-4 h-4" />
              <span>SI vs BL Comparison Matrix</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  discrepancyCount > 0 ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {discrepancyCount > 0 ? `${discrepancyCount} discrepancies` : 'All matched'}
              </span>
            </button>

            <button
              id="tab-documents-side-by-side"
              onClick={() => setActiveTab('documents')}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'documents'
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Side-by-Side Document Comparison</span>
            </button>
          </div>

          <span className="text-xs text-zinc-400 hidden sm:inline">
            Each review and correction is recorded into the in-memory audit trail
          </span>
        </div>

        {/* TAB 1: Comparison Matrix */}
        {activeTab === 'comparison' && (
          <div className="space-y-4">
            {/* Discrepancy summary alert if present */}
            {discrepancyCount > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">
                      Discrepancies Detected ({discrepancyCount} Unresolved)
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      Differences identified between the Shipping Instruction and Carrier Draft Bill of Lading.
                      You can correct fields or escalate for human review.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleRequestHumanReview}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors shadow-xs"
                  >
                    Escalate Case
                  </button>
                </div>
              </div>
            )}

            {/* Comparison Table */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 text-xs">
                    <th className="py-3 px-4 font-semibold w-1/4">Field Attribute</th>
                    <th className="py-3 px-4 font-semibold w-1/3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>Shipping Instruction (SI)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 font-semibold w-1/3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Draft Bill of Lading (BL)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 font-semibold text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-xs">
                  {currentEmail.comparisonFields.map((field) => {
                    const isDiscrepancy = field.status === 'discrepancy';
                    const isCorrected = field.status === 'corrected';

                    return (
                      <tr
                        key={field.id}
                        className={`transition-colors ${
                          isDiscrepancy
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : isCorrected
                            ? 'bg-indigo-50/30 hover:bg-indigo-50/60'
                            : 'hover:bg-zinc-50'
                        }`}
                      >
                        {/* Field Label */}
                        <td className="py-3 px-4 align-top">
                          <div className="font-semibold text-zinc-900">{field.label}</div>
                          {isCorrected && (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800">
                              Corrected manually
                            </span>
                          )}
                          {isDiscrepancy && (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-800">
                              Mismatch flagged
                            </span>
                          )}
                        </td>

                        {/* SI Value */}
                        <td className="py-3 px-4 align-top font-mono text-zinc-800">
                          <div className="break-words">{field.siValue}</div>
                        </td>

                        {/* BL Value */}
                        <td className="py-3 px-4 align-top font-mono text-zinc-800">
                          <div className="break-words">{field.blValue}</div>
                          {isCorrected && field.correctedValue && (
                            <div className="mt-1 text-[11px] font-sans text-indigo-700">
                              <strong>Applied:</strong> {field.correctedValue}
                              {field.correctionReason && (
                                <span className="block text-zinc-500 text-[10px]">
                                  Reason: {field.correctionReason}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 align-top text-right">
                          {isDiscrepancy ? (
                            <button
                              id={`correct-field-${field.id}-btn`}
                              onClick={() => handleOpenCorrection(field)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium text-xs transition-colors shadow-xs"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Correct Field
                            </button>
                          ) : isCorrected ? (
                            <button
                              onClick={() => handleOpenCorrection(field)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 text-xs"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Matched
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Side-by-Side Documents View */}
        {activeTab === 'documents' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SI Column */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-blue-100 text-blue-700">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900">Shipping Instruction (SI)</h3>
                    <p className="text-[11px] text-zinc-500 font-mono">{currentEmail.siDocument.fileName}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleViewAttachment('SI')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  Expand <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Shipper</span>
                  <p className="text-zinc-800">{currentEmail.siDocument.shipper}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Consignee</span>
                  <p className="text-zinc-800">{currentEmail.siDocument.consignee}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Port Pair</span>
                  <p className="font-mono text-zinc-800">
                    {currentEmail.siDocument.portOfLoading} &rarr; {currentEmail.siDocument.portOfDischarge}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-zinc-50 font-mono text-[11px]">
                  <div>
                    <span className="text-[9px] uppercase text-zinc-400 block">Container</span>
                    <span className="font-semibold">{currentEmail.siDocument.containerNo}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-zinc-400 block">Seal</span>
                    <span className="font-semibold">{currentEmail.siDocument.sealNo}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-zinc-400 block">Weight</span>
                    <span className="font-semibold">{currentEmail.siDocument.grossWeight}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* BL Column */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-emerald-100 text-emerald-700">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900">Carrier Draft Bill of Lading (BL)</h3>
                    <p className="text-[11px] text-zinc-500 font-mono">{currentEmail.blDocument.fileName}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleViewAttachment('BL')}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1"
                >
                  Expand <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Shipper</span>
                  <p className="text-zinc-800">{currentEmail.blDocument.shipper}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Consignee</span>
                  <p className="text-zinc-800">{currentEmail.blDocument.consignee}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Port Pair</span>
                  <p className="font-mono text-zinc-800">
                    {currentEmail.blDocument.portOfLoading} &rarr; {currentEmail.blDocument.portOfDischarge}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-zinc-50 font-mono text-[11px]">
                  <div>
                    <span className="text-[9px] uppercase text-zinc-400 block">Container</span>
                    <span className="font-semibold">{currentEmail.blDocument.containerNo}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-zinc-400 block">Seal</span>
                    <span className="font-semibold">{currentEmail.blDocument.sealNo}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-zinc-400 block">Weight</span>
                    <span className="font-semibold">{currentEmail.blDocument.grossWeight}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <DocumentAttachmentModal
        isOpen={isAttachmentOpen}
        onClose={() => setIsAttachmentOpen(false)}
        email={currentEmail}
        docType={activeDocType}
      />

      <FieldCorrectionModal
        isOpen={isCorrectionOpen}
        onClose={() => setIsCorrectionOpen(false)}
        emailId={currentEmail.id}
        field={fieldToCorrect}
        onApplyCorrection={handleApplyCorrection}
      />

      <HumanReviewModal
        isOpen={isHumanReviewOpen}
        onClose={() => setIsHumanReviewOpen(false)}
        emailId={currentEmail.id}
        discrepanciesCount={discrepancyCount}
        onRequestSubmitted={handleHumanReviewSubmitted}
      />

      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        email={currentEmail}
        reportId={generatedReportId}
      />
    </div>
  );
};
