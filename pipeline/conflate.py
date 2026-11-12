"""Conflate OSM buildings with Overture Maps buildings for one bbox.

OSM features are always kept (they carry the richest tags). An Overture feature is
added only when its footprint is NOT already an OSM footprint:

* Overture features whose geometry source is OpenStreetMap are the same OSM ways
  (Overture re-publishes them) — they only contribute lineage, never a duplicate.
* Any other Overture feature (Google Open Buildings, Microsoft ML Buildings, Esri, …)
  is dropped when it overlaps an OSM footprint with IoU >= ``IOU_MATCH`` or when
  >= ``CONTAINED_MATCH`` of its own area lies inside one OSM footprint.

Height precedence (Q6 — never invent):
  1. OSM explicit ``height`` / ``building:height``                    -> osm_explicit
  2. Overture ``height`` whose height source is not OSM               -> overture_height
  3. OSM ``building:levels`` or Overture ``num_floors`` x floor height -> *_levels_estimate
  4. unknown -> no height (flat footprint)
"""

from __future__ import annotations

from typing import Iterable

from shapely.geometry import shape
from shapely.strtree import STRtree

from heights import SOURCE_EXPLICIT, SOURCE_LEVELS, SOURCE_UNKNOWN

IOU_MATCH = 0.3
CONTAINED_MATCH = 0.5

SOURCE_OVERTURE_HEIGHT = "overture_height"
SOURCE_OVERTURE_LEVELS = "overture_levels_estimate"

CONFIDENCE = {
    SOURCE_EXPLICIT: "high",
    SOURCE_OVERTURE_HEIGHT: "medium",
    SOURCE_LEVELS: "medium",
    SOURCE_OVERTURE_LEVELS: "medium",
    SOURCE_UNKNOWN: "none",
}

OVERTURE_DATASET_KEYS = {
    "OpenStreetMap": "osm",
    "Google Open Buildings": "google_open_buildings",
    "Microsoft ML Buildings": "microsoft_ml_buildings",
    "Esri Community Maps": "esri",
}


def geometry_dataset(sources: Iterable[dict]) -> str:
    """Dataset that supplied the footprint (``property`` empty = whole feature)."""
    srcs = list(sources or [])
    for s in srcs:
        if not s.get("property"):
            return str(s.get("dataset") or "unknown")
    return str(srcs[0].get("dataset")) if srcs else "unknown"


def height_dataset(sources: Iterable[dict]) -> str:
    srcs = list(sources or [])
    for s in srcs:
        if str(s.get("property") or "").endswith("height"):
            return str(s.get("dataset"))
    return geometry_dataset(srcs)


def iou(a, b) -> float:
    inter = a.intersection(b).area
    if inter == 0:
        return 0.0
    return inter / (a.area + b.area - inter)


def match_osm(candidate, tree: STRtree, osm_geoms: list) -> tuple[float, float]:
    """Best (IoU, contained fraction) of ``candidate`` against OSM footprints."""
    best_iou = 0.0
    best_contained = 0.0
    for idx in tree.query(candidate):
        g = osm_geoms[int(idx)]
        inter = candidate.intersection(g).area
        if inter == 0:
            continue
        best_iou = max(best_iou, inter / (candidate.area + g.area - inter))
        if candidate.area > 0:
            best_contained = max(best_contained, inter / candidate.area)
    return best_iou, best_contained


def overture_height_props(props: dict, floor_height_m: float) -> dict:
    """Height props for an Overture-only footprint (no OSM tags available)."""
    out: dict = {}
    h = props.get("height")
    floors = props.get("num_floors")
    h_src = height_dataset(props.get("sources") or [])
    if h is not None and float(h) > 0 and h_src != "OpenStreetMap":
        out["normalized_height_m"] = round(float(h), 2)
        out["height_source"] = SOURCE_OVERTURE_HEIGHT
        out["height_dataset"] = h_src
    elif floors is not None and float(floors) > 0:
        out["normalized_height_m"] = round(float(floors) * floor_height_m, 2)
        out["height_source"] = SOURCE_OVERTURE_LEVELS
        out["levels"] = float(floors)
        out["floor_height_m"] = floor_height_m
    elif h is not None and float(h) > 0:
        # Overture height that came from OSM on a feature OSM did not export.
        out["normalized_height_m"] = round(float(h), 2)
        out["height_source"] = SOURCE_EXPLICIT
        out["height_dataset"] = "OpenStreetMap"
    else:
        out["height_source"] = SOURCE_UNKNOWN
    if "normalized_height_m" in out:
        base = float(props.get("min_height") or 0.0)
        out["normalized_base_height_m"] = round(base if base < out["normalized_height_m"] else 0.0, 2)
    out["height_confidence"] = CONFIDENCE[out["height_source"]]
    return out


def conflate(
    osm_features: list,
    overture_features: list,
    floor_height_m: float,
    next_id_start: int,
) -> tuple[list, dict]:
    """Return (merged features, stats). Input OSM features are not mutated."""
    osm_geoms = [shape(f["geometry"]) for f in osm_features]
    tree = STRtree(osm_geoms)
    merged = []
    for f in osm_features:
        props = dict(f["properties"])
        props["source"] = "osm"
        props["source_id"] = props.get("source_feature_id")
        props["footprint_dataset"] = "OpenStreetMap"
        merged.append({"type": "Feature", "id": f["id"], "properties": props, "geometry": f["geometry"]})

    stats = {
        "overture_total": len(overture_features),
        "overture_osm_sourced": 0,
        "overture_dropped_iou": 0,
        "overture_dropped_contained": 0,
        "overture_added": 0,
        "overture_added_by_dataset": {},
        "iou_match": IOU_MATCH,
        "contained_match": CONTAINED_MATCH,
    }
    next_id = next_id_start
    for f in overture_features:
        p = f["properties"]
        ds = geometry_dataset(p.get("sources") or [])
        if ds == "OpenStreetMap":
            stats["overture_osm_sourced"] += 1
            continue
        g = shape(f["geometry"])
        if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        best_iou, contained = match_osm(g, tree, osm_geoms)
        if best_iou >= IOU_MATCH:
            stats["overture_dropped_iou"] += 1
            continue
        if contained >= CONTAINED_MATCH:
            stats["overture_dropped_contained"] += 1
            continue
        props = {
            "building_type": str(p.get("class") or p.get("subtype") or "yes"),
            "source": "overture",
            "source_id": p.get("id"),
            "footprint_dataset": ds,
            "source_dataset": "overture",
            "validation_status": "ok",
        }
        if p.get("name"):
            props["name"] = str(p["name"])
        props.update(overture_height_props(p, floor_height_m))
        merged.append({"type": "Feature", "id": next_id, "properties": props, "geometry": f["geometry"]})
        next_id += 1
        stats["overture_added"] += 1
        stats["overture_added_by_dataset"][ds] = stats["overture_added_by_dataset"].get(ds, 0) + 1
    return merged, stats
