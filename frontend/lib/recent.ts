const KEY = "docuverify.recent";
export type Recent = { id: string; at: number };

/** Demo showcase, pinned to the top of the default queue: one Verified, one Defect (many Differs), one Needs review (many Missing). */
export const DEMO_FIRST = ["email_001", "email_004", "email_009"];

export function readRecent(): Recent[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Newest first, one entry per email, keep the last 3. */
export function recordOpened(id: string) {
  try {
    const next = [{ id, at: Date.now() }, ...readRecent().filter((r) => r.id !== id)].slice(0, 3);
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
