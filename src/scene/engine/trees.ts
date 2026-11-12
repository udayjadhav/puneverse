/**
 * Instanced trees. Far LOD: every tree, static matrices, culled in the vertex
 * shader inside the near radius. Near LOD: detailed canopies rebuilt when the
 * camera moves.
 */

import { Color, Group, SRGBColorSpace, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { ELEV_BASE } from "./constants";
import type { SharedUniforms } from "./materials";
import { makeTreeGeometry } from "./models";
import { makePropMaterial, type CullUniforms } from "./propMaterial";

const VARIANTS = 6;

export class TreeSystem {
  readonly group = new Group();
  readonly cull: CullUniforms = { uCam: { value: new Vector3() }, uNearR: { value: 900 } };
  private data = new Float32Array(0);
  private count = 0;
  private near: InstancedMesh[] = [];
  private far: InstancedMesh[] = [];
  private lastCam = new Vector3(1e9, 0, 0);
  private dirty = true;
  private nearCap = 30000;
  castShadows = true;

  private u: SharedUniforms;

  constructor(u: SharedUniforms) {
    this.u = u;
  }

  /** Drop all trees (used when resident chunks change). */
  clear() {
    this.data = new Float32Array(0);
    this.count = 0;
    this.dirty = true;
    this.lastCam.set(1e9, 0, 0);
  }

  /** ``arr`` from a chunk: (x−ox, y−oy, z, height, variant+frac) per tree. */
  addChunk(arr: Float32Array, ox: number, oy: number) {
    const n = arr.length / 5;
    if (!n) return;
    const grown = new Float32Array((this.count + n) * 7);
    grown.set(this.data.subarray(0, this.count * 7));
    for (let i = 0; i < n; i++) {
      const o = (this.count + i) * 7;
      const s = i * 5;
      const vf = arr[s + 4];
      grown[o] = arr[s] + ox;
      grown[o + 1] = arr[s + 2] - ELEV_BASE - 0.2;
      grown[o + 2] = -(arr[s + 1] + oy);
      grown[o + 3] = arr[s + 3];
      grown[o + 4] = Math.floor(vf);
      grown[o + 5] = (vf - Math.floor(vf)) * Math.PI * 2 * 7.13;
      grown[o + 6] = vf - Math.floor(vf);
    }
    this.data = grown;
    this.count += n;
    this.dirty = true;
  }

  get total() {
    return this.count;
  }

  setNearRadius(r: number) {
    this.cull.uNearR.value = r;
    this.lastCam.set(1e9, 0, 0);
  }

  private colorFor(variant: number, f: number, out: Color): Color {
    const g = 0.75 + f * 0.5;
    if (variant >= 3) return out.setRGB(0.95 * g, 0.9 * g, 0.75 * g, SRGBColorSpace);
    return out.setRGB(Math.min(1, (0.8 + 0.3 * ((f * 7.3) % 1)) * g), Math.min(1, g), Math.min(1, (0.75 + 0.3 * ((f * 3.1) % 1)) * g), SRGBColorSpace);
  }

  private rebuildFar() {
    for (const m of this.far) {
      this.group.remove(m);
      m.dispose();
    }
    this.far = [];
    const counts = new Array(VARIANTS).fill(0);
    for (let i = 0; i < this.count; i++) counts[this.data[i * 7 + 4]]++;
    const mat = makePropMaterial(this.u, { leaf: true, cull: this.cull, roughness: 0.9 });
    const m4 = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const c = new Color();
    const up = new Vector3(0, 1, 0);
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = new InstancedMesh(makeTreeGeometry(v, "low"), mat, Math.max(1, counts[v]));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.far.push(mesh);
      this.group.add(mesh);
    }
    for (let i = 0; i < this.count; i++) {
      const o = i * 7;
      const v = this.data[o + 4];
      const mesh = this.far[v];
      const h = this.data[o + 3];
      p.set(this.data[o], this.data[o + 1], this.data[o + 2]);
      q.setFromAxisAngle(up, this.data[o + 5]);
      s.set(h * (0.9 + this.data[o + 6] * 0.3), h, h * (0.9 + this.data[o + 6] * 0.3));
      m4.compose(p, q, s);
      mesh.setMatrixAt(mesh.count, m4);
      mesh.setColorAt(mesh.count, this.colorFor(v, this.data[o + 6], c));
      mesh.count++;
    }
    for (const m of this.far) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private ensureNear() {
    if (this.near.length) return;
    const mat = makePropMaterial(this.u, { leaf: true, roughness: 0.85 });
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = new InstancedMesh(makeTreeGeometry(v, "high"), mat, this.nearCap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.near.push(mesh);
      this.group.add(mesh);
    }
  }

  update(cam: Vector3) {
    this.cull.uCam.value.copy(cam);
    if (this.dirty) {
      this.rebuildFar();
      this.dirty = false;
      this.lastCam.set(1e9, 0, 0);
    }
    this.ensureNear();
    for (const m of this.near) m.castShadow = this.castShadows;
    const dx = cam.x - this.lastCam.x;
    const dz = cam.z - this.lastCam.z;
    if (dx * dx + dz * dz < 40 * 40) return;
    this.lastCam.copy(cam);
    const r = this.cull.uNearR.value;
    const r2 = r * r;
    const m4 = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const c = new Color();
    const up = new Vector3(0, 1, 0);
    for (const m of this.near) m.count = 0;
    for (let i = 0; i < this.count; i++) {
      const o = i * 7;
      const ddx = this.data[o] - cam.x;
      const ddz = this.data[o + 2] - cam.z;
      if (ddx * ddx + ddz * ddz >= r2) continue;
      const v = this.data[o + 4];
      const mesh = this.near[v];
      if (mesh.count >= this.nearCap) continue;
      const h = this.data[o + 3];
      p.set(this.data[o], this.data[o + 1], this.data[o + 2]);
      q.setFromAxisAngle(up, this.data[o + 5]);
      const w = 0.9 + this.data[o + 6] * 0.3;
      s.set(h * w, h, h * w);
      m4.compose(p, q, s);
      mesh.setMatrixAt(mesh.count, m4);
      mesh.setColorAt(mesh.count, this.colorFor(v, this.data[o + 6], c));
      mesh.count++;
    }
    for (const m of this.near) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
