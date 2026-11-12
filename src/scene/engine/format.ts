/** Decoder for the PVB1 container written by pipeline/scene_format.py. */

type Ctor =
  | Float32ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Uint16ArrayConstructor
  | Int16ArrayConstructor
  | Uint8ArrayConstructor
  | Int8ArrayConstructor;

const CTORS: Record<string, Ctor> = {
  float32: Float32Array,
  uint32: Uint32Array,
  int32: Int32Array,
  uint16: Uint16Array,
  int16: Int16Array,
  uint8: Uint8Array,
  int8: Int8Array,
};

export type TypedArray =
  | Float32Array
  | Uint32Array
  | Int32Array
  | Uint16Array
  | Int16Array
  | Uint8Array
  | Int8Array;

export interface Decoded<M = Record<string, unknown>> {
  meta: M;
  arrays: Record<string, TypedArray>;
  itemSize: Record<string, number>;
}

interface Entry {
  dtype: string;
  offset: number;
  length: number;
  itemSize: number;
}

export function decodePVB<M = Record<string, unknown>>(buf: ArrayBuffer): Decoded<M> {
  const head = new Uint8Array(buf, 0, 4);
  if (String.fromCharCode(head[0], head[1], head[2], head[3]) !== "PVB1") {
    throw new Error("Not a PVB1 asset");
  }
  const hlen = new DataView(buf).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen))) as {
    meta: M;
    arrays: Record<string, Entry>;
  };
  const base = 8 + hlen;
  const arrays: Record<string, TypedArray> = {};
  const itemSize: Record<string, number> = {};
  for (const [name, e] of Object.entries(header.arrays)) {
    const C = CTORS[e.dtype];
    if (!C) throw new Error(`Unsupported dtype ${e.dtype}`);
    arrays[name] = new C(buf, base + e.offset, e.length);
    itemSize[name] = e.itemSize;
  }
  return { meta: header.meta, arrays, itemSize };
}

export async function fetchPVB<M = Record<string, unknown>>(url: string, signal?: AbortSignal): Promise<Decoded<M>> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return decodePVB<M>(await res.arrayBuffer());
}
