"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, FileText, Loader2, Plus, Upload, X } from "lucide-react";
import { QueueStatusRow, QueueTable } from "@/components/QueueTable";
import { Loading, Modal, OfflineNote, Skeleton } from "@/components/ui";
import { useCases } from "@/lib/app-state";

type UploadResult = {
  case: { id: string; vessel: string; company: string };
  classification: {
    category: string;
    confidence: number;
    source: "bert" | "gemma_fallback" | "bert_low_confidence";
    requires_human_review: boolean;
  };
  normalization_source: "json" | "eml" | "text" | "gemma";
  gemma_used: boolean;
  warnings: string[];
  verification: { status?: string; fields?: unknown[] } | null;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_TYPES = /\.(pdf|docx|xlsx|txt|png|jpe?g)$/i;
const EMAIL_TYPES = /\.(json|eml|txt|pdf|docx|png|jpe?g)$/i;

export default function QueuePage() {
  const { load, offline, reload } = useCases();
  const [uploadOpen, setUploadOpen] = useState(false);

  if (load === "loading") {
    return (
      <Loading>
        <Skeleton className="h-20" />
        <Skeleton className="h-[420px]" />
      </Loading>
    );
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">Verification queue</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-ink-2">
            Review classified emails, inspect document differences, and resolve exceptions.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
          <Plus size={16} aria-hidden /> New verification
        </button>
      </header>

      {offline && <OfflineNote onRetry={reload} />}
      <QueueStatusRow />
      <QueueTable />

      <NewVerificationModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

function NewVerificationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);

  const reset = () => {
    setEmail(null);
    setAttachments([]);
    setError("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  function chooseEmail(file: File | null) {
    setError("");
    setResult(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is larger than 25 MB.`);
      return;
    }
    if (!EMAIL_TYPES.test(file.name)) {
      setError(`${file.name} is not a supported email input type.`);
      return;
    }
    setEmail(file);
  }

  function chooseAttachments(files: File[]) {
    setError("");
    setResult(null);
    const invalid = files.find((file) => file.size > MAX_FILE_BYTES || !ATTACHMENT_TYPES.test(file.name));
    if (invalid) {
      setError(`${invalid.name} must be a supported document no larger than 25 MB.`);
      return;
    }
    setAttachments(files);
  }

  async function submit() {
    if (!email || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("email", email);
      attachments.forEach((file) => form.append("attachments", file));
      const response = await fetch("/api/v1/verifications", { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = typeof payload?.detail === "string" ? payload.detail : `Backend answered ${response.status}`;
        throw new Error(detail);
      }
      setResult(payload as UploadResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The verification could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={result ? "Verification prepared" : "New verification"}>
      {result ? (
        <div className="grid gap-4">
          <div className={`flex items-start gap-3 rounded-[var(--radius-control)] p-4 ${result.classification.requires_human_review ? "bg-review-tint text-review-ink" : "bg-ok-tint text-ok"}`}>
            {result.classification.requires_human_review
              ? <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
              : <CheckCircle2 size={20} className="mt-0.5 shrink-0" aria-hidden />}
            <div>
              <p className="font-semibold">{result.classification.requires_human_review ? `${result.case.id} needs classification review` : `${result.case.id} was processed successfully`}</p>
              <p className="mt-0.5 text-[13px] opacity-90">{result.case.vessel}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-control)] border border-line p-4 text-[13px]">
            <div><dt className="label">Category</dt><dd className="mt-1 font-medium">{result.classification.category.replaceAll("_", " ")}</dd></div>
            <div><dt className="label">Confidence</dt><dd className="num mt-1 font-medium">{Math.round(result.classification.confidence * 100)}%</dd></div>
            <div><dt className="label">Email parser</dt><dd className="mt-1 font-medium">{result.normalization_source === "gemma" ? "Gemma" : result.normalization_source.toUpperCase()}</dd></div>
            <div><dt className="label">Classifier</dt><dd className="mt-1 font-medium">{result.classification.source === "gemma_fallback" ? "BERT + Gemma" : result.classification.source === "bert_low_confidence" ? "BERT · review" : "BERT"}</dd></div>
            <div><dt className="label">Attachments</dt><dd className="num mt-1 font-medium">{attachments.length}</dd></div>
            <div><dt className="label">Any Gemma step</dt><dd className="mt-1 font-medium">{result.gemma_used ? "Used" : "Not needed"}</dd></div>
          </dl>
          {result.warnings.length > 0 && (
            <div className="rounded-[var(--radius-control)] border border-review bg-review-tint p-3 text-[13px] text-review-ink">
              {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={reset}>Prepare another</button>
            <button className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-ink-2">
            Upload an email as JSON, EML, text, document, or image. Standard formats stay local; Gemma normalizes formats the local parser cannot read.
          </p>
          <label className="group grid min-h-40 cursor-pointer place-items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2 p-6 text-center transition-colors hover:border-burgundy">
            <span className="grid justify-items-center gap-2">
              <span className="grid size-10 place-items-center rounded-full bg-burgundy-tint text-burgundy"><Upload size={18} aria-hidden /></span>
              <strong>Choose the email input</strong>
              <span className="text-[12px] text-ink-3-on-2">JSON, EML, TXT, PDF, DOCX or image · 25 MB</span>
            </span>
            <input ref={inputRef} className="sr-only" type="file" accept=".json,.eml,.txt,.pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => chooseEmail(event.target.files?.[0] ?? null)} />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-control)] border border-line px-4 py-3 transition-colors hover:bg-surface-2">
            <span><strong className="block text-[13px]">Optional SI / BL attachments</strong><span className="text-[12px] text-ink-3">PDF, DOCX, XLSX, TXT or images</span></span>
            <span className="btn btn-sm">Choose files</span>
            <input ref={attachmentInputRef} className="sr-only" type="file" multiple accept=".pdf,.docx,.xlsx,.txt,.png,.jpg,.jpeg" onChange={(event) => chooseAttachments(Array.from(event.target.files ?? []))} />
          </label>

          {(email || attachments.length > 0) && (
            <div className="grid gap-2" aria-label="Selected files">
              {email && <FileRow file={email} email onRemove={() => setEmail(null)} />}
              {attachments.map((file, index) => (
                <FileRow key={`${file.name}-${file.size}-${index}`} file={file} onRemove={() => setAttachments((all) => all.filter((_, i) => i !== index))} />
              ))}
            </div>
          )}
          {error && <p role="alert" className="rounded-[var(--radius-control)] bg-defect-tint px-3 py-2 text-[13px] text-defect">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={!email || busy}>
              {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <FileText size={16} aria-hidden />}
              {busy ? "Processing…" : "Run verification"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function FileRow({ file, email = false, onRemove }: { file: File; email?: boolean; onRemove: () => void }) {
  const Icon = email ? FileJson : FileText;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2">
      <Icon size={17} className="shrink-0 text-burgundy" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{file.name}</p>
        <p className="text-[11px] text-ink-3">{email ? "Email JSON" : "Attachment"} · {formatBytes(file.size)}</p>
      </div>
      <button className="icon-btn size-8" onClick={onRemove} aria-label={`Remove ${file.name}`}><X size={15} /></button>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
