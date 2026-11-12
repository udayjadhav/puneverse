/// <reference lib="webworker" />
/** Fetch + decode + build geometry off the main thread. */

import { buildBuildings, type BuildingChunkArrays } from "./buildingGeometry";
import { decodePVB } from "./format";
import { buildRibbons, METRO_CLASS, RAIL_CLASS } from "./roadGeometry";

export type WorkerRequest =
  | { type: "chunk"; id: number; url: string; parapets: boolean }
  | { type: "network"; id: number; roadsUrl: string; railUrl: string };

interface ChunkMeta {
  ix: number;
  iy: number;
  ox: number;
  oy: number;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function copy<T extends ArrayBufferView>(a: T | undefined): T | null {
  if (!a) return null;
  const C = a.constructor as unknown as { new (src: T): T };
  return new C(a);
}

async function load(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return decodePVB(await res.arrayBuffer());
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "chunk") {
      const d = await load(msg.url);
      const meta = d.meta as unknown as ChunkMeta;
      const A = d.arrays;
      const hasB = A.height && A.height.length > 0;
      const built = hasB
        ? buildBuildings(A as unknown as BuildingChunkArrays, meta.ox, meta.oy, { parapets: msg.parapets })
        : null;
      const out = {
        id: msg.id,
        meta,
        built,
        height: copy(A.height as Float32Array),
        src: copy(A.src as Uint8Array),
        kind: copy(A.kind as Uint8Array),
        name: copy(A.name as Int32Array),
        tree: copy(A.tree as Float32Array),
        tank: copy(A.tank as Float32Array),
        stair: copy(A.stair as Float32Array),
      };
      const transfer: Transferable[] = [];
      for (const v of [out.height, out.src, out.kind, out.name, out.tree, out.tank, out.stair]) {
        if (v) transfer.push(v.buffer);
      }
      if (built) {
        const b = built as unknown as Record<string, ArrayBufferView>;
        for (const k of Object.keys(b)) {
          const arr = b[k];
          if (arr.byteOffset !== 0 || arr.byteLength !== arr.buffer.byteLength) {
            b[k] = copy(arr)!;
          }
          transfer.push(b[k].buffer as ArrayBuffer);
        }
      }
      ctx.postMessage(out, transfer);
    } else if (msg.type === "network") {
      const [roads, rail] = await Promise.all([load(msg.roadsUrl), load(msg.railUrl)]);
      const R = roads.arrays;
      const nSeg = R.cls.length;
      const deck = new Float32Array(nSeg);
      // Thicker bridge decks so stacked flyovers read as 3D slabs, not flat ribbons.
      for (let s = 0; s < nSeg; s++) deck[s] = R.flags[s] & 1 ? 2.4 : 0;
      const roadRibbon = buildRibbons({
        vstart: R.vstart as Uint32Array,
        xyz: R.xyz as Float32Array,
        width: R.width,
        cls: R.cls,
        flags: R.flags,
        deck,
      });
      const L = rail.arrays;
      const nRail = L.metro.length;
      const rw = new Float32Array(nRail);
      const rc = new Uint8Array(nRail);
      const rd = new Float32Array(nRail);
      for (let s = 0; s < nRail; s++) {
        const elevatedMetro = L.metro[s] === 1 && L.elevated[s] === 1;
        rw[s] = elevatedMetro ? 8.6 : 3.6;
        rc[s] = elevatedMetro ? METRO_CLASS : RAIL_CLASS;
        rd[s] = elevatedMetro ? 2.0 : L.elevated[s] ? 1.2 : 0;
      }
      const railRibbon = buildRibbons({
        vstart: L.vstart as Uint32Array,
        xyz: L.xyz as Float32Array,
        width: rw,
        cls: rc,
        flags: new Uint8Array(nRail),
        deck: rd,
      });
      const out = {
        id: msg.id,
        roadRibbon: copyRibbon(roadRibbon),
        railRibbon: copyRibbon(railRibbon),
        roads: {
          vstart: copy(R.vstart as Uint32Array)!,
          xyz: copy(R.xyz as Float32Array)!,
          cls: copy(R.cls as Uint8Array)!,
          width: copy(R.width as Float32Array)!,
          flags: copy(R.flags as Uint8Array)!,
          na: copy(R.na as Uint32Array)!,
          nb: copy(R.nb as Uint32Array)!,
          pier: copy(R.pier as Float32Array)!,
          lamp: copy(R.lamp as Float32Array)!,
        },
        rails: {
          vstart: copy(L.vstart as Uint32Array)!,
          xyz: copy(L.xyz as Float32Array)!,
          metro: copy(L.metro as Uint8Array)!,
          elevated: copy(L.elevated as Uint8Array)!,
        },
        railPier: copy(L.pier as Float32Array)!,
      };
      const transfer: Transferable[] = [];
      for (const r of [out.roadRibbon, out.railRibbon]) {
        for (const v of Object.values(r)) transfer.push((v as ArrayBufferView).buffer as ArrayBuffer);
      }
      for (const v of Object.values(out.roads)) transfer.push((v as ArrayBufferView).buffer as ArrayBuffer);
      for (const v of Object.values(out.rails)) transfer.push((v as ArrayBufferView).buffer as ArrayBuffer);
      transfer.push(out.railPier.buffer);
      ctx.postMessage(out, transfer);
    }
  } catch (err) {
    ctx.postMessage({ id: msg.id, error: String((err as Error)?.message ?? err) });
  }
};

function copyRibbon(r: ReturnType<typeof buildRibbons>) {
  return {
    position: new Float32Array(r.position),
    uv: new Float32Array(r.uv),
    rdata: new Uint8Array(r.rdata),
    index: new Uint32Array(r.index),
  };
}
