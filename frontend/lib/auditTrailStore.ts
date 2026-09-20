"use client";

import { useSyncExternalStore } from 'react';
import { ActionType, UserAction } from '@/types/shipping';

/**
 * In-Memory Audit Trail Storage
 * 
 * Strict constraints applied:
 * - Pure in-memory JavaScript array
 * - NO localStorage, NO database, NO Firebase, NO backend
 * - Disappears on page refresh or application restart
 */
const inMemoryAuditTrail: UserAction[] = [];

type AuditListener = (actions: readonly UserAction[]) => void;
const listeners: Set<AuditListener> = new Set();

function notifyListeners() {
  const snapshot = [...inMemoryAuditTrail];
  listeners.forEach((listener) => listener(snapshot));
}

export interface RecordActionParams {
  actionType: ActionType;
  actionLabel?: string;
  emailId?: string;
  description: string;
  documentType?: 'SI' | 'BL' | 'SI_VS_BL';
  metadata?: Record<string, unknown>;
  customTimestamp?: Date;
}

const ACTION_DEFAULT_LABELS: Record<ActionType, string> = {
  OPEN_EMAIL: 'Opened Shipping Email',
  VIEW_ATTACHMENT: 'Viewed Document Attachment',
  REVIEW_COMPARISON: 'Reviewed SI vs BL Comparison',
  APPROVE_RESULT: 'Approved Verification Result',
  CORRECT_FIELD: 'Corrected Discrepancy Field',
  REQUEST_HUMAN_REVIEW: 'Requested Human Review',
  GENERATE_REPORT: 'Generated Verification Report',
  SYSTEM_NOTE: 'System Note',
};

/**
 * Reusable recordUserAction() function that any component can import and invoke.
 */
export function recordUserAction(params: RecordActionParams): UserAction {
  const now = params.customTimestamp || new Date();
  
  // Format readable timestamp: e.g. "Sep 19, 2026 21:42:05"
  const formattedTimestamp = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const action: UserAction = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: formattedTimestamp,
    timestampIso: now.toISOString(),
    timestampRaw: now.getTime(),
    actionType: params.actionType,
    actionLabel: params.actionLabel || ACTION_DEFAULT_LABELS[params.actionType] || params.actionType,
    emailId: params.emailId,
    description: params.description,
    documentType: params.documentType,
    metadata: params.metadata,
  };

  // Prepend or append to in-memory array (store in chronological order)
  inMemoryAuditTrail.push(action);

  // Notify active subscribers
  notifyListeners();

  return action;
}

/**
 * Retrieve the current in-memory audit trail array
 */
export function getAuditTrail(): readonly UserAction[] {
  return inMemoryAuditTrail;
}

/**
 * Clear the in-memory audit trail array
 */
export function clearAuditTrail(): void {
  inMemoryAuditTrail.length = 0;
  notifyListeners();
}

/**
 * Subscribe to audit trail updates
 */
export function subscribeAuditTrail(listener: AuditListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let cachedSnapshot: readonly UserAction[] = [...inMemoryAuditTrail];
function getSnapshot(): readonly UserAction[] {
  // Return snapshot that changes identity only when array changes
  return cachedSnapshot;
}

// Update cached snapshot on notification
listeners.add((current) => {
  cachedSnapshot = current;
});

/**
 * React hook to consume the in-memory audit trail
 */
export function useAuditTrail() {
  const actions = useSyncExternalStore(
    subscribeAuditTrail,
    getSnapshot,
    getSnapshot
  );

  return {
    actions,
    recordUserAction,
    clearAuditTrail,
    count: actions.length,
  };
}
