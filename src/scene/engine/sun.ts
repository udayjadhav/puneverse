/**
 * Solar position (NOAA low-precision formulas, ~0.5° accuracy) for a local
 * time-of-day in IST. Returns azimuth from north (clockwise) and elevation.
 */

const RAD = Math.PI / 180;

export interface SunPosition {
  azimuth: number;
  elevation: number;
}

export function sunPosition(
  hourIST: number,
  lat: number,
  lon: number,
  dayOfYear = 315,
): SunPosition {
  const tz = 5.5;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hourIST - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const tst = hourIST * 60 + eqTime + 4 * lon - 60 * tz;
  const ha = (tst / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const elevation = 90 - zen / RAD;
  const az =
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD +
    180;
  return { azimuth: ((az % 360) + 360) % 360, elevation };
}

/** 0 = full night, 1 = full day; smooth through civil twilight. */
export function dayFactor(elevation: number): number {
  const t = (elevation + 6) / 12;
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
