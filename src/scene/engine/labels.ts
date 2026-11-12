/**
 * Screen-space labels (DOM) with greedy collision culling, in the style of the
 * reference: small white text, orange dot for landmarks, spaced caps for areas.
 */

import { Vector3, type PerspectiveCamera } from "three";

export type LabelKind = "area" | "locality" | "landmark" | "tower" | "station" | "hill";

export interface LabelSpec {
  text: string;
  sub?: string;
  kind: LabelKind;
  world: Vector3;
  priority: number;
  maxDist: number;
}

interface Entry extends LabelSpec {
  el: HTMLDivElement;
  w: number;
  h: number;
  shown: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect, pad = 4): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

/** Greedy placement: highest priority first, drop anything that collides. */
export function placeLabels<T extends Rect & { priority: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const out: T[] = [];
  for (const it of sorted) {
    if (out.some((o) => overlaps(o, it))) continue;
    out.push(it);
  }
  return out;
}

export class LabelLayer {
  readonly root: HTMLDivElement;
  private entries: Entry[] = [];
  private v = new Vector3();
  enabled = true;
  groundY = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "pv-labels";
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
    parent.appendChild(this.root);
  }

  add(spec: LabelSpec) {
    const el = document.createElement("div");
    el.className = `pv-label pv-label-${spec.kind}`;
    if (spec.kind === "landmark" || spec.kind === "station" || spec.kind === "hill") {
      const dot = document.createElement("span");
      dot.className = "pv-dot";
      el.appendChild(dot);
    }
    const t = document.createElement("span");
    t.textContent = spec.text;
    el.appendChild(t);
    if (spec.sub) {
      const s = document.createElement("span");
      s.className = "pv-sub";
      s.textContent = ` · ${spec.sub}`;
      el.appendChild(s);
    }
    el.style.display = "none";
    this.root.appendChild(el);
    this.entries.push({ ...spec, el, w: 0, h: 0, shown: false });
  }

  update(camera: PerspectiveCamera, width: number, height: number) {
    if (!this.enabled) {
      this.root.style.display = "none";
      return;
    }
    this.root.style.display = "";
    const cand: (Rect & { priority: number; e: Entry })[] = [];
    const cam = camera.position;
    // Near the ground only nearby names make sense; from above, show more.
    const eye = Math.max(0, cam.y - this.groundY);
    // High eye altitude should still show far suburbs (Mumbai-style horizon labels).
    const reach = 500 + eye * 14;
    for (const e of this.entries) {
      const d = cam.distanceTo(e.world);
      if (d > Math.min(e.maxDist, reach)) {
        if (e.shown) {
          e.el.style.display = "none";
          e.shown = false;
        }
        continue;
      }
      this.v.copy(e.world).project(camera);
      if (this.v.z < -1 || this.v.z > 1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) {
        if (e.shown) {
          e.el.style.display = "none";
          e.shown = false;
        }
        continue;
      }
      if (!e.w) {
        e.el.style.display = "";
        e.w = e.el.offsetWidth || e.text.length * 7;
        e.h = e.el.offsetHeight || 14;
        e.el.style.display = "none";
      }
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      cand.push({ x: x - 4, y: y - e.h, w: e.w, h: e.h, priority: e.priority - d / e.maxDist, e });
    }
    const keep = new Set(placeLabels(cand).map((c) => c.e));
    for (const c of cand) {
      const on = keep.has(c.e);
      if (on) {
        c.e.el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
        c.e.el.style.opacity = String(Math.min(1, 1.6 - (c.e.world.distanceTo(cam) / c.e.maxDist) * 1.2));
      }
      if (on !== c.e.shown) {
        c.e.el.style.display = on ? "" : "none";
        c.e.shown = on;
      }
    }
  }

  dispose() {
    this.root.remove();
  }
}
