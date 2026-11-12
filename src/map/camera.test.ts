import { afterEach, describe, expect, it } from "vitest";
import { cameraDurationMs, modeSwitchCamera, resetCamera } from "./camera";

const g = globalThis as unknown as { window?: unknown };
const original = g.window;

function stubReducedMotion(reduce: boolean) {
  g.window = {
    matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }),
  };
}

describe("camera", () => {
  afterEach(() => {
    g.window = original;
  });

  it("animates normally, jumps (0 ms) for prefers-reduced-motion", () => {
    stubReducedMotion(false);
    expect(cameraDurationMs(700)).toBe(700);
    stubReducedMotion(true);
    expect(cameraDurationMs(700)).toBe(0);
  });

  it("reduced motion still opens 3D at the configured pitch (tilt is not motion)", () => {
    stubReducedMotion(true);
    expect(resetCamera("3d").pitch).toBeGreaterThan(50);
    expect(modeSwitchCamera("flat")).toEqual({ pitch: 0, animate: "ease" });
  });
});
