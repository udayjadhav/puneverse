/**
 * Camera: MapControls (left-drag pan, right-drag orbit, wheel zoom) + WASD/QE
 * flight, terrain clamping and smooth fly-to.
 */

import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";

export interface FlyTarget {
  target: Vector3;
  position: Vector3;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Camera placement looking at ``target`` from ``dist`` m at pitch/bearing. */
export function orbitPose(target: Vector3, dist: number, pitchDeg: number, bearingDeg: number): FlyTarget {
  const pitch = MathUtils.degToRad(pitchDeg);
  const bearing = MathUtils.degToRad(bearingDeg);
  // Bearing 0 = camera looks north (sits to the south).
  const horiz = Math.cos(pitch) * dist;
  const pos = new Vector3(
    target.x - Math.sin(bearing) * horiz,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(bearing) * horiz,
  );
  return { target: target.clone(), position: pos };
}

export class CameraRig {
  readonly controls: MapControls;
  private keys = new Set<string>();
  private fly: { from: FlyTarget; to: FlyTarget; t: number; dur: number; arc: number } | null = null;
  groundAt: (x: number, z: number) => number = () => 0;

  readonly camera: PerspectiveCamera;
  readonly dom: HTMLElement;

  constructor(camera: PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.dom = dom;
    const c = new MapControls(camera, dom);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.screenSpacePanning = false;
    c.maxPolarAngle = MathUtils.degToRad(88);
    c.minDistance = 12;
    c.maxDistance = 14000;
    c.zoomSpeed = 1.2;
    c.zoomToCursor = true;
    this.controls = c;
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    const k = e.key.toLowerCase();
    if (!["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) return;
    if (e.type === "keydown") this.keys.add(k);
    else this.keys.delete(k);
  };

  flyTo(to: FlyTarget, dur = 2.2) {
    const from = { target: this.controls.target.clone(), position: this.camera.position.clone() };
    const d = from.target.distanceTo(to.target);
    // Small arc only — a tall hop forces a top-down mid-flight and feels unlike Mumbai Worli jumps.
    this.fly = { from, to, t: 0, dur, arc: Math.min(280, d * 0.06) };
  }

  jumpTo(to: FlyTarget) {
    this.fly = null;
    this.controls.target.copy(to.target);
    this.camera.position.copy(to.position);
    this.controls.update();
  }

  get flying() {
    return this.fly !== null;
  }

  update(dt: number) {
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = easeInOutCubic(f.t);
      this.controls.target.lerpVectors(f.from.target, f.to.target, e);
      this.camera.position.lerpVectors(f.from.position, f.to.position, e);
      this.camera.position.y += Math.sin(Math.PI * e) * f.arc;
      if (f.t >= 1) this.fly = null;
    }
    if (this.keys.size) {
      const dist = this.camera.position.distanceTo(this.controls.target);
      const speed = Math.max(15, dist * 0.9) * dt * (this.keys.has("shift") ? 3 : 1);
      const fwd = new Vector3().subVectors(this.controls.target, this.camera.position);
      fwd.y = 0;
      fwd.normalize();
      const right = new Vector3(-fwd.z, 0, fwd.x);
      const mv = new Vector3();
      if (this.keys.has("w") || this.keys.has("arrowup")) mv.add(fwd);
      if (this.keys.has("s") || this.keys.has("arrowdown")) mv.sub(fwd);
      if (this.keys.has("d") || this.keys.has("arrowright")) mv.add(right);
      if (this.keys.has("a") || this.keys.has("arrowleft")) mv.sub(right);
      mv.multiplyScalar(speed);
      if (this.keys.has("e")) mv.y += speed * 0.6;
      if (this.keys.has("q")) mv.y -= speed * 0.6;
      this.camera.position.add(mv);
      this.controls.target.add(new Vector3(mv.x, 0, mv.z));
    }
    this.controls.update();
    // Keep the target on the ground and the eye above it.
    const gt = this.groundAt(this.controls.target.x, this.controls.target.z);
    if (!this.fly) this.controls.target.y += (gt - this.controls.target.y) * 0.15;
    const ge = this.groundAt(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < ge + 3) this.camera.position.y = ge + 3;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    this.controls.dispose();
  }
}
