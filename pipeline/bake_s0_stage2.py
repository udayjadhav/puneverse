#!/usr/bin/env python3
"""Stage 2 S0 bake: OSM + Overture buildings, slim roads, real context layers.

Inputs (all local, S0 bbox only):
  data/processed/buildings.geojson         (from bake_center.py — normalized OSM heights)
  data/processed/overture/building.geojson (from fetch_overture_s0.py)
  data/processed/pune-center.osm.pbf       (S0 OSM clip)

Outputs:
  public/tiles/buildings.pmtiles  layer ``buildings``   (conflated, lineage per feature)
  public/tiles/roads.pmtiles      layer ``roads``       (allow-listed tags, z16)
  public/tiles/context.pmtiles    layers water, waterway, green, rail, station, place, tree
  public/data/buildings.stats.json, data/processed/manifest-s0.json (updated)
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shapely.geometry import shape  # noqa: E402

from bake_center import (  # noqa: E402
    PROCESSED,
    PUBLIC_DATA,
    PUBLIC_TILES,
    read_bbox,
    run,
    which,
    write_collection,
)
from conflate import SOURCE_OVERTURE_HEIGHT, SOURCE_OVERTURE_LEVELS, conflate  # noqa: E402
from heights import (  # noqa: E402
    FLOOR_HEIGHT_M_DEFAULT,
    SOURCE_EXPLICIT,
    SOURCE_LEVELS,
    SOURCE_UNKNOWN,
)

OVERTURE_DIR = PROCESSED / "overture"
MAXZOOM = 16

ROAD_KEYS = ("highway", "name", "name:en", "ref", "bridge", "tunnel", "layer", "oneway", "lanes")

GREEN_TAGS = {
    ("leisure", "park"): "park",
    ("leisure", "garden"): "garden",
    ("leisure", "nature_reserve"): "nature_reserve",
    ("leisure", "pitch"): "pitch",
    ("leisure", "golf_course"): "golf_course",
    ("landuse", "forest"): "forest",
    ("natural", "wood"): "wood",
    ("natural", "scrub"): "scrub",
    ("natural", "grassland"): "grassland",
    ("landuse", "grass"): "grass",
    ("landuse", "meadow"): "meadow",
    ("landuse", "recreation_ground"): "recreation_ground",
    ("landuse", "village_green"): "village_green",
    ("landuse", "cemetery"): "cemetery",
}

PLACE_VALUES = ("suburb", "neighbourhood", "quarter", "locality")
RAIL_VALUES = ("rail", "subway", "light_rail", "narrow_gauge", "monorail")

CONTEXT_FILTERS = [
    "nwr/natural=water,wood,scrub,grassland,tree",
    "nwr/water",
    "nwr/landuse=reservoir,basin,forest,grass,meadow,recreation_ground,village_green,cemetery",
    "nwr/leisure=park,garden,nature_reserve,pitch,golf_course",
    "w/waterway=river,stream,canal,drain,ditch",
    "w/railway=" + ",".join(RAIL_VALUES),
    "nwr/railway=station,halt",
    "nwr/station=subway,light_rail",
    "nwr/public_transport=station",
    "n/place=" + ",".join(PLACE_VALUES),
]


def classify(tags: dict, geom_type: str) -> list[tuple[str, dict]]:
    """Map one OSM feature to zero or more context layers with slim props."""
    out: list[tuple[str, dict]] = []
    name = tags.get("name:en") or tags.get("name")
    base = {"name": name} if name else {}
    poly = geom_type in ("Polygon", "MultiPolygon")
    line = geom_type in ("LineString", "MultiLineString")
    point = geom_type == "Point"

    if poly and (
        tags.get("natural") == "water"
        or "water" in tags
        or tags.get("landuse") in ("reservoir", "basin")
    ):
        kind = tags.get("water") or tags.get("landuse") or "water"
        out.append(("water", {**base, "kind": kind}))
    if line and tags.get("waterway"):
        out.append(("waterway", {**base, "kind": tags["waterway"]}))
    if poly:
        for (k, v), kind in GREEN_TAGS.items():
            if tags.get(k) == v:
                out.append(("green", {**base, "kind": kind}))
                break
    if line and tags.get("railway") in RAIL_VALUES:
        props = {**base, "kind": tags["railway"]}
        for k in ("bridge", "tunnel", "layer"):
            if tags.get(k):
                props[k] = tags[k]
        out.append(("rail", props))
    is_station = (
        tags.get("railway") in ("station", "halt")
        or tags.get("station") in ("subway", "light_rail")
        or (tags.get("public_transport") == "station" and tags.get("train") == "yes")
    )
    if is_station and (point or poly) and name:
        kind = "metro" if tags.get("station") in ("subway", "light_rail") or tags.get("subway") == "yes" else "rail"
        out.append(("station", {**base, "kind": kind}))
    if point and tags.get("place") in PLACE_VALUES and name:
        out.append(("place", {**base, "kind": tags["place"]}))
    if point and tags.get("natural") == "tree":
        out.append(("tree", {"kind": "surveyed"}))
    return out


def polygon_centroid_point(geom: dict) -> dict:
    c = shape(geom).representative_point()
    return {"type": "Point", "coordinates": [round(c.x, 7), round(c.y, 7)]}


def extract_context(osmium: str, clipped: Path, work: Path) -> tuple[dict, dict]:
    filtered = work / "context.osm.pbf"
    raw = work / "context.raw.geojsonseq"
    run([osmium, "tags-filter", str(clipped), *CONTEXT_FILTERS, "-o", str(filtered), "--overwrite"])
    run([osmium, "export", str(filtered), "-o", str(raw), "-f", "geojsonseq", "--overwrite"])
    layers: dict = {k: [] for k in ("water", "waterway", "green", "rail", "station", "place", "tree")}
    invalid = Counter()
    for line in raw.read_text().splitlines():
        line = line.strip().lstrip("\x1e")
        if not line:
            continue
        f = json.loads(line)
        geom = f.get("geometry")
        if not geom:
            continue
        tags = {k: v for k, v in (f.get("properties") or {}).items() if isinstance(v, str)}
        for layer, props in classify(tags, geom["type"]):
            g = geom
            if layer == "station" and geom["type"] != "Point":
                g = polygon_centroid_point(geom)
            if g["type"] in ("Polygon", "MultiPolygon") and not shape(g).is_valid:
                invalid[layer] += 1
            layers[layer].append({"type": "Feature", "properties": props, "geometry": g})
    # Station nodes and station areas often describe the same station.
    seen = set()
    stations = []
    for f in layers["station"]:
        key = (f["properties"].get("name"), f["properties"]["kind"])
        if key in seen:
            continue
        seen.add(key)
        stations.append(f)
    layers["station"] = stations
    return layers, dict(invalid)


def slim_roads(src: Path, dst: Path) -> dict:
    data = json.loads(src.read_text())
    feats = []
    bridges = 0
    for f in data.get("features", []):
        tags = f.get("properties") or {}
        geom = f.get("geometry")
        if not geom:
            continue
        props = {k: tags[k] for k in ROAD_KEYS if tags.get(k) not in (None, "")}
        if props.get("bridge"):
            bridges += 1
        feats.append({"type": "Feature", "properties": props, "geometry": geom})
    write_collection(dst, feats)
    return {"roads": len(feats), "bridges": bridges}


def tippecanoe_buildings(tippe: str, gj: Path, out: Path) -> list:
    cmd = [
        tippe, "-o", str(out), "-l", "buildings",
        "--minimum-zoom=12", f"--maximum-zoom={MAXZOOM}",
        "--no-feature-limit", "--no-tile-size-limit", "--no-tiny-polygon-reduction",
        "--attribution=© OpenStreetMap contributors; Overture Maps Foundation",
        "--quiet", "--force", str(gj),
    ]
    run(cmd)
    return cmd


def tippecanoe_roads(tippe: str, gj: Path, out: Path) -> list:
    cmd = [
        tippe, "-o", str(out), "-l", "roads",
        "--minimum-zoom=10", f"--maximum-zoom={MAXZOOM}",
        "--no-feature-limit", "--no-tile-size-limit", "--no-line-simplification",
        "--attribution=© OpenStreetMap contributors", "--quiet", "--force", str(gj),
    ]
    run(cmd)
    return cmd


def tippecanoe_context(tippe: str, layer_files: dict, out: Path) -> list:
    cmd = [
        tippe, "-o", str(out),
        "--minimum-zoom=10", f"--maximum-zoom={MAXZOOM}",
        "--no-feature-limit", "--no-tile-size-limit", "--no-tiny-polygon-reduction",
        "--attribution=© OpenStreetMap contributors", "--quiet", "--force",
    ]
    for layer, path in layer_files.items():
        cmd += ["-L", f"{layer}:{path}"]
    run(cmd)
    return cmd


def decode_counts(pmtiles: Path, zoom: int = MAXZOOM) -> dict:
    """Distinct feature ids per layer at ``zoom`` (features without id are counted)."""
    res = subprocess.run(
        [which("tippecanoe-decode") or "tippecanoe-decode", "-z", str(zoom), "-Z", str(zoom), str(pmtiles)],
        check=True, capture_output=True, text=True,
    )
    doc = json.loads(res.stdout)
    ids: dict = {}
    pieces: Counter = Counter()
    for tile in doc["features"]:
        for layer in tile["features"]:
            name = layer["properties"]["layer"]
            for f in layer["features"]:
                pieces[name] += 1
                if "id" in f:
                    ids.setdefault(name, set()).add(f["id"])
    return {"pieces": dict(pieces), "distinct_ids": {k: len(v) for k, v in ids.items()}}


def height_stats(features: list) -> dict:
    blds = [f for f in features if not f["properties"].get("is_building_part")]
    src = Counter(f["properties"]["height_source"] for f in blds)
    by_src = Counter(f["properties"].get("source") for f in blds)
    by_fp = Counter(f["properties"].get("footprint_dataset") for f in blds)
    n = len(blds)
    known = n - src.get("unknown", 0)
    return {
        "buildings": n,
        "building_parts": len(features) - n,
        "by_source": dict(by_src),
        "by_footprint_dataset": dict(by_fp),
        "height_source": dict(src),
        "pct_with_height": round(100.0 * known / n, 2) if n else 0.0,
        "named": sum(1 for f in blds if f["properties"].get("name")),
    }


def public_stats(hs: dict, conf_stats: dict, ov_release: str, osm: list, floor_height_m: float) -> dict:
    """Shape read by the app (src/map/buildingStats.ts)."""
    src = hs["height_source"]
    n = hs["buildings"]
    explicit = src.get(SOURCE_EXPLICIT, 0)
    overture_h = src.get(SOURCE_OVERTURE_HEIGHT, 0)
    levels = src.get(SOURCE_LEVELS, 0) + src.get(SOURCE_OVERTURE_LEVELS, 0)
    unknown = src.get(SOURCE_UNKNOWN, 0)
    pct = lambda v: round(100.0 * v / n, 2) if n else 0.0  # noqa: E731
    osm_dataset = osm[0]["properties"].get("source_dataset", "osm") if osm else "osm"
    return {
        "description": "Building coverage for the S0 center bake (not full PMC/PCMC).",
        "bbox": [float(v) for v in read_bbox().split(",")],
        "source_dataset": f"{osm_dataset} + overture-buildings@{ov_release}",
        "floor_height_m": floor_height_m,
        "buildings": n,
        "building_parts": hs["building_parts"],
        "height_explicit": explicit,
        "height_overture": overture_h,
        "height_levels_estimate": levels,
        "height_unknown": unknown,
        "pct_explicit": pct(explicit),
        "pct_overture": pct(overture_h),
        "pct_levels_estimate": pct(levels),
        "pct_with_height": pct(explicit + overture_h + levels),
        "pct_unknown": pct(unknown),
        "by_footprint_dataset": hs["by_footprint_dataset"],
        "overture_added": conf_stats["overture_added"],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--floor-height-m", type=float, default=FLOOR_HEIGHT_M_DEFAULT)
    args = ap.parse_args()
    osmium = which("osmium")
    tippe = which("tippecanoe")
    if not osmium or not tippe:
        raise SystemExit("osmium + tippecanoe required (docs/TOOLING.md)")

    osm = json.loads((PROCESSED / "buildings.geojson").read_text())["features"]
    ov_path = OVERTURE_DIR / "building.geojson"
    if not ov_path.is_file():
        raise SystemExit("run pipeline/fetch_overture_s0.py first")
    ov = json.loads(ov_path.read_text())["features"]
    ov_release = json.loads((OVERTURE_DIR / "fetch-summary.json").read_text())["release"]
    merged, conf_stats = conflate(osm, ov, args.floor_height_m, max(f["id"] for f in osm) + 1)
    invalid_buildings = sum(1 for f in merged if not shape(f["geometry"]).is_valid)
    merged_gj = PROCESSED / "buildings.conflated.geojson"
    write_collection(merged_gj, merged)
    b_cmd = tippecanoe_buildings(tippe, merged_gj, PUBLIC_TILES / "buildings.pmtiles")
    b_check = decode_counts(PUBLIC_TILES / "buildings.pmtiles")
    b_ids = b_check["distinct_ids"].get("buildings", 0)
    if b_ids != len(merged):
        raise SystemExit(f"buildings tiles lost features: {b_ids} != {len(merged)}")

    roads_gj = PROCESSED / "roads.slim.geojson"
    r_stats = slim_roads(PROCESSED / "roads.raw.geojson", roads_gj)
    r_cmd = tippecanoe_roads(tippe, roads_gj, PUBLIC_TILES / "roads.pmtiles")

    layers, invalid_ctx = extract_context(osmium, PROCESSED / "pune-center.osm.pbf", PROCESSED)
    layer_files = {}
    for name, feats in layers.items():
        p = PROCESSED / f"context.{name}.geojson"
        write_collection(p, feats)
        layer_files[name] = p
    c_cmd = tippecanoe_context(tippe, layer_files, PUBLIC_TILES / "context.pmtiles")
    c_check = decode_counts(PUBLIC_TILES / "context.pmtiles")

    hs = height_stats(merged)
    context_counts = {k: len(v) for k, v in layers.items()}
    context_counts["water_named"] = sum(1 for f in layers["water"] if f["properties"].get("name"))
    report = {
        "bbox": [float(v) for v in read_bbox().split(",")],
        "overture_release": ov_release,
        "floor_height_m": args.floor_height_m,
        "conflation": conf_stats,
        "buildings": hs,
        "buildings_invalid_geometry": invalid_buildings,
        "buildings_tile_distinct_ids_z16": b_ids,
        "roads": r_stats,
        "context_counts": context_counts,
        "context_invalid_polygons": invalid_ctx,
        "context_tile_check_z16": c_check,
        "tiles_bytes": {
            p.name: p.stat().st_size for p in sorted(PUBLIC_TILES.glob("*.pmtiles"))
        },
        "cmds": {
            "buildings": " ".join(Path(b_cmd[0]).name if i == 0 else str(c) for i, c in enumerate(b_cmd)),
            "roads": " ".join(Path(r_cmd[0]).name if i == 0 else str(c) for i, c in enumerate(r_cmd)),
            "context": " ".join(Path(c_cmd[0]).name if i == 0 else str(c) for i, c in enumerate(c_cmd)),
        },
    }
    manifest_path = PROCESSED / "manifest-s0.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else {}
    manifest["stage2"] = report
    manifest_path.write_text(json.dumps(manifest, indent=2).replace(str(PROCESSED.parent.parent) + "/", "") + "\n")

    public = public_stats(hs, conf_stats, ov_release, osm, args.floor_height_m)
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA / "buildings.stats.json").write_text(json.dumps(public, indent=2) + "\n")
    trees = {
        "description": "Surveyed single trees (OSM natural=tree nodes) in the S0 center bbox.",
        "source": "OpenStreetMap natural=tree",
        "points": [f["geometry"]["coordinates"] for f in layers["tree"]],
    }
    (PUBLIC_DATA / "trees.surveyed.json").write_text(json.dumps(trees, separators=(",", ":")) + "\n")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
