/**
 * Analytics consent — persisted locally. Non-essential analytics and session
 * replay stay off until the visitor explicitly grants consent.
 */

export type ConsentStatus = "unknown" | "granted" | "denied";

export const CONSENT_STORAGE_KEY = "pv_analytics_consent_v1";

export function readConsent(): ConsentStatus {
  try {
    const v = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (v === "granted" || v === "denied") return v;
  } catch {
    /* private mode / blocked storage */
  }
  return "unknown";
}

export function writeConsent(status: "granted" | "denied"): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, status);
  } catch {
    /* ignore */
  }
}

export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
