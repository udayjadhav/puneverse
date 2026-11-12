/** World Y = elevation − ELEV_BASE, so the city floor sits near y = 0. */
export const ELEV_BASE = 540;

/** Honours Vite `base` so GitHub project pages (`/puneverse/`) still load the bake. */
const BASE = String(import.meta.env.BASE_URL || "/").replace(/\/$/, "");
export const SCENE_URL = `${BASE}/scene/s0`;

export const PUNE_LAT = 18.5195;
export const PUNE_LON = 73.8553;
