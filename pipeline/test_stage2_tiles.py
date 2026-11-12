#!/usr/bin/env python3
"""pytest: Stage 2 baked artifacts (conflated buildings, slim roads, context layers).

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
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bake_s0_stage2 import ROAD_KEYS, classify  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
CONFLATED = PROCESSED / "buildings.conflated.geojson"
CONTEXT_PMTILES = ROOT / "public" / "tiles" / "context.pmtiles"
ROADS_PMTILES = ROOT / "public" / "tiles" / "roads.pmtiles"
BBOX = [73.8317, 18.4954, 73.8817, 18.5454]

have_bake = pytest.mark.skipif(not CONFLATED.is_file(), reason="stage 2 bake not run")
have_decode = pytest.mark.skipif(
    not (CONTEXT_PMTILES.is_file() and shutil.which("tippecanoe-decode")), reason="tiles / decoder missing"
)


def decode(path: Path, z: int) -> dict:
    res = subprocess.run(
        ["tippecanoe-decode", "-z", str(z), "-Z", str(z), str(path)], check=True, capture_output=True, text=True
    )
    return json.loads(res.stdout)


@have_bake
def test_conflated_ids_unique_geometry_valid_and_wgs84():
    feats = json.loads(CONFLATED.read_text())["features"]
    ids = [f["id"] for f in feats]
    assert len(ids) == len(set(ids))
    for f in feats:
        g = shape(f["geometry"])
        assert g.is_valid and not g.is_empty
        x0, y0, x1, y1 = g.bounds
        # osmium keeps whole ways that cross the bbox, so allow a small margin.
        assert BBOX[0] - 0.02 <= x0 and x1 <= BBOX[2] + 0.02
        assert BBOX[1] - 0.02 <= y0 and y1 <= BBOX[3] + 0.02


@have_bake
def test_lineage_and_no_invented_heights():
    feats = json.loads(CONFLATED.read_text())["features"]
    for f in feats:
        p = f["properties"]
        assert p["source"] in ("osm", "overture")
        assert p["source_id"]
        assert p["footprint_dataset"]
        if p["height_source"] == "unknown":
            assert "normalized_height_m" not in p
        else:
            assert p["normalized_height_m"] > 0
    by_fp = Counter(f["properties"]["footprint_dataset"] for f in feats if f["properties"]["source"] == "overture")
    assert "OpenStreetMap" not in by_fp


@have_decode
def test_context_tiles_have_every_layer_and_real_names():
    doc = decode(CONTEXT_PMTILES, 14)
    layers: dict = {}
    for tile in doc["features"]:
        for layer in tile["features"]:
            layers.setdefault(layer["properties"]["layer"], []).extend(layer["features"])
    assert {"water", "waterway", "green", "rail", "station", "place", "tree"} <= set(layers)
    river_names = {f["properties"].get("name") for f in layers["waterway"]}
    assert {"Mula", "Mutha"} & river_names
    assert all(f["properties"].get("name") for f in layers["place"])
    assert all(f["properties"].get("name") for f in layers["station"])
    assert {f["properties"]["kind"] for f in layers["station"]} == {"metro", "rail"}


@pytest.mark.skipif(not (ROADS_PMTILES.is_file() and shutil.which("tippecanoe-decode")), reason="no roads tiles")
def test_roads_tiles_keep_bridge_and_osm_layer_tags_at_z16():
    doc = decode(ROADS_PMTILES, 16)
    keys: Counter = Counter()
    bridges = 0
    for tile in doc["features"]:
        for layer in tile["features"]:
            for f in layer["features"]:
                keys.update(f["properties"].keys())
                bridges += f["properties"].get("bridge") in ("yes", "viaduct")
    assert set(keys) <= set(ROAD_KEYS)
    assert bridges > 0
    assert keys["layer"] > 0  # OSM vertical layer, no longer overwritten by the bake


def test_classify_examples():
    assert classify({"natural": "water", "water": "river", "name": "Mula-Mutha River"}, "MultiPolygon") == [
        ("water", {"name": "Mula-Mutha River", "kind": "river"})
    ]
    assert classify({"railway": "subway", "bridge": "yes", "layer": "1"}, "LineString") == [
        ("rail", {"kind": "subway", "bridge": "yes", "layer": "1"})
    ]
    assert classify({"natural": "tree"}, "Point") == [("tree", {"kind": "surveyed"})]
    assert classify({"place": "suburb"}, "Point") == []  # unnamed places are not labelled
    assert classify({"leisure": "park", "name": "Sambhaji Park"}, "Polygon") == [
        ("green", {"name": "Sambhaji Park", "kind": "park"})
    ]
