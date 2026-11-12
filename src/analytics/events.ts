/**
 * Central typed event registry for PuneVerse product analytics.
 * Names are stable — do not rename without a PostHog insight migration.
 */

export const PV_EVENTS = {
  page_view: "pv_page_view",
  session_started: "pv_session_started",
  scene_loaded: "pv_scene_loaded",
  scene_load_failed: "pv_scene_load_failed",
  view_changed: "pv_view_changed",
  search_submitted: "pv_search_submitted",
  search_result_selected: "pv_search_result_selected",
  place_selected: "pv_place_selected",
  landmark_selected: "pv_landmark_selected",
  building_selected: "pv_building_selected",
  camera_exploration: "pv_camera_exploration",
  time_of_day_changed: "pv_time_of_day_changed",
  time_preset_selected: "pv_time_preset_selected",
  detail_level_changed: "pv_detail_level_changed",
  labels_toggled: "pv_labels_toggled",
  map_theme_changed: "pv_map_theme_changed",
  map_view_mode_changed: "pv_map_view_mode_changed",
  about_opened: "pv_about_opened",
  session_engagement: "pv_session_engagement",
  consent_changed: "pv_consent_changed",
} as const;

export type PvEventName = (typeof PV_EVENTS)[keyof typeof PV_EVENTS];

export type ViewKind = "scene" | "map";

export interface PvProps {
  view?: ViewKind;
  place_name?: string;
  place_type?: string;
  landmark_name?: string;
  building_name?: string | null;
  building_type?: string;
  building_height_m?: number;
  height_source?: string;
  /** Never raw free-text — length only. */
  query_len?: number;
  hit_count?: number;
  time_of_day_bucket?: string;
  detail_level?: string;
  labels_on?: boolean;
  camera_distance_bucket?: string;
  camera_pitch_bucket?: string;
  map_theme?: string;
  map_view_mode?: string;
  engaged?: boolean;
  interaction_count?: number;
  error?: string;
  consent?: "granted" | "denied";
  source?: "scene" | "map";
}

export function timeOfDayBucket(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h < 6) return "night";
  if (h < 9) return "sunrise";
  if (h < 16) return "day";
  if (h < 19) return "golden";
  return "night";
}

export function distanceBucket(metres: number): string {
  if (metres < 400) return "street";
  if (metres < 1200) return "neighbourhood";
  if (metres < 3500) return "district";
  return "city";
}

export function pitchBucket(deg: number): string {
  if (deg < 25) return "oblique";
  if (deg < 50) return "mid";
  return "top";
}

/** Drop undefined values and clamp string lengths for safe payloads. */
export function sanitizeProps(props: PvProps): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      const t = v.trim().slice(0, 80);
      if (t) out[k] = t;
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = Math.round(v * 10) / 10;
    } else if (typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}
