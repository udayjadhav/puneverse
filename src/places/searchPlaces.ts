import type { PlaceRecord, PlacesIndex } from "@/config/types";

export async function loadPlacesIndex(
  url = "/data/places.index.json",
): Promise<PlacesIndex> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load places index: ${res.status}`);
  }
  const index = (await res.json()) as PlacesIndex;
  if (index.fixture !== true) {
    throw new Error(
      "Places index rejected: fixture must be true in Phase 1 (fail closed).",
    );
  }
  return index;
}

export function filterPlaces(
  places: PlaceRecord[],
  query: string,
): PlaceRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return places.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.kind.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q),
  );
}
