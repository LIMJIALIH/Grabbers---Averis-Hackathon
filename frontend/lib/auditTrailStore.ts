"use client";

import { useSyncExternalStore } from "react";

export type ActionType =
  | "OPEN_EMAIL"
  | "VIEW_ATTACHMENT"
  | "REVIEW_COMPARISON"
  | "APPROVE_RESULT"
  | "CORRECT_FIELD"
  | "REQUEST_HUMAN_REVIEW"
  | "GENERATE_REPORT"
  | "DRAFT_REPLY"
  | "SYSTEM_NOTE";

export interface UserAction {
  id: string;
  timestamp: string;
  timestampIso: string;
  timestampRaw: number;
  actionType: ActionType;
  actionLabel: string;
  emailId?: string;
  description: string;
  documentType?: "SI" | "BL" | "SI_VS_BL";
  metadata?: Record<string, unknown>;
  /** Signed-in email of whoever did it; an audit entry without a name proves nothing. */
  actor?: string;
}

export interface RecordActionParams {
  actionType: ActionType;
  actionLabel?: string;
  emailId?: string;
  description: string;
  documentType?: "SI" | "BL" | "SI_VS_BL";
  metadata?: Record<string, unknown>;
  customTimestamp?: Date;
}

const ACTION_DEFAULT_LABELS: Record<ActionType, string> = {
  OPEN_EMAIL: "Opened email",
  VIEW_ATTACHMENT: "Viewed attachment",
  REVIEW_COMPARISON: "Reviewed SI vs BL comparison",
  APPROVE_RESULT: "Approved",
  CORRECT_FIELD: "Corrected field",
  REQUEST_HUMAN_REVIEW: "Escalated",
  GENERATE_REPORT: "Exported record",
  DRAFT_REPLY: "Drafted reply", // the app copies or opens the mail; it can't know the mail was sent
  SYSTEM_NOTE: "System note",
};

// In-memory only: it disappears on refresh. The UI exposes no way to clear it.
let trail: readonly UserAction[] = [];
const listeners = new Set<() => void>();
let actor = "";
/** Set by the session when the account changes; every later entry carries it. */
export const setActor = (email: string) => { actor = email; };

const stamp = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

export function recordUserAction(p: RecordActionParams): UserAction {
  const now = p.customTimestamp || new Date();
  const action: UserAction = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: stamp.format(now),
    timestampIso: now.toISOString(),
    timestampRaw: now.getTime(),
    actionType: p.actionType,
    actionLabel: p.actionLabel || ACTION_DEFAULT_LABELS[p.actionType] || p.actionType,
    emailId: p.emailId,
    description: p.description,
    documentType: p.documentType,
    metadata: p.metadata,
    actor: actor || undefined,
  };
  trail = [...trail, action]; // new identity per write, which is what useSyncExternalStore needs
  listeners.forEach((l) => l());
  return action;
}

export const getAuditTrail = () => trail;

/** Tests only: no UI calls this. */
export function clearAuditTrail() {
  trail = [];
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useAuditTrail() {
  const actions = useSyncExternalStore(subscribe, getAuditTrail, getAuditTrail);
  return { actions, recordUserAction, clearAuditTrail, count: actions.length };
}
