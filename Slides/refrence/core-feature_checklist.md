# DocuVerify Core Feature Checklist

Use `(Flagged)` beside any item that needs further changes or follow-up work.

## Inbox and email handling

- [ ] Google OAuth sign-in and Gmail connection
- [ ] Fetch emails, metadata, body text, and attachments
- [ ] Verification Inbox with search, filters, case status, and priority
- [ ] Email cleaning: remove signatures, reply chains, and HTML noise
- [ ] Classify emails: document comparison, SI request, general, spam, and other
- [ ] Route relevant SI/BL comparison emails into the processing workflow

## Document ingestion and extraction

- [ ] Support PDF, scanned PDF/OCR, DOCX, XLSX, and TXT attachments
- [ ] Identify Shipping Instruction (SI) and Bill of Lading (BL) documents
- [ ] Extract shipper
- [ ] Extract consignee
- [ ] Extract notify party
- [ ] Extract port of loading
- [ ] Extract port of discharge
- [ ] Extract container count
- [ ] Extract gross weight (kg)
- [ ] Show extracted values, confidence scores, and source evidence/location

## Verification and review

- [ ] Normalize port aliases, party-name variations, and weight units
- [ ] Compare SI and BL values (Flagged)
  - [ ] Show major changes with a clear visual difference indicator (Flagged)
- [ ] Flag mismatches, missing values, and unreadable documents
- [ ] Human-review workspace with side-by-side SI/BL document viewing
- [ ] Let reviewers correct extracted fields and record correction reasons
- [ ] Require review for low-confidence, missing, unreadable, or conflicting cases
- [ ] Approval, rejection/escalation, and "Approve & Submit" workflow

## Reporting and operations

- [ ] Audit trail for extraction, edits, decisions, timestamps, and reviewer actions
- [ ] Download/export a structured JSON discrepancy report
- [ ] Submit completed results to the required evaluation/integration endpoint
- [ ] Dashboard views for overview, verification inbox, documents, and audit trail
- [ ] Notifications for cases requiring attention (Flagged)

## Product quality and security

- [ ] Responsive, accessible interface with keyboard support and clear status indicators
- [ ] Light and dark mode
- [ ] Secure credential configuration and API access
- [ ] File validation and safe attachment handling
