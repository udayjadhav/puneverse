import { useSceneStore } from "@/store/sceneStore";
import { formatLatLon } from "./heightBreakdown";
import { PANEL } from "./styles";

export function PlaceReadout() {
  const readout = useSceneStore((s) => s.readout);
  const fps = useSceneStore((s) => s.fps);
  if (!readout && fps <= 0) return null;

  return (
    <div className={`${PANEL} absolute bottom-3 left-3 px-3 py-2`} data-testid="place-readout">
      {readout && (
        <>
          <p className="text-[13px] font-semibold text-slate-100">{readout.place}</p>
          <p className="font-mono text-[11px] text-slate-400">
            {formatLatLon(readout.lat, readout.lon)} · eye {Math.round(readout.eye).toLocaleString("en-IN")} m
          </p>
        </>
      )}
      {fps > 0 && (
        <p className="font-mono text-[10px] text-slate-500" data-testid="fps">
          {Math.round(fps)} fps
        </p>
      )}
    </div>
  );
}
