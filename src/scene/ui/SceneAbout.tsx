import { useEffect, type ReactNode } from "react";
import type { SceneManifest, ValidationStats } from "@/scene/types";
import { useSceneStore } from "@/store/sceneStore";
import { heightSourceBreakdown } from "./heightBreakdown";
import { PILL } from "./styles";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold tracking-[0.2em] text-[#f5a524] uppercase">{title}</h3>
      {children}
    </section>
  );
}

function validationLine(label: string, v: ValidationStats | undefined): string | null {
  if (!v || v.mae_m == null) return null;
  const bias = v.bias_m != null ? `, bias ${v.bias_m > 0 ? "+" : ""}${v.bias_m.toFixed(1)} m` : "";
  return `${label}: average error ${v.mae_m.toFixed(1)} m${bias} (${v.n.toLocaleString("en-IN")} buildings)`;
}

function HeightSection({ manifest }: { manifest: SceneManifest }) {
  const rows = heightSourceBreakdown(manifest);
  const val = manifest.stats.height_validation_gba ?? {};
  const cal = manifest.stats.height_calibration;
  const checks = [
    validationLine("Against mapped heights", val.vs_mapped_height),
    validationLine("Against mapped floors × 3 m", val.vs_mapped_floors_x3),
  ].filter((l): l is string => l !== null);

  return (
    <Section title="Building heights">
      <p>
        Every building is raised. Most heights are estimates, not measurements. This is where each height comes
        from:
      </p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10" data-testid="height-bar">
        {rows.map((r) =>
          r.pct > 0 ? (
            <div
              key={r.source}
              style={{ width: `${r.pct}%`, backgroundColor: r.color }}
              title={`${r.label}: ${r.pct.toFixed(1)}%`}
              data-testid={`height-bar-${r.source}`}
            />
          ) : null,
        )}
      </div>
      <ul className="space-y-0.5" data-testid="height-legend-rows">
        {rows.map((r) => (
          <li key={r.source} className="flex items-center gap-2" data-testid={`height-row-${r.source}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
            <span className="flex-1 text-slate-300">{r.label}</span>
            <span className="font-mono text-slate-400">{r.count.toLocaleString("en-IN")}</span>
            <span className="w-12 text-right font-mono text-slate-200" data-testid="height-row-pct">
              {r.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
      {(checks.length > 0 || cal) && (
        <div className="pt-1">
          <p className="font-medium text-slate-100">How good are the satellite heights?</p>
          <ul className="list-disc space-y-0.5 pl-4 text-slate-300" data-testid="height-validation">
            {checks.map((l) => (
              <li key={l}>{l}</li>
            ))}
            {cal && (
              <li>
                Calibrated against {cal.n.toLocaleString("en-IN")} OSM-tagged buildings: error {cal.mae_raw_m} m →{" "}
                {cal.mae_cal_m} m (held-out)
              </li>
            )}
          </ul>
        </div>
      )}
    </Section>
  );
}

export function SceneAbout() {
  const open = useSceneStore((s) => s.aboutOpen);
  const setAboutOpen = useSceneStore((s) => s.setAboutOpen);
  const manifest = useSceneStore((s) => s.manifest);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAboutOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setAboutOpen]);

  if (!open) return null;

  const ext = manifest?.extent_lonlat;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex justify-end bg-black/45"
      onClick={() => setAboutOpen(false)}
      data-testid="scene-about-backdrop"
    >
      <aside
        className="h-full w-[min(26rem,100%)] space-y-5 overflow-y-auto border-l border-white/10 bg-slate-950/95 p-5 text-xs leading-relaxed text-slate-300 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-about-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="scene-about"
      >
        <div className="flex items-center justify-between">
          <h2 id="scene-about-title" className="text-sm font-semibold tracking-[0.3em] text-slate-100">
            ABOUT THIS CITY
          </h2>
          <button
            type="button"
            className={PILL}
            onClick={() => setAboutOpen(false)}
            aria-label="Close"
            data-testid="scene-about-close"
          >
            Close
          </button>
        </div>

        <Section title="What is real">
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Building footprints: Overture Maps (OpenStreetMap, Google Open Buildings, Microsoft).</li>
            <li>Ground shape: Copernicus GLO-30 terrain.</li>
            <li>Ground and roof colour: Sentinel-2 satellite images.</li>
            <li>Tree cover: ESA WorldCover.</li>
            <li>Roads, rail, metro, water and place names: OpenStreetMap.</li>
          </ul>
        </Section>

        <Section title="What is generated">
          <p>These are made up to make the city look alive. They are not data:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Window, balcony, chajja and shopfront patterns.</li>
            <li>Rooftop water tanks, stair heads and painted solar panels.</li>
            <li>Tree shapes.</li>
            <li>Water waves.</li>
            <li>Vehicles and traffic.</li>
            <li>Street lights and window lights.</li>
          </ul>
        </Section>

        {manifest ? (
          <HeightSection manifest={manifest} />
        ) : (
          <Section title="Building heights">
            <p className="text-slate-400">Height numbers are loading.</p>
          </Section>
        )}

        <Section title="Limits">
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              The scene covers Pune from Sinhgad to Wagholi
              {ext && (
                <span className="font-mono text-slate-400">
                  {" "}
                  ({ext[1].toFixed(3)}–{ext[3].toFixed(3)}° N, {ext[0].toFixed(3)}–{ext[2].toFixed(3)}° E)
                </span>
              )}
              ; only nearby building chunks stay on the GPU.
            </li>
            <li>
              Most heights are <em>estimates</em> (satellite / area / floors / default) — never presented as surveyed
              measurements unless the source is mapped.
            </li>
            <li>
              Roadside cars, autos, buses, bikes and pedestrians are <strong>SIMULATED</strong> on OSM roads
              (procedural). Metros run on OSM metro / light-rail lines and trains on heavy rail — also
              simulated, not live GPS or timetables.
            </li>
            <li>
              Live City uses free Open-Meteo for weather/rainfall (shared city sample). Rain particles and wet
              roads follow those readings. CAMS air quality is a <em>model</em> cell, not CPCB. Live congestion
              remains unavailable.
            </li>
            <li>There are no building interiors.</li>
            <li>
              Developers: press <kbd className="rounded bg-white/10 px-1">Shift+D</kbd> for data-quality mode
              (provenance + confidence on hover).
            </li>
          </ul>
        </Section>

        {manifest && (
          <Section title="Data">
            <ul className="space-y-1" data-testid="scene-sources">
              {Object.entries(manifest.sources).map(([key, value]) => (
                <li key={key}>
                  <span className="text-slate-500">{key.replace(/_/g, " ")}:</span> {value}
                </li>
              ))}
            </ul>
            <p className="text-slate-500">Baked {manifest.baked_at}</p>
          </Section>
        )}
      </aside>
    </div>
  );
}
