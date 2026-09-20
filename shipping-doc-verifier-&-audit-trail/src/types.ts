export type ActionType =
  | 'OPEN_EMAIL'
  | 'VIEW_ATTACHMENT'
  | 'REVIEW_COMPARISON'
  | 'APPROVE_RESULT'
  | 'CORRECT_FIELD'
  | 'REQUEST_HUMAN_REVIEW'
  | 'GENERATE_REPORT'
  | 'SYSTEM_NOTE';

export interface UserAction {
  id: string;
  timestamp: string; // Formatted readable timestamp
  timestampIso: string; // ISO-8601 string
  timestampRaw: number; // Date.now() for accurate sorting
  actionType: ActionType;
  actionLabel: string;
  emailId?: string;
  description: string;
  documentType?: 'SI' | 'BL' | 'SI_VS_BL';
  metadata?: Record<string, unknown>;
}

export type VerificationStatus = 'pending' | 'under_review' | 'corrected' | 'approved';

export interface ComparisonField {
  id: string;
  label: string;
  siValue: string;
  blValue: string;
  isMatch: boolean;
  status: 'matched' | 'discrepancy' | 'corrected';
  correctedValue?: string;
  correctionReason?: string;
}

export interface ShippingEmail {
  id: string; // e.g. EML-2024-8841
  sender: string;
  senderEmail: string;
  subject: string;
  receivedDate: string;
  vesselName: string;
  voyageNumber: string;
  billOfLadingNo: string;
  shippingInstructionNo: string;
  carrier: string;
  status: VerificationStatus;
  siDocument: {
    fileName: string;
    uploadedAt: string;
    fileSize: string;
    shipper: string;
    consignee: string;
    notifyParty: string;
    portOfLoading: string;
    portOfDischarge: string;
    cargoDescription: string;
    containerNo: string;
    sealNo: string;
    grossWeight: string;
    measurement: string;
  };
  blDocument: {
    fileName: string;
    issuedAt: string;
    fileSize: string;
    shipper: string;
    consignee: string;
    notifyParty: string;
    portOfLoading: string;
    portOfDischarge: string;
    cargoDescription: string;
    containerNo: string;
    sealNo: string;
    grossWeight: string;
    measurement: string;
  };
  comparisonFields: ComparisonField[];
  humanReviewNote?: string;
  humanReviewPriority?: 'low' | 'medium' | 'high';
}
