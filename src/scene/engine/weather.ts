/**
 * WeatherSimulationEngine — GPU-efficient rain streaks (not square points),
 * wetness uniforms, lightning flash. Driven by WeatherSimParams from live data.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from "three";
import type { SharedUniforms } from "./materials";
import { CLEAR_WEATHER, type WeatherSimParams } from "./weatherMap";

const MAX_RAIN = {
  low: 1200,
  medium: 3500,
  high: 7000,
  ultra: 10000,
} as const;

export type WeatherDetail = keyof typeof MAX_RAIN;

export class WeatherSystem {
  readonly group = new Group();
  private lines: LineSegments | null = null;
  /** Drop centres (x,y,z) × N. */
  private centres: Float32Array | null = null;
  /** Line vertex buffer: 2 verts per drop. */
  private linePos: Float32Array | null = null;
  private velocities: Float32Array | null = null;
  private streakLen: Float32Array | null = null;
  private params: WeatherSimParams = { ...CLEAR_WEATHER };
  private density = 0;
  private targetDensity = 0;
  private particleCount = 0;
  private activeCount = 0;
  private box = 120;
  private fall = 32;
  private windX = 0;
  private windZ = 0;
  private lightningT = 0;
  private nextFlash = 4;
  private flash = 0;
  private enabled = true;
  private detail: WeatherDetail = "high";
  private u: SharedUniforms;

  constructor(u: SharedUniforms) {
    this.u = u;
    this.group.name = "weather-sim";
    this.rebuildParticles();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.group.visible = on && this.density > 0.02;
  }

  setDetail(d: WeatherDetail) {
    if (d === this.detail) return;
    this.detail = d;
    this.rebuildParticles();
  }

  setParams(p: WeatherSimParams) {
    this.params = p;
    this.targetDensity = this.enabled ? p.rainDensity : 0;
    const rad = ((p.windDirDeg - 90) * Math.PI) / 180;
    const w = Math.min(40, p.windKmh) / 40;
    this.windX = Math.cos(rad) * w * 18;
    this.windZ = Math.sin(rad) * w * 18;
    this.u.uWet.value = p.wetness;
    this.u.uWindStrength.value = Math.min(1, p.windKmh / 45);
    this.u.uWindDir.value.set(Math.cos(rad), Math.sin(rad));
    this.u.uPrecip.value = p.rainDensity;
    if (!p.lightningEnabled) {
      this.flash = 0;
      this.u.uLightning.value = 0;
    }
  }

  getParams() {
    return this.params;
  }

  getLightningFlash() {
    return this.flash;
  }

  getFogBoost() {
    return this.params.fogBoost;
  }

  getSkyDarken() {
    return this.params.skyDarken;
  }

  private rebuildParticles() {
    if (this.lines) {
      this.group.remove(this.lines);
      this.lines.geometry.dispose();
      (this.lines.material as LineBasicMaterial).dispose();
      this.lines = null;
    }
    this.particleCount = MAX_RAIN[this.detail];
    this.centres = new Float32Array(this.particleCount * 3);
    this.linePos = new Float32Array(this.particleCount * 6);
    this.velocities = new Float32Array(this.particleCount);
    this.streakLen = new Float32Array(this.particleCount);
    for (let i = 0; i < this.particleCount; i++) {
      this.centres[i * 3] = (Math.random() - 0.5) * this.box * 2;
      this.centres[i * 3 + 1] = Math.random() * this.box;
      this.centres[i * 3 + 2] = (Math.random() - 0.5) * this.box * 2;
      this.velocities[i] = this.fall * (0.75 + Math.random() * 0.55);
      this.streakLen[i] = 0.9 + Math.random() * 1.4;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(this.linePos, 3));
    const mat = new LineBasicMaterial({
      color: new Color(0xa8c8e8),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.lines = new LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.group.add(this.lines);
  }

  private writeStreak(i: number, hide: boolean) {
    const lp = this.linePos!;
    const c = this.centres!;
    const i3 = i * 3;
    const i6 = i * 6;
    if (hide) {
      lp[i6] = lp[i6 + 1] = lp[i6 + 2] = 0;
      lp[i6 + 3] = lp[i6 + 4] = lp[i6 + 5] = 0;
      return;
    }
    const len = this.streakLen![i];
    const speed = this.velocities![i];
    // Direction of motion (wind + fall) — streak aligns with fall path.
    let dx = this.windX;
    let dy = -speed;
    let dz = this.windZ;
    const mag = Math.hypot(dx, dy, dz) || 1;
    dx = (dx / mag) * len;
    dy = (dy / mag) * len;
    dz = (dz / mag) * len;
    const x = c[i3];
    const y = c[i3 + 1];
    const z = c[i3 + 2];
    lp[i6] = x - dx * 0.5;
    lp[i6 + 1] = y - dy * 0.5;
    lp[i6 + 2] = z - dz * 0.5;
    lp[i6 + 3] = x + dx * 0.5;
    lp[i6 + 4] = y + dy * 0.5;
    lp[i6 + 5] = z + dz * 0.5;
  }

  update(dt: number, cam: Vector3) {
    const rate = this.targetDensity > this.density ? 1.2 : 0.7;
    this.density += (this.targetDensity - this.density) * Math.min(1, dt * rate);
    if (this.density < 0.001) this.density = this.targetDensity < 0.001 ? 0 : this.density;

    this.u.uWet.value += (this.params.wetness - this.u.uWet.value) * Math.min(1, dt * 0.8);

    if (!this.lines || !this.centres || !this.velocities || !this.linePos) return;
    const show = this.enabled && this.density > 0.02;
    this.lines.visible = show;
    this.group.visible = show;
    if (!show) {
      this.flash = Math.max(0, this.flash - dt * 4);
      this.u.uLightning.value = this.flash;
      return;
    }

    this.activeCount = Math.floor(this.particleCount * this.density);
    const c = this.centres;
    const vel = this.velocities;
    const box = this.box;
    const wx = this.windX;
    const wz = this.windZ;

    // Heavier rain → slightly longer streaks.
    const lenBoost = 0.85 + this.density * 0.7;

    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      c[i3] += wx * dt;
      c[i3 + 1] -= vel[i] * dt;
      c[i3 + 2] += wz * dt;
      if (c[i3 + 1] < cam.y - 25) {
        c[i3] = cam.x + (Math.random() - 0.5) * box * 2;
        c[i3 + 1] = cam.y + Math.random() * box * 0.7 + 10;
        c[i3 + 2] = cam.z + (Math.random() - 0.5) * box * 2;
      } else if (Math.abs(c[i3] - cam.x) > box || Math.abs(c[i3 + 2] - cam.z) > box) {
        c[i3] = cam.x + (Math.random() - 0.5) * box * 2;
        c[i3 + 2] = cam.z + (Math.random() - 0.5) * box * 2;
        c[i3 + 1] = cam.y + Math.random() * box * 0.55 + 6;
      }
      const baseLen = this.streakLen![i];
      this.streakLen![i] = baseLen; // keep base; boost applied in write via density
      // Temporarily scale length through write using density.
      const saved = this.streakLen![i];
      this.streakLen![i] = saved * lenBoost;
      this.writeStreak(i, false);
      this.streakLen![i] = saved;
    }
    for (let i = this.activeCount; i < this.particleCount; i++) {
      this.writeStreak(i, true);
    }
    (this.lines.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.lines.material as LineBasicMaterial).opacity = 0.22 + this.density * 0.35;

    if (this.params.lightningEnabled) {
      this.lightningT += dt;
      if (this.lightningT > this.nextFlash) {
        this.flash = 1;
        this.lightningT = 0;
        this.nextFlash = 3 + Math.random() * 8;
      }
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.5);
      this.u.uLightning.value = this.flash;
    } else {
      this.flash = 0;
      this.u.uLightning.value = 0;
    }
  }

  dispose() {
    if (this.lines) {
      this.group.remove(this.lines);
      this.lines.geometry.dispose();
      (this.lines.material as LineBasicMaterial).dispose();
      this.lines = null;
    }
  }
}
