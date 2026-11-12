import type { ReactNode } from "react";
import { isWebGLAvailable } from "@/map/webgl";

export function WebGLGate({ children }: { children: ReactNode }) {
  if (!isWebGLAvailable()) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-lg space-y-3 rounded-lg border border-amber-700/60 bg-slate-900 p-6">
          <h1 className="text-lg font-semibold">WebGL is required</h1>
          <p className="text-sm text-slate-300">
            PuneVerse draws the map with MapLibre, which needs WebGL. Enable
            hardware acceleration or try another browser, then reload.
          </p>
        </div>
      </div>
    );
  }
  return children;
}
