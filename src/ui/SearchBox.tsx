import { useEffect, useMemo, useState } from "react";
import type { PlaceRecord } from "@/config/types";
import { filterPlaces, loadPlacesIndex } from "@/places/searchPlaces";
import { useMapStore } from "@/store/mapStore";

export function SearchBox() {
  const searchQuery = useMapStore((s) => s.searchQuery);
  const setSearchQuery = useMapStore((s) => s.setSearchQuery);
  const selectPlace = useMapStore((s) => s.selectPlace);
  const requestFlyTo = useMapStore((s) => s.requestFlyTo);
  const [places, setPlaces] = useState<PlaceRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPlacesIndex()
      .then((index) => {
        if (cancelled) return;
        setPlaces(index.places);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPlaces([]);
        setLoadError(err instanceof Error ? err.message : "Search unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(
    () => filterPlaces(places, searchQuery).slice(0, 8),
    [places, searchQuery],
  );

  return (
    <section
      className="w-72 rounded-lg border border-slate-700/80 bg-slate-950/85 p-3 text-slate-100 shadow-lg backdrop-blur"
      aria-label="Place search"
    >
      <label
        htmlFor="place-search"
        className="mb-1 block text-xs font-semibold tracking-wide text-slate-300 uppercase"
      >
        Search
      </label>
      <input
        id="place-search"
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Areas & landmarks (not full addresses)…"
        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
        autoComplete="off"
      />
      <p className="mt-1 text-[11px] text-amber-300/90">
        Fixture areas & landmarks only — not street addresses or a full
        directory.
      </p>
      {loadError ? (
        <p className="mt-1 text-xs text-rose-300" role="alert">
          Search unavailable: {loadError}. Honesty still applies — no non-fixture
          place list is shown.
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-2 max-h-48 overflow-auto divide-y divide-slate-800 rounded border border-slate-800">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-2 py-1.5 text-left text-sm hover:bg-slate-800"
                onClick={() => {
                  selectPlace(place);
                  requestFlyTo(place.center, 13.5);
                  setSearchQuery(place.name);
                }}
              >
                <span>{place.name}</span>
                <span className="text-[11px] text-slate-400">
                  {place.kind} · {place.source}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
