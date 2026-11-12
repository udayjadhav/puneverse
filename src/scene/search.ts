import type { LandmarkLabel, PlaceLabel, Preset, SceneManifest } from "./types";
import { landmarkContentFor } from "./landmarks/content";

export type SearchHitKind = "preset" | "landmark" | "place" | "station";

export interface SearchHit {
  id: string;
  label: string;
  kind: SearchHitKind;
  category: string;
  x: number;
  y: number;
  z: number;
  /** Higher = better. */
  score: number;
  name_mr?: string;
}

function scoreName(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const idx = n.indexOf(q);
  if (idx >= 0) return 60 - Math.min(idx, 40);
  // token match
  const tokens = n.split(/[\s,/-]+/);
  if (tokens.some((t) => t.startsWith(q))) return 50;
  return 0;
}

function pushUnique(out: SearchHit[], hit: SearchHit) {
  // Prefer first hit (presets scored higher) — collapse same place across kinds.
  if (out.some((h) => h.label.toLowerCase() === hit.label.toLowerCase())) return;
  out.push(hit);
}

/** Search presets, landmarks, places and stations from the baked manifest. */
export function searchScene(manifest: SceneManifest, query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 1) return [];

  const hits: SearchHit[] = [];

  for (const p of manifest.presets) {
    const s = scoreName(p.label, q);
    if (s <= 0) continue;
    const content = landmarkContentFor(p.label);
    pushUnique(hits, {
      id: `preset:${p.label}`,
      label: p.label,
      kind: "preset",
      category: content?.category ?? p.kind,
      x: p.x,
      y: p.y,
      z: p.z,
      score: s + 15, // presets preferred for fly-to
      name_mr: content?.name_mr,
    });
  }

  for (const l of manifest.landmarks) {
    const s = scoreName(l.name, q);
    if (s <= 0) continue;
    const content = landmarkContentFor(l.name);
    pushUnique(hits, {
      id: `landmark:${l.name}`,
      label: l.name,
      kind: "landmark",
      category: content?.category ?? l.kind,
      x: l.x,
      y: l.y,
      z: l.z,
      score: s + 8,
      name_mr: content?.name_mr,
    });
  }

  for (const st of manifest.stations) {
    const s = scoreName(st.name, q);
    if (s <= 0) continue;
    pushUnique(hits, {
      id: `station:${st.name}`,
      label: st.name,
      kind: "station",
      category: st.metro ? "Metro station" : "Railway station",
      x: st.x,
      y: st.y,
      z: 0,
      score: s + 5,
    });
  }

  for (const pl of manifest.places) {
    const s = scoreName(pl.name, q);
    if (s <= 0) continue;
    pushUnique(hits, {
      id: `place:${pl.name}`,
      label: pl.name,
      kind: "place",
      category: "Locality",
      x: pl.x,
      y: pl.y,
      z: pl.z,
      score: s + pl.rank * 0.1,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return hits.slice(0, limit);
}

export function hitToPreset(hit: SearchHit): Preset {
  return { label: hit.label, x: hit.x, y: hit.y, z: hit.z, kind: hit.category };
}

/** Type-only helpers kept for tests / future ranking. */
export type _Unused = PlaceLabel | LandmarkLabel;
