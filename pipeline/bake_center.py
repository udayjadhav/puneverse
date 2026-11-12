#!/usr/bin/env python3
"""
Option 0 — S0 center bake: clip Geofabrik western-zone → enrich → tippecanoe PMTiles.

Requires: osmium (CLI), tippecanoe on PATH (or TOOLS_BIN).
Does not invent heights. Unknown buildings stay without height_m.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from heights import (  # noqa: E402
    FLOOR_HEIGHT_M_DEFAULT,
    SOURCE_EXPLICIT,
    SOURCE_LEVELS,
    SOURCE_UNKNOWN,
    normalize_heights,
    source_feature_id_from_area_id,
)

ROOT = Path(__file__).resolve().parents[1]
RAW_DEFAULT = ROOT / "data" / "raw" / "western-zone-latest.osm.pbf"
BBOX_FILE = ROOT / "data" / "boundaries" / "pune-center.bbox"
PROCESSED = ROOT / "data" / "processed"
PUBLIC_TILES = ROOT / "public" / "tiles"
FIXTURES = ROOT / "public" / "data" / "fixtures"
PUBLIC_DATA = ROOT / "public" / "data"

TOOLS_BIN = Path(os.environ.get("TOOLS_BIN", ROOT / "tools" / "bin"))


def which(name: str) -> str | None:
    """Prefer Homebrew / system PATH over tools/bin (broken dylib copies)."""
    env_path = os.environ.get("PATH", "")
    # Homebrew first, then PATH, then tools/bin last
    candidates = f"/opt/homebrew/bin:/usr/local/bin:{env_path}"
    if TOOLS_BIN.is_dir():
        candidates = f"{candidates}:{TOOLS_BIN}"
    return shutil.which(name, path=candidates)


def run(cmd: list[str], **kwargs) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kwargs)


def read_bbox() -> str:
    text = BBOX_FILE.read_text().strip()
    parts = [p.strip() for p in text.split(",")]
    if len(parts) != 4:
        raise SystemExit(f"bad bbox in {BBOX_FILE}")
    return ",".join(parts)


def dataset_date(pbf: Path) -> str:
    """YYYY-MM-DD from the PBF header timestamp (Geofabrik replication time)."""
    osmium = which("osmium")
    if not osmium:
        return "unknown-date"
    res = subprocess.run(
        [osmium, "fileinfo", "-e", "-g", "header.option.timestamp", str(pbf)],
        check=False,
        capture_output=True,
        text=True,
    )
    ts = res.stdout.strip()
    return ts[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", ts) else "unknown-date"


def building_properties(
    tags: dict,
    area_id: int,
    source_dataset: str,
    floor_height_m: float,
) -> dict:
    """Allow-listed tile properties for one building (no high-cardinality tags)."""
    is_part = "building" not in tags and "building:part" in tags
    btype = tags.get("building:part") if is_part else tags.get("building")
    props: dict = {
        "building_type": str(btype) if btype else "yes",
        "source_dataset": source_dataset,
        "source_feature_id": source_feature_id_from_area_id(area_id),
    }
    if is_part:
        props["is_building_part"] = True
    if tags.get("name"):
        props["name"] = str(tags["name"])
    props.update(normalize_heights(tags, floor_height_m))
    return props


def enrich_buildings(
    src_seq: Path,
    dst: Path,
    source_dataset: str,
    floor_height_m: float,
) -> dict:
    """GeoJSONSeq (osmium --add-unique-id=type_id) → normalized FeatureCollection.

    Returns coverage stats. Feature ``id`` is the numeric osmium area id so the
    vector tiles carry stable ids (click / feature-state).
    """
    feats = []
    for line in src_seq.read_text().splitlines():
        line = line.strip().lstrip("\x1e")
        if not line:
            continue
        f = json.loads(line)
        geom = f.get("geometry")
        if not geom:
            continue
        uid = str(f.get("id") or "")
        if not uid.startswith("a") or not uid[1:].isdigit():
            raise SystemExit(f"unexpected osmium unique id {uid!r}")
        area_id = int(uid[1:])
        tags = {k: v for k, v in (f.get("properties") or {}).items() if isinstance(v, str)}
        props = building_properties(tags, area_id, source_dataset, floor_height_m)
        feats.append({"type": "Feature", "id": area_id, "properties": props, "geometry": geom})
    n_outlines = mark_outlines_with_extruded_parts(feats)
    write_collection(dst, feats)
    stats = coverage_stats(feats)
    stats["outlines_with_extruded_parts"] = n_outlines
    return stats


def _outer_rings(geom: dict) -> list:
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [poly[0] for poly in geom["coordinates"]]
    return []


def _point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _ring_centroid(ring: list) -> tuple:
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def mark_outlines_with_extruded_parts(features: list) -> int:
    """Flag outline buildings that contain a ``building:part`` with a known height.

    Simple 3D Buildings: when parts carry the 3D shape, the outline must not be
    extruded as well (it would hide the parts). Returns the number of outlines flagged.
    """
    parts = [
        f
        for f in features
        if f["properties"].get("is_building_part")
        and f["properties"]["height_source"] != SOURCE_UNKNOWN
    ]
    if not parts:
        return 0
    outlines = []
    for f in features:
        if f["properties"].get("is_building_part"):
            continue
        rings = _outer_rings(f["geometry"])
        if not rings:
            continue
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        outlines.append((min(xs), min(ys), max(xs), max(ys), rings, f))
    flagged = set()
    for part in parts:
        rings = _outer_rings(part["geometry"])
        if not rings:
            continue
        x, y = _ring_centroid(rings[0])
        for x0, y0, x1, y1, o_rings, outline in outlines:
            if x0 <= x <= x1 and y0 <= y <= y1 and any(_point_in_ring(x, y, r) for r in o_rings):
                outline["properties"]["has_extruded_parts"] = True
                flagged.add(id(outline))
    return len(flagged)


def coverage_stats(features: list) -> dict:
    total = len(features)
    parts = sum(1 for f in features if f["properties"].get("is_building_part"))
    buildings = [f for f in features if not f["properties"].get("is_building_part")]
    n_b = len(buildings)

    def count(src: str, feats: list) -> int:
        return sum(1 for f in feats if f["properties"]["height_source"] == src)

    flags: dict = {}
    for f in features:
        for flag in str(f["properties"].get("validation_flags") or "").split(","):
            if flag:
                flags[flag] = flags.get(flag, 0) + 1

    explicit = count(SOURCE_EXPLICIT, buildings)
    levels = count(SOURCE_LEVELS, buildings)
    unknown = count(SOURCE_UNKNOWN, buildings)
    pct = (lambda n: round(100.0 * n / n_b, 2) if n_b else 0.0)
    return {
        "features_total": total,
        "buildings": n_b,
        "building_parts": parts,
        "building_parts_with_height": sum(
            1
            for f in features
            if f["properties"].get("is_building_part")
            and f["properties"]["height_source"] != SOURCE_UNKNOWN
        ),
        "height_explicit": explicit,
        "height_levels_estimate": levels,
        "height_unknown": unknown,
        "pct_explicit": pct(explicit),
        "pct_levels_estimate": pct(levels),
        "pct_with_height": pct(explicit + levels),
        "pct_unknown": pct(unknown),
        "validation_flags": dict(sorted(flags.items())),
    }


def write_collection(dst: Path, feats: list, description: str | None = None) -> None:
    out: dict = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": feats,
    }
    if description:
        out["description"] = description
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out))


def enrich_geojson(src: Path, dst: Path, layer: str) -> int:
    """Roads: pass-through with ``layer`` tag (unchanged from S0)."""
    data = json.loads(src.read_text())
    feats = []
    for f in data.get("features", []):
        props = dict(f.get("properties") or {})
        props.pop("sample", None)
        props["layer"] = layer
        geom = f.get("geometry")
        if not geom:
            continue
        feats.append({"type": "Feature", "properties": props, "geometry": geom})
    out = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": feats,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out))
    return len(feats)


TIPPECANOE_VERSION = "2.79.0"
BUILDINGS_MINZOOM = 12
BUILDINGS_MAXZOOM = 16


def buildings_tippecanoe_cmd(tippe: str, geojson: Path, out_pmtiles: Path) -> list:
    """Every building kept at every baked zoom: no density dropping, no
    tiny-polygon reduction, no coalescing (ids must stay one-per-feature)."""
    return [
        tippe,
        "-o",
        str(out_pmtiles),
        "-l",
        "buildings",
        f"--minimum-zoom={BUILDINGS_MINZOOM}",
        f"--maximum-zoom={BUILDINGS_MAXZOOM}",
        "--no-feature-limit",
        "--no-tile-size-limit",
        "--no-tiny-polygon-reduction",
        "--attribution=© OpenStreetMap contributors",
        "--quiet",
        "--force",
        str(geojson),
    ]


def tippecanoe_layer(geojson: Path, out_pmtiles: Path, layer: str, maxzoom: int) -> list:
    tippe = which("tippecanoe")
    if not tippe:
        raise SystemExit("tippecanoe not found on PATH / tools/bin")
    out_pmtiles.parent.mkdir(parents=True, exist_ok=True)
    if layer == "buildings":
        cmd = buildings_tippecanoe_cmd(tippe, geojson, out_pmtiles)
    else:
        cmd = [
            tippe,
            "-o",
            str(out_pmtiles),
            "-l",
            layer,
            "-zg" if layer == "roads" else f"--maximum-zoom={maxzoom}",
            "--drop-densest-as-needed",
            "--extend-zooms-if-still-dropping",
            "--force",
            str(geojson),
        ]
    run(cmd)
    return cmd


def verify_buildings_tiles(pmtiles: Path, expected_ids: set) -> dict:
    """Decode the max zoom and confirm every feature id + normalized props survived."""
    decode = which("tippecanoe-decode")
    if not decode:
        return {"verified": False, "reason": "tippecanoe-decode missing"}
    res = subprocess.run(
        [decode, "-z", str(BUILDINGS_MAXZOOM), "-Z", str(BUILDINGS_MAXZOOM), str(pmtiles)],
        check=True,
        capture_output=True,
        text=True,
    )
    doc = json.loads(res.stdout)
    ids = set()
    with_height = set()
    missing_id = 0
    for tile in doc["features"]:
        for layer in tile["features"]:
            for f in layer["features"]:
                fid = f.get("id")
                if fid is None:
                    missing_id += 1
                    continue
                ids.add(fid)
                if "normalized_height_m" in f["properties"]:
                    with_height.add(fid)
    return {
        "verified": ids == expected_ids and missing_id == 0,
        "maxzoom": BUILDINGS_MAXZOOM,
        "distinct_ids_at_maxzoom": len(ids),
        "distinct_ids_with_height_at_maxzoom": len(with_height),
        "features_without_id": missing_id,
        "expected": len(expected_ids),
    }


def tippecanoe_version(tippe: str) -> str:
    res = subprocess.run([tippe, "--version"], capture_output=True, text=True, check=False)
    m = re.search(r"v?(\d+\.\d+\.\d+)", (res.stdout or "") + (res.stderr or ""))
    return m.group(1) if m else "unknown"


def main() -> int:
    ap = argparse.ArgumentParser(description="Bake S0 center PMTiles from western-zone PBF")
    ap.add_argument("--pbf", type=Path, default=RAW_DEFAULT)
    ap.add_argument("--skip-extract", action="store_true")
    ap.add_argument(
        "--buildings-only",
        action="store_true",
        help="re-bake buildings only; leave roads GeoJSON / PMTiles untouched",
    )
    ap.add_argument(
        "--floor-height-m",
        type=float,
        default=FLOOR_HEIGHT_M_DEFAULT,
        help="metres per storey for building:levels estimates (default 3.0)",
    )
    args = ap.parse_args()

    osmium = which("osmium")
    if not osmium:
        raise SystemExit(
            "osmium CLI not found. Install: brew install osmium-tool "
            "(or place binary in tools/bin). See docs/TOOLING.md"
        )
    if not which("tippecanoe"):
        raise SystemExit("tippecanoe not found. See docs/TOOLING.md")

    if not args.pbf.is_file():
        raise SystemExit(f"missing PBF: {args.pbf}")

    PROCESSED.mkdir(parents=True, exist_ok=True)
    PUBLIC_TILES.mkdir(parents=True, exist_ok=True)
    bbox = read_bbox()
    clipped = PROCESSED / "pune-center.osm.pbf"
    buildings_osm = PROCESSED / "buildings.osm.pbf"
    roads_osm = PROCESSED / "roads.osm.pbf"
    buildings_raw = PROCESSED / "buildings.raw.geojsonseq"
    roads_raw = PROCESSED / "roads.raw.geojson"
    buildings_gj = PROCESSED / "buildings.geojson"
    roads_gj = PROCESSED / "roads.geojson"
    buildings_tiles = PUBLIC_TILES / "buildings.pmtiles"
    roads_tiles = PUBLIC_TILES / "roads.pmtiles"

    if not args.skip_extract:
        run(
            [
                osmium,
                "extract",
                "-b",
                bbox,
                "-o",
                str(clipped),
                "--overwrite",
                str(args.pbf),
            ]
        )
        run(
            [
                osmium,
                "tags-filter",
                str(clipped),
                "w/building",
                "r/building",
                "w/building:part",
                "r/building:part",
                "-o",
                str(buildings_osm),
                "--overwrite",
            ]
        )
        run(
            [
                osmium,
                "tags-filter",
                str(clipped),
                "w/highway",
                "-o",
                str(roads_osm),
                "--overwrite",
            ]
        )
        run(
            [
                osmium,
                "export",
                str(buildings_osm),
                "-o",
                str(buildings_raw),
                "--overwrite",
                "-f",
                "geojsonseq",
                "--add-unique-id=type_id",
                "--geometry-types=polygon",
            ]
        )
        run(
            [
                osmium,
                "export",
                str(roads_osm),
                "-o",
                str(roads_raw),
                "--overwrite",
                "-f",
                "geojson",
                "--geometry-types=linestring",
            ]
        )

    source_dataset = f"osm-geofabrik-western-zone@{dataset_date(args.pbf)}"
    stats = enrich_buildings(buildings_raw, buildings_gj, source_dataset, args.floor_height_m)
    print("buildings coverage:", json.dumps(stats, indent=2))
    tippe_version = tippecanoe_version(which("tippecanoe") or "tippecanoe")
    if tippe_version != TIPPECANOE_VERSION:
        raise SystemExit(
            f"tippecanoe {tippe_version} found; bake is pinned to {TIPPECANOE_VERSION}"
        )
    buildings_cmd = tippecanoe_layer(buildings_gj, buildings_tiles, "buildings", maxzoom=16)
    baked_ids = {f["id"] for f in json.loads(buildings_gj.read_text())["features"]}
    tile_check = verify_buildings_tiles(buildings_tiles, baked_ids)
    print("buildings tile check:", json.dumps(tile_check))
    if not tile_check.get("verified"):
        raise SystemExit("buildings PMTiles lost features — see tile check above")

    n_r = None
    if not args.buildings_only:
        n_r = enrich_geojson(roads_raw, roads_gj, "roads")
        tippecanoe_layer(roads_gj, roads_tiles, "roads", maxzoom=16)

    write_buildings_fixture(buildings_gj)

    manifest_path = PROCESSED / "manifest-s0.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else {}
    manifest.update(
        {
            "stage": "S0",
            "bbox": bbox,
            "source": "geofabrik:asia/india/western-zone",
            "source_dataset": source_dataset,
            "buildings_features": stats["features_total"],
            "tiles": {
                "buildings": "/tiles/buildings.pmtiles",
                "roads": "/tiles/roads.pmtiles",
            },
            "licence": "ODbL-1.0",
            "height_policy": (
                "no invent; precedence osm_explicit > osm_levels_estimate "
                "(levels x floor_height_m) > unknown (flat, no extrusion)"
            ),
            "floor_height_m": args.floor_height_m,
            "buildings_coverage": stats,
            "buildings_tile_check": tile_check,
            "buildings_tippecanoe_cmd": " ".join(
                [Path(buildings_cmd[0]).name] + [str(c) for c in buildings_cmd[1:]]
            ).replace(str(ROOT) + "/", ""),
            "tippecanoe_version": tippe_version,
        }
    )
    if n_r is not None:
        manifest["roads_features"] = n_r
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    public_stats = {
        "description": "Building height coverage for the S0 center bake (not full PMC/PCMC).",
        "bbox": [float(v) for v in bbox.split(",")],
        "source_dataset": source_dataset,
        "floor_height_m": args.floor_height_m,
        **stats,
    }
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA / "buildings.stats.json").write_text(json.dumps(public_stats, indent=2) + "\n")
    print("OK bake complete:", json.dumps(manifest, indent=2))
    return 0


def write_buildings_fixture(buildings_gj: Path) -> None:
    """Small labelled CI fixture: real baked features, mixed height sources."""
    data = json.loads(buildings_gj.read_text())
    by_source: dict = {SOURCE_EXPLICIT: [], SOURCE_LEVELS: [], SOURCE_UNKNOWN: []}
    for f in data["features"]:
        bucket = by_source[f["properties"]["height_source"]]
        if len(bucket) < 15:
            bucket.append(f)
    feats = by_source[SOURCE_EXPLICIT] + by_source[SOURCE_LEVELS] + by_source[SOURCE_UNKNOWN]
    FIXTURES.mkdir(parents=True, exist_ok=True)
    write_collection(
        FIXTURES / "buildings.fixture.geojson",
        feats,
        description=(
            "FIXTURE — real features copied from the S0 center bake "
            "(15 per height_source); not full city"
        ),
    )


if __name__ == "__main__":
    raise SystemExit(main())
