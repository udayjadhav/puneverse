import { useEffect, useState } from "react";
import { applyConsent, isAnalyticsConfigured } from "./client";
import { readConsent, type ConsentStatus } from "./consent";

/**
 * Minimal consent notice — only when analytics is configured and preference
 * is unset. No visitor data is shown on the public site.
 */
export function ConsentBanner() {
  const [status, setStatus] = useState<ConsentStatus>("unknown");
  const [visible, setVisible] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    const s = readConsent();
    setStatus(s);
    setVisible(s === "unknown");
  }, []);

  if (!isAnalyticsConfigured()) return null;

  const choose = async (next: "granted" | "denied") => {
    await applyConsent(next);
    setStatus(next);
    setVisible(false);
    setPrefsOpen(false);
  };

  return (
    <>
      {visible && (
        <div
          className="pointer-events-auto fixed right-3 bottom-3 z-50 max-w-sm rounded-xl border border-white/15 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-2xl backdrop-blur"
          role="dialog"
          aria-label="Analytics consent"
          data-testid="analytics-consent-banner"
        >
          <p className="font-medium text-slate-100">Help improve PuneVerse?</p>
          <p className="mt-1.5 leading-relaxed text-slate-400">
            We use private analytics (PostHog) to learn which places people explore. No names or
            emails. You can change this later.{" "}
            <a href="https://github.com/udayjadhav/puneverse/blob/main/docs/ANALYTICS.md" className="text-[#7eb8ff] underline-offset-2 hover:underline">
              Details
            </a>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-full bg-[#f5a524] px-3 py-1.5 text-xs font-semibold text-slate-950"
              onClick={() => void choose("granted")}
              data-testid="analytics-consent-accept"
            >
              Accept
            </button>
            <button
              type="button"
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200"
              onClick={() => void choose("denied")}
              data-testid="analytics-consent-reject"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {!visible && status !== "unknown" && (
        <button
          type="button"
          className="pointer-events-auto fixed bottom-3 left-3 z-40 rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[10px] text-slate-400 backdrop-blur hover:text-slate-200"
          onClick={() => setPrefsOpen((v) => !v)}
          data-testid="analytics-prefs-toggle"
          aria-expanded={prefsOpen}
        >
          Analytics: {status === "granted" ? "on" : "off"}
        </button>
      )}

      {prefsOpen && (
        <div
          className="pointer-events-auto fixed bottom-12 left-3 z-50 max-w-xs rounded-lg border border-white/15 bg-slate-950/95 p-3 text-xs text-slate-300 shadow-xl"
          data-testid="analytics-prefs"
        >
          <p className="mb-2 text-slate-400">Change analytics preference</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-full bg-[#f5a524] px-2.5 py-1 text-slate-950"
              onClick={() => void choose("granted")}
            >
              Accept
            </button>
            <button
              type="button"
              className="rounded-full border border-white/15 px-2.5 py-1"
              onClick={() => void choose("denied")}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </>
  );
}
