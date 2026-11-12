import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isClickNotDrag } from "./clickDetect";
import {
  clearConsent,
  CONSENT_STORAGE_KEY,
  readConsent,
  writeConsent,
} from "./consent";
import {
  distanceBucket,
  pitchBucket,
  PV_EVENTS,
  sanitizeProps,
  timeOfDayBucket,
} from "./events";
import {
  __resetAnalyticsForTests,
  applyConsent,
  getConsentState,
  isAnalyticsConfigured,
  loadAnalyticsConfig,
  track,
} from "./client";
import { __resetSessionForTests, getInteractionCount, noteMeaningfulInteraction } from "./session";

/** Minimal localStorage for node vitest (project uses environment: node). */
function installMemoryStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("localStorage", api);
  return api;
}

describe("consent persistence", () => {
  beforeEach(() => {
    installMemoryStorage();
    clearConsent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts unknown and persists grant/deny", () => {
    expect(readConsent()).toBe("unknown");
    writeConsent("granted");
    expect(readConsent()).toBe("granted");
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("granted");
    writeConsent("denied");
    expect(readConsent()).toBe("denied");
  });
});

describe("event helpers", () => {
  it("buckets time, distance and pitch", () => {
    expect(timeOfDayBucket(12)).toBe("day");
    expect(timeOfDayBucket(20.5)).toBe("night");
    expect(distanceBucket(200)).toBe("street");
    expect(distanceBucket(5000)).toBe("city");
    expect(pitchBucket(15)).toBe("oblique");
    expect(pitchBucket(60)).toBe("top");
  });

  it("sanitizes props and drops nulls", () => {
    const out = sanitizeProps({
      place_name: "  Shaniwar Wada  ",
      building_name: null,
      query_len: 4,
      engaged: true,
    });
    expect(out.place_name).toBe("Shaniwar Wada");
    expect(out.query_len).toBe(4);
    expect(out.engaged).toBe(true);
    expect(out.building_name).toBeUndefined();
  });

  it("exposes a stable event registry", () => {
    expect(PV_EVENTS.building_selected).toBe("pv_building_selected");
    expect(PV_EVENTS.scene_loaded).toBe("pv_scene_loaded");
  });
});

describe("click vs drag", () => {
  it("treats small movement as click", () => {
    expect(isClickNotDrag({ x: 10, y: 10 }, { x: 12, y: 11 })).toBe(true);
    expect(isClickNotDrag({ x: 10, y: 10 }, { x: 40, y: 10 })).toBe(false);
  });
});

describe("analytics client without config", () => {
  beforeEach(() => {
    installMemoryStorage();
    __resetAnalyticsForTests();
    __resetSessionForTests();
    clearConsent();
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    vi.stubEnv("VITE_ANALYTICS_ENABLED", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetAnalyticsForTests();
  });

  it("reports not configured and track is a no-op", () => {
    expect(isAnalyticsConfigured()).toBe(false);
    expect(loadAnalyticsConfig().enabled).toBe(false);
    expect(() => track(PV_EVENTS.page_view, { view: "scene" })).not.toThrow();
  });

  it("applyConsent denied does not throw without SDK", async () => {
    await expect(applyConsent("denied")).resolves.toBeUndefined();
    expect(getConsentState()).toBe("denied");
    expect(readConsent()).toBe("denied");
  });
});

describe("session engagement counter", () => {
  beforeEach(() => __resetSessionForTests());

  it("counts meaningful interactions", () => {
    expect(getInteractionCount()).toBe(0);
    noteMeaningfulInteraction();
    noteMeaningfulInteraction();
    expect(getInteractionCount()).toBe(2);
  });
});
