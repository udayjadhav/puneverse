/**
 * Pure helpers for camera-driven chunk residency. Ultra/High keep a local
 * radius of chunks — never the whole city — so detail modes stay GPU-bounded.
 */

export interface StreamChunkRef {
  ix: number;
  iy: number;
}

export interface StreamBudget {
  streamRadius: number;
  maxChunks: number;
}

export function chunkKey(ix: number, iy: number): string {
  return `${ix}_${iy}`;
}

/** Local (x,y) → chunk indices for a uniform grid. */
export function chunkIndexAt(x: number, y: number, chunkSize: number): { ix: number; iy: number } {
  return { ix: Math.floor(x / chunkSize), iy: Math.floor(y / chunkSize) };
}

/**
 * Nearest chunks to the camera within ``streamRadius``, capped at ``maxChunks``.
 * Distance is to chunk centre in the local XY plane.
 */
export function selectResidentChunks(
  all: StreamChunkRef[],
  chunkSize: number,
  camX: number,
  camY: number,
  budget: StreamBudget,
): StreamChunkRef[] {
  const r2 = budget.streamRadius * budget.streamRadius;
  const scored: { c: StreamChunkRef; d2: number }[] = [];
  for (const c of all) {
    const cx = (c.ix + 0.5) * chunkSize;
    const cy = (c.iy + 0.5) * chunkSize;
    const dx = cx - camX;
    const dy = cy - camY;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) scored.push({ c, d2 });
  }
  scored.sort((a, b) => a.d2 - b.d2);
  return scored.slice(0, budget.maxChunks).map((s) => s.c);
}
