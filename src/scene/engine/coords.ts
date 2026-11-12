/**
 * Scene coordinates. Assets use local metres (x east, y north, z up) relative to
 * the origin in the manifest. Three.js is Y-up, so world = (x, z, -y).
 */

import { Vector3 } from "three";
import { ELEV_BASE } from "./constants";

export function toWorld(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  return out.set(x, z - ELEV_BASE, -y);
}

export function fromWorld(v: Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: -v.z, z: v.y + ELEV_BASE };
}

const UTM_K0 = 0.9996;
const M_PER_DEG_LAT = 110574;

/**
 * Local metres to lon/lat. Small-area inverse around the origin; within the
 * ~10 km scene the error stays under a few metres, which is enough for the
 * on-screen readout.
 */
export function localToLonLat(x: number, y: number, origin: [number, number]): [number, number] {
  const [lon0, lat0] = origin;
  const lat = lat0 + y / UTM_K0 / M_PER_DEG_LAT;
  const midLat = ((lat0 + lat) / 2) * (Math.PI / 180);
  const lon = lon0 + x / UTM_K0 / (111320 * Math.cos(midLat));
  return [lon, lat];
}
