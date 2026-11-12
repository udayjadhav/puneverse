import { LayerPanel } from "./LayerPanel";
import { SearchBox } from "./SearchBox";

export function SidePanel() {
  return (
    <aside className="pointer-events-none absolute top-20 left-3 z-20 flex w-72 flex-col gap-3">
      <div className="pointer-events-auto">
        <SearchBox />
      </div>
      <div className="pointer-events-auto">
        <LayerPanel />
      </div>
    </aside>
  );
}
