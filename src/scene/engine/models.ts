/**
 * Procedural low-poly models (generated, disclosed in About). Unit sizes are in
 * metres. Vertex colours carry the base colour; instanceColor tints.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function colorize(g: BufferGeometry, c: Color | ((p: Vector3, n: Vector3) => Color), glow = 0): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const col = new Float32Array(pos.count * 3);
  const gl = new Float32Array(pos.count).fill(glow);
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nor) n.fromBufferAttribute(nor, i);
    const cc = (typeof c === "function" ? c(p, n) : c).clone().convertSRGBToLinear();
    col[i * 3] = cc.r;
    col[i * 3 + 1] = cc.g;
    col[i * 3 + 2] = cc.b;
  }
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.setAttribute("glow", new BufferAttribute(gl, 1));
  for (const k of Object.keys(geo.attributes)) {
    if (!["position", "normal", "color", "glow"].includes(k)) geo.deleteAttribute(k);
  }
  return geo;
}

function at(g: BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): BufferGeometry {
  const m = new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ry),
    new Vector3(sx, sy, sz),
  );
  return g.applyMatrix4(m);
}

function blob(r: number, detail: number, seed: number, rough = 0.28): BufferGeometry {
  const g = new IcosahedronGeometry(r, detail);
  const pos = g.getAttribute("position");
  const rnd = rand(seed);
  const v = new Vector3();
  const offs = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!offs.has(key)) offs.set(key, 1 + (rnd() - 0.5) * rough * 2);
    v.multiplyScalar(offs.get(key)!);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const LEAF_DARK = new Color(0.10, 0.20, 0.07);
const LEAF_LIGHT = new Color(0.30, 0.46, 0.16);
const TRUNK = new Color(0.30, 0.24, 0.18);

function leafColor(top: number, bottom: number) {
  return (p: Vector3) => {
    const t = Math.min(1, Math.max(0, (p.y - bottom) / Math.max(top - bottom, 0.01)));
    return LEAF_DARK.clone().lerp(LEAF_LIGHT, 0.25 + 0.75 * t);
  };
}

/** Tree variants normalised to total height 1. */
export function makeTreeGeometry(variant: number, lod: "high" | "low"): BufferGeometry {
  if (lod === "low") {
    if (variant === 5) {
      const trunk = colorize(at(new CylinderGeometry(0.02, 0.03, 0.8, 4, 1, true), 0, 0.4, 0), TRUNK);
      const head = colorize(at(new OctahedronGeometry(0.25, 0), 0, 0.85, 0, 1, 0.45, 1), leafColor(1, 0.75));
      return mergeGeometries([trunk, head])!;
    }
    const wide = variant === 0 ? 0.55 : variant === 2 ? 0.25 : 0.4;
    const y0 = variant >= 3 ? 0.0 : 0.3;
    const crown = colorize(at(new OctahedronGeometry(0.5, 0), 0, y0 + (1 - y0) / 2, 0, wide * 2, 1 - y0, wide * 2), leafColor(1, y0));
    return crown;
  }
  const parts: BufferGeometry[] = [];
  const rnd = rand(1000 + variant * 77);
  if (variant === 5) {
    // Coconut palm: slender curved trunk, drooping fronds.
    parts.push(colorize(at(new CylinderGeometry(0.018, 0.03, 0.86, 6), 0, 0.43, 0), TRUNK));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const frond = new BoxGeometry(0.42, 0.012, 0.07);
      const m = new Matrix4()
        .makeRotationY(a)
        .multiply(new Matrix4().makeTranslation(0.2, 0.86, 0))
        .multiply(new Matrix4().makeRotationZ(-0.45 - rnd() * 0.25));
      frond.applyMatrix4(m);
      parts.push(colorize(frond, new Color(0.22, 0.38, 0.12)));
    }
    return mergeGeometries(parts)!;
  }
  if (variant <= 2) {
    const trunkH = variant === 0 ? 0.32 : variant === 1 ? 0.28 : 0.22;
    const trunkR = variant === 0 ? 0.045 : 0.035;
    parts.push(colorize(at(new CylinderGeometry(trunkR * 0.7, trunkR, trunkH + 0.1, 6), 0, (trunkH + 0.1) / 2, 0), TRUNK));
    if (variant === 0) {
      // Broad spreading crown (rain tree / gulmohar / banyan).
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + rnd();
        const rr = k === 0 ? 0 : 0.28 + rnd() * 0.1;
        const r = 0.2 + rnd() * 0.08;
        parts.push(colorize(at(blob(r, 1, variant * 31 + k), Math.cos(a) * rr, 0.62 + rnd() * 0.12, Math.sin(a) * rr, 1, 0.7, 1), leafColor(1, 0.35)));
      }
      parts.push(colorize(at(blob(0.3, 1, 99), 0, 0.78, 0, 1, 0.6, 1), leafColor(1, 0.35)));
    } else if (variant === 1) {
      // Round crown (mango / neem).
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + rnd();
        const rr = k === 0 ? 0 : 0.17;
        parts.push(colorize(at(blob(0.24 + rnd() * 0.05, 1, variant * 31 + k), Math.cos(a) * rr, 0.6 + rnd() * 0.15, Math.sin(a) * rr), leafColor(1, 0.3)));
      }
    } else {
      // Tall columnar crown (ashoka / eucalyptus).
      for (let k = 0; k < 4; k++) {
        const y = 0.38 + k * 0.17;
        const r = 0.15 - k * 0.022;
        parts.push(colorize(at(blob(r, 1, variant * 31 + k), (rnd() - 0.5) * 0.05, y, (rnd() - 0.5) * 0.05, 1, 1.3, 1), leafColor(1, 0.25)));
      }
    }
  } else {
    // Shrubs and small trees on hill slopes.
    const n = variant === 3 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      parts.push(colorize(at(blob(0.34, 1, variant * 13 + k, 0.35), Math.cos(a) * 0.2, 0.36, Math.sin(a) * 0.2, 1, 0.8, 1), (p) => new Color(0.24, 0.30, 0.13).lerp(new Color(0.42, 0.44, 0.22), Math.min(1, Math.max(0, p.y / 0.7)))));
    }
  }
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- rooftop

export function makeTankGeometry(): BufferGeometry {
  const body = colorize(at(new CylinderGeometry(0.58, 0.6, 1.05, 12), 0, 0.53, 0), new Color(1, 1, 1));
  const lid = colorize(at(new CylinderGeometry(0.3, 0.45, 0.16, 12), 0, 1.12, 0), new Color(0.85, 0.85, 0.85));
  const ribs = colorize(at(new CylinderGeometry(0.615, 0.615, 0.05, 12), 0, 0.75, 0), new Color(0.8, 0.8, 0.8));
  const base = colorize(at(new BoxGeometry(1.3, 0.12, 1.3), 0, 0.0, 0), new Color(0.55, 0.53, 0.5));
  return mergeGeometries([body, lid, ribs, base])!;
}

export function makeStairHeadGeometry(): BufferGeometry {
  // Unit box (1 × 1 × 1) sitting on y = 0, with a dark door on +x.
  const box = colorize(at(new BoxGeometry(1, 1, 1), 0, 0.5, 0), new Color(1, 1, 1));
  const door = colorize(at(new BoxGeometry(0.02, 0.75, 0.32), 0.505, 0.38, 0), new Color(0.25, 0.22, 0.2));
  const slab = colorize(at(new BoxGeometry(1.15, 0.08, 1.15), 0, 1.02, 0), new Color(0.82, 0.8, 0.76));
  return mergeGeometries([box, door, slab])!;
}

// ---------------------------------------------------------------- vehicles

const GLASS = new Color(0.08, 0.1, 0.12);

export type VehicleType = "car" | "bus" | "auto" | "bike" | "ped";
export type RailVehicleType = "metro" | "train";

/** Low-poly metro coach or loco+coach (SIMULATED). Length along +X. */
export function makeRailVehicleGeometry(t: RailVehicleType): BufferGeometry {
  const parts: BufferGeometry[] = [];
  if (t === "metro") {
    const body = new Color(0.85, 0.2, 0.22);
    const accent = new Color(0.95, 0.95, 0.95);
    parts.push(colorize(at(new BoxGeometry(28, 3.2, 2.9), 0, 2.0, 0), body));
    parts.push(colorize(at(new BoxGeometry(26.5, 1.4, 2.95), 0, 2.9, 0), GLASS));
    parts.push(colorize(at(new BoxGeometry(0.2, 1.6, 2.7), 14.05, 2.4, 0), GLASS));
    parts.push(colorize(at(new BoxGeometry(0.2, 1.6, 2.7), -14.05, 2.4, 0), GLASS));
    parts.push(colorize(at(new BoxGeometry(28.2, 0.25, 3.0), 0, 3.7, 0), accent));
    for (const z of [-1.0, 1.0]) {
      parts.push(colorize(at(new BoxGeometry(0.12, 0.28, 0.4), 14.1, 1.35, z), new Color(1, 1, 0.85), 1));
      parts.push(colorize(at(new BoxGeometry(0.12, 0.28, 0.4), -14.1, 1.35, z), new Color(0.9, 0.1, 0.05), 2));
    }
  } else {
    const loco = new Color(0.15, 0.35, 0.55);
    const coach = new Color(0.75, 0.78, 0.8);
    parts.push(colorize(at(new BoxGeometry(12, 3.6, 3.0), 10, 2.2, 0), loco));
    parts.push(colorize(at(new BoxGeometry(10.5, 1.3, 3.05), 10, 3.2, 0), GLASS));
    parts.push(colorize(at(new BoxGeometry(0.15, 1.8, 2.8), 16.05, 2.5, 0), GLASS));
    parts.push(colorize(at(new BoxGeometry(22, 3.3, 2.85), -6, 2.1, 0), coach));
    parts.push(colorize(at(new BoxGeometry(20.5, 1.2, 2.9), -6, 3.0, 0), GLASS));
    for (const z of [-1.05, 1.05]) {
      parts.push(colorize(at(new BoxGeometry(0.12, 0.3, 0.45), 16.1, 1.4, z), new Color(1, 1, 0.85), 1));
    }
  }
  return mergeGeometries(parts)!;
}

export function makeVehicleGeometry(t: VehicleType): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const W = new Color(1, 1, 1);
  if (t === "car") {
    parts.push(colorize(at(new BoxGeometry(4.2, 0.7, 1.75), 0, 0.6, 0), W));
    parts.push(colorize(at(new BoxGeometry(2.2, 0.55, 1.6), -0.2, 1.22, 0), GLASS));
    parts.push(colorize(at(new BoxGeometry(2.0, 0.06, 1.5), -0.2, 1.52, 0), W));
    for (const z of [-0.6, 0.6]) {
      parts.push(colorize(at(new BoxGeometry(0.05, 0.16, 0.32), 2.11, 0.68, z), new Color(1, 1, 0.9), 1));
      parts.push(colorize(at(new BoxGeometry(0.05, 0.14, 0.3), -2.11, 0.7, z), new Color(0.9, 0.1, 0.05), 2));
    }
    for (const x of [-1.3, 1.3]) {
      for (const z of [-0.8, 0.8]) {
        parts.push(colorize(at(new CylinderGeometry(0.32, 0.32, 0.22, 8).rotateX(Math.PI / 2), x, 0.32, z), new Color(0.06, 0.06, 0.06)));
      }
    }
  } else if (t === "bus") {
    parts.push(colorize(at(new BoxGeometry(11, 2.4, 2.5), 0, 1.6, 0), W));
    parts.push(colorize(at(new BoxGeometry(10.4, 0.9, 2.52), 0, 2.05, 0), GLASS));
    parts.push(colorize(at(new BoxGeometry(0.05, 1.1, 2.3), 5.51, 2.0, 0), GLASS));
    for (const z of [-0.9, 0.9]) {
      parts.push(colorize(at(new BoxGeometry(0.05, 0.2, 0.35), 5.52, 0.75, z), new Color(1, 1, 0.9), 1));
      parts.push(colorize(at(new BoxGeometry(0.05, 0.25, 0.3), -5.52, 0.9, z), new Color(0.9, 0.1, 0.05), 2));
    }
  } else if (t === "auto") {
    // Pune autorickshaw: black body, yellow canopy.
    parts.push(colorize(at(new BoxGeometry(2.6, 0.8, 1.3), 0, 0.6, 0), new Color(0.07, 0.07, 0.07)));
    parts.push(colorize(at(new BoxGeometry(2.2, 0.75, 1.3), -0.1, 1.38, 0), new Color(0.95, 0.78, 0.1)));
    parts.push(colorize(at(new BoxGeometry(0.05, 0.14, 0.2), 1.31, 0.75, 0), new Color(1, 1, 0.9), 1));
  } else if (t === "ped") {
    // Low-poly pedestrian (SIMULATED) — torso + head + legs.
    const shirt = new Color(0.25, 0.4, 0.65);
    const pants = new Color(0.18, 0.18, 0.22);
    const skin = new Color(0.72, 0.55, 0.42);
    parts.push(colorize(at(new BoxGeometry(0.38, 0.55, 0.22), 0, 1.05, 0), shirt));
    parts.push(colorize(at(new BoxGeometry(0.28, 0.28, 0.28), 0, 1.48, 0), skin));
    parts.push(colorize(at(new BoxGeometry(0.16, 0.55, 0.16), -0.1, 0.4, 0), pants));
    parts.push(colorize(at(new BoxGeometry(0.16, 0.55, 0.16), 0.1, 0.4, 0), pants));
    parts.push(colorize(at(new BoxGeometry(0.12, 0.45, 0.12), -0.28, 1.05, 0), shirt));
    parts.push(colorize(at(new BoxGeometry(0.12, 0.45, 0.12), 0.28, 1.05, 0), shirt));
  } else {
    parts.push(colorize(at(new BoxGeometry(1.8, 0.55, 0.35), 0, 0.55, 0), W));
    parts.push(colorize(at(new BoxGeometry(0.45, 0.8, 0.45), -0.15, 1.25, 0), new Color(0.15, 0.15, 0.18)));
    parts.push(colorize(at(new BoxGeometry(0.05, 0.12, 0.12), 0.91, 0.75, 0), new Color(1, 1, 0.9), 1));
  }
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- street furniture

export function makeLampGeometry(): BufferGeometry {
  const pole = colorize(at(new CylinderGeometry(0.07, 0.1, 8, 5), 0, 4, 0), new Color(0.35, 0.36, 0.38));
  const arm = colorize(at(new BoxGeometry(1.6, 0.08, 0.08), 0.75, 7.9, 0), new Color(0.35, 0.36, 0.38));
  const head = colorize(at(new BoxGeometry(0.6, 0.12, 0.25), 1.5, 7.85, 0), new Color(1, 0.85, 0.6), 3);
  return mergeGeometries([pole, arm, head])!;
}

export function makePierGeometry(round: boolean): BufferGeometry {
  if (round) {
    const col = colorize(at(new CylinderGeometry(0.5, 0.5, 1, 10), 0, 0.5, 0), new Color(0.66, 0.65, 0.62));
    return col;
  }
  return colorize(at(new BoxGeometry(1, 1, 1), 0, 0.5, 0), new Color(0.64, 0.63, 0.6));
}

export function makePierCapGeometry(): BufferGeometry {
  return colorize(at(new BoxGeometry(1, 1, 1), 0, 0.5, 0), new Color(0.66, 0.65, 0.62));
}

export function makeLightPoolGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const s = 1;
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s]), 3),
  );
  g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}