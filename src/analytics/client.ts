/**
 * PostHog Cloud client — fail-closed when misconfigured or consent denied.
 * Never throws into the app. Single init under React StrictMode.
 */

import type { PostHog } from "posthog-js";
import { readConsent, writeConsent, type ConsentStatus } from "./consent";
import { PV_EVENTS, sanitizeProps, type PvEventName, type PvProps } from "./events";

export interface AnalyticsConfig {
  key: string;
  host: string;
  enabled: boolean;
}

let client: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;
let consent: ConsentStatus = "unknown";
let pageViewSent = false;

export function loadAnalyticsConfig(): AnalyticsConfig {
  const key = (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim() ?? "";
  const host =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() || "https://us.i.posthog.com";
  const flag = (import.meta.env.VITE_ANALYTICS_ENABLED as string | undefined)?.trim().toLowerCase();
  // Disabled by default in local/dev unless explicitly enabled.
  const enabled =
    flag === "true" || flag === "1" || (flag !== "false" && flag !== "0" && import.meta.env.PROD && !!key);
  return { key, host, enabled: enabled && !!key };
}

export function isAnalyticsConfigured(): boolean {
  const c = loadAnalyticsConfig();
  return c.enabled && !!c.key;
}

export function getConsentState(): ConsentStatus {
  return consent;
}

function canCapture(): boolean {
  return !!client && consent === "granted" && isAnalyticsConfigured();
}

async function ensureClient(): Promise<PostHog | null> {
  if (client) return client;
  if (initPromise) return initPromise;
  const cfg = loadAnalyticsConfig();
  if (!cfg.enabled || !cfg.key) return null;

  initPromise = (async () => {
    try {
      const { default: posthog } = await import("posthog-js");
      if (client) return client;
      posthog.init(cfg.key, {
        api_host: cfg.host,
        ui_host: cfg.host.includes("eu.") ? "https://eu.posthog.com" : "https://us.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false,
        capture_pageleave: true,
        persistence: "localStorage+cookie",
        // Respect Do Not Track.
        respect_dnt: true,
        // Coarse IP anonymisation when supported by the project.
        ip: false,
        disable_session_recording: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "[data-ph-mask], input, textarea",
          recordCrossOriginIframes: false,
        },
        loaded: (ph) => {
          // Stay opted out until consent is granted.
          if (consent !== "granted") ph.opt_out_capturing();
        },
      });
      client = posthog;
      return posthog;
    } catch {
      client = null;
      return null;
    }
  })();

  return initPromise;
}

/** Call once from App mount. Safe under StrictMode double-mount. */
export async function initAnalytics(): Promise<void> {
  consent = readConsent();
  if (consent !== "granted") return;
  const ph = await ensureClient();
  if (!ph) return;
  ph.opt_in_capturing();
  try {
    ph.startSessionRecording?.();
  } catch {
    /* replay optional */
  }
  capturePageViewOnce();
  track(PV_EVENTS.session_started, { view: "scene" });
}

export async function applyConsent(next: "granted" | "denied"): Promise<void> {
  writeConsent(next);
  consent = next;
  if (next === "denied") {
    if (client) {
      try {
        client.stopSessionRecording?.();
        client.opt_out_capturing();
      } catch {
        /* ignore */
      }
    }
    trackLocalOnly(PV_EVENTS.consent_changed, { consent: "denied" });
    return;
  }
  const ph = await ensureClient();
  if (!ph) return;
  ph.opt_in_capturing();
  try {
    ph.startSessionRecording?.();
  } catch {
    /* ignore */
  }
  track(PV_EVENTS.consent_changed, { consent: "granted" });
  capturePageViewOnce();
  track(PV_EVENTS.session_started, { view: "scene" });
}

function capturePageViewOnce() {
  if (pageViewSent || !canCapture() || !client) return;
  pageViewSent = true;
  try {
    // Avoid raw query strings that might carry sensitive tokens.
    const path = `${window.location.pathname}${window.location.hash || ""}`;
    client.capture(PV_EVENTS.page_view, {
      path,
      referrer_host: safeReferrerHost(),
      ...utmProps(),
    });
    client.capture("$pageview", { $current_url: `${window.location.origin}${path}` });
  } catch {
    /* ignore */
  }
}

function safeReferrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    return new URL(document.referrer).host.slice(0, 80);
  } catch {
    return undefined;
  }
}

function utmProps(): Record<string, string> {
  try {
    const q = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
      const v = q.get(k);
      if (v) out[k] = v.slice(0, 64);
    }
    return out;
  } catch {
    return {};
  }
}

/** Fire-and-forget product event. Never throws. */
export function track(event: PvEventName, props: PvProps = {}): void {
  if (!canCapture() || !client) return;
  try {
    client.capture(event, sanitizeProps(props));
  } catch {
    /* ignore */
  }
}

/** Used when denied — no network. Kept for local test spies. */
function trackLocalOnly(_event: PvEventName, _props: PvProps): void {
  /* no-op in production */
}

/** Test/reset hook. */
export function __resetAnalyticsForTests(): void {
  client = null;
  initPromise = null;
  pageViewSent = false;
  consent = "unknown";
}
