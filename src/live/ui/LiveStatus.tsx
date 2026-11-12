import { useLiveCityStore } from "@/live/liveCityStore";
import { PANEL } from "@/scene/ui/styles";

export function LiveStatus() {
  const liveMode = useLiveCityStore((s) => s.liveMode);
  const snap = useLiveCityStore((s) => s.snapshot);
  const fetching = useLiveCityStore((s) => s.fetching);
  if (!liveMode) return null;

  const stamps = [
    snap.traffic.meta.fetchedAt,
    snap.weather.meta.fetchedAt,
    snap.airQuality.meta.fetchedAt,
  ].filter(Boolean) as string[];
  const latest = stamps.sort().at(-1) ?? null;

  return (
    <div
      className={`${PANEL} pointer-events-none absolute top-14 left-1/2 z-20 -translate-x-1/2 px-3 py-1 text-[10px] text-slate-300`}
      data-testid="live-status"
    >
      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
      Live city · {fetching ? "updating…" : "idle"} · weather {snap.weather.meta.status}
      {snap.weather.observation?.condition ? ` · ${snap.weather.observation.condition}` : ""} · last fetch{" "}
      {latest ?? "—"}
    </div>
  );
}
