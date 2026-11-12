#!/usr/bin/env python3
"""pytest: the baked center GeoJSON / PMTiles carry the normalized building schema.

Skips when the local bake has not been run (artifacts are gitignored).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bake_center import (  # noqa: E402
    BUILDINGS_MAXZOOM,
    building_properties,
    buildings_tippecanoe_cmd,
    coverage_stats,
    mark_outlines_with_extruded_parts,
)

ROOT = Path(__file__).resolve().parents[1]
BUILDINGS_GJ = ROOT / "data" / "processed" / "buildings.geojson"
# Stage 2 tiles are baked from the OSM + Overture conflation when it exists.
CONFLATED_GJ = ROOT / "data" / "processed" / "buildings.conflated.geojson"
TILES_GJ = CONFLATED_GJ if CONFLATED_GJ.is_file() else BUILDINGS_GJ
BUILDINGS_PMTILES = ROOT / "public" / "tiles" / "buildings.pmtiles"
STATS_JSON = ROOT / "public" / "data" / "buildings.stats.json"
FIXTURE = ROOT / "public" / "data" / "fixtures" / "buildings.fixture.geojson"

REQUIRED = {
    "building_type",
    "height_source",
    "height_confidence",
    "validation_status",
    "source_dataset",
    "source_feature_id",
}
ALLOWED = REQUIRED | {
    "name",
    "is_building_part",
    "has_extruded_parts",
    "normalized_height_m",
    "normalized_base_height_m",
    "levels",
    "floor_height_m",
    "height_raw",
    "height_raw_key",
    "levels_raw",
    "min_height_raw",
    "min_level_raw",
    "validation_flags",
}


OVERTURE_REQUIRED = {
    "building_type",
    "height_source",
    "height_confidence",
    "source",
    "source_id",
    "footprint_dataset",
}
LINEAGE = {"source", "source_id", "footprint_dataset", "height_dataset"}


def _check_tile_props(props: dict) -> None:
    """OSM features keep the OSM schema (+ lineage); Overture-only ones their own."""
    if props.get("source") == "overture":
        assert OVERTURE_REQUIRED <= set(props), set(props)
        assert set(props) <= ALLOWED | LINEAGE, set(props) - ALLOWED - LINEAGE
    else:
        _check_feature_props({k: v for k, v in props.items() if k not in LINEAGE})


def _check_feature_props(props: dict) -> None:
    assert REQUIRED <= set(props), set(props)
    extra = set(props) - ALLOWED
    assert not extra, f"high-cardinality / unexpected keys leaked: {extra}"
    assert props["source_dataset"].startswith("osm-geofabrik-western-zone@")
    assert props["source_feature_id"][0] in "wr"
    src = props["height_source"]
    assert src in ("osm_explicit", "osm_levels_estimate", "unknown")
    if src == "unknown":
        assert "normalized_height_m" not in props
        assert props["height_confidence"] == "none"
    else:
        h = props["normalized_height_m"]
        b = props["normalized_base_height_m"]
        assert h > 0
        assert 0 <= b < h
    if src == "osm_explicit":
        assert props["height_confidence"] == "high"
        assert "height_raw" in props
    if src == "osm_levels_estimate":
        assert props["height_confidence"] == "medium"
        assert props["floor_height_m"] > 0
        assert "levels_raw" in props


def test_building_properties_allowlist_and_part_type():
    tags = {
        "building:part": "roof",
        "height": "4",
        "addr:street": "FC Road",
        "brand:wikidata": "Q1",
    }
    props = building_properties(tags, 21, "osm-geofabrik-western-zone@2026-11-09", 3.0)
    assert props["is_building_part"] is True
    assert props["building_type"] == "roof"
    assert props["source_feature_id"] == "r10"
    assert "addr:street" not in props and "brand:wikidata" not in props
    _check_feature_props(props)


def test_coverage_stats_counts_buildings_not_parts():
    feats = [
        {"properties": {"height_source": "osm_explicit"}},
        {"properties": {"height_source": "osm_levels_estimate"}},
        {"properties": {"height_source": "unknown"}},
        {"properties": {"height_source": "unknown"}},
        {"properties": {"height_source": "osm_explicit", "is_building_part": True}},
    ]
    s = coverage_stats(feats)
    assert s["buildings"] == 4
    assert s["building_parts"] == 1
    assert s["building_parts_with_height"] == 1
    assert s["pct_with_height"] == 50.0
    assert s["pct_unknown"] == 50.0


def _square(x0, y0, size):
    ring = [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]
    return {"type": "MultiPolygon", "coordinates": [[ring]]}


def test_outline_with_raised_part_is_flagged_only_when_part_inside():
    outline = {"properties": {"height_source": "osm_explicit"}, "geometry": _square(0, 0, 10)}
    other = {"properties": {"height_source": "osm_explicit"}, "geometry": _square(20, 0, 5)}
    part = {
        "properties": {"height_source": "osm_explicit", "is_building_part": True},
        "geometry": _square(2, 2, 2),
    }
    unknown_part = {
        "properties": {"height_source": "unknown", "is_building_part": True},
        "geometry": _square(21, 1, 1),
    }
    assert mark_outlines_with_extruded_parts([outline, other, part, unknown_part]) == 1
    assert outline["properties"]["has_extruded_parts"] is True
    assert "has_extruded_parts" not in other["properties"]
    assert "has_extruded_parts" not in part["properties"]


def test_tippecanoe_cmd_keeps_every_feature():
    cmd = buildings_tippecanoe_cmd("tippecanoe", Path("in.geojson"), Path("out.pmtiles"))
    joined = " ".join(cmd)
    for flag in ("--no-feature-limit", "--no-tile-size-limit", "--no-tiny-polygon-reduction"):
        assert flag in joined
    for forbidden in ("--drop-densest", "--coalesce", "-y ", "--exclude-all"):
        assert forbidden not in joined


@pytest.mark.skipif(not BUILDINGS_GJ.is_file(), reason="center bake not run")
def test_baked_geojson_schema_and_ids():
    col = json.loads(BUILDINGS_GJ.read_text())
    ids = set()
    for f in col["features"]:
        assert isinstance(f["id"], int)
        ids.add(f["id"])
        _check_feature_props(f["properties"])
    assert len(ids) == len(col["features"]), "duplicate feature ids"


@pytest.mark.skipif(
    not (BUILDINGS_PMTILES.is_file() and TILES_GJ.is_file() and shutil.which("tippecanoe-decode")),
    reason="PMTiles / tippecanoe-decode not available",
)
def test_baked_pmtiles_preserve_normalized_props():
    res = subprocess.run(
        [
            "tippecanoe-decode",
            "-z",
            str(BUILDINGS_MAXZOOM),
            "-Z",
            str(BUILDINGS_MAXZOOM),
            str(BUILDINGS_PMTILES),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    doc = json.loads(res.stdout)
    by_id: dict = {}
    layers = set()
    for tile in doc["features"]:
        for layer in tile["features"]:
            layers.add(layer["properties"]["layer"])
            for f in layer["features"]:
                by_id.setdefault(f["id"], f["properties"])
    assert layers == {"buildings"}

    col = json.loads(TILES_GJ.read_text())
    assert len(by_id) == len(col["features"]), "features dropped in tiles"
    src_counts = Counter(p["height_source"] for p in by_id.values())
    gj_counts = Counter(f["properties"]["height_source"] for f in col["features"])
    assert src_counts == gj_counts
    for f in col["features"]:
        tile_props = by_id[f["id"]]
        _check_tile_props(tile_props)
        for key in (
            "normalized_height_m",
            "normalized_base_height_m",
            "source_feature_id",
            "source_id",
            "footprint_dataset",
            "name",
        ):
            assert tile_props.get(key) == f["properties"].get(key)


@pytest.mark.skipif(not STATS_JSON.is_file(), reason="center bake not run")
def test_public_stats_match_geojson():
    stats = json.loads(STATS_JSON.read_text())
    assert stats["floor_height_m"] > 0
    assert len(stats["bbox"]) == 4
    total = (
        stats["height_explicit"]
        + stats.get("height_overture", 0)
        + stats["height_levels_estimate"]
        + stats["height_unknown"]
    )
    assert total == stats["buildings"]
    if TILES_GJ.is_file():
        col = json.loads(TILES_GJ.read_text())
        n_parts = sum(1 for f in col["features"] if f["properties"].get("is_building_part"))
        assert stats["buildings"] == len(col["features"]) - n_parts
        assert stats["building_parts"] == n_parts


@pytest.mark.skipif(not FIXTURE.is_file(), reason="no fixture")
def test_fixture_is_labelled_and_mixed():
    col = json.loads(FIXTURE.read_text())
    assert "FIXTURE" in col["description"]
    sources = {f["properties"]["height_source"] for f in col["features"]}
    assert sources == {"osm_explicit", "osm_levels_estimate", "unknown"}
    for f in col["features"]:
        _check_feature_props(f["properties"])
