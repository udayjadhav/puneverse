#!/usr/bin/env python3
"""pytest: CRS WGS84 + basic geom validity for processed / fixture GeoJSON."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
FIXTURES = ROOT / "public" / "data" / "fixtures"
CENTER = ROOT / "data" / "boundaries" / "pune-center.geojson"


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


def test_center_boundary_is_wgs84_polygon():
    col = _load(CENTER)
    assert col["type"] == "FeatureCollection"
    f = col["features"][0]
    assert f["geometry"]["type"] == "Polygon"
    ring = f["geometry"]["coordinates"][0]
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    assert min(lons) > 73.8 and max(lons) < 73.9
    assert min(lats) > 18.4 and max(lats) < 18.6


@pytest.mark.parametrize(
    "path",
    [
        PROCESSED / "buildings.geojson",
        PROCESSED / "roads.geojson",
        FIXTURES / "buildings.fixture.geojson",
        FIXTURES / "roads.fixture.geojson",
    ],
)
def test_geojson_crs_and_geom(path: Path):
    if not path.is_file():
        pytest.skip(f"not baked yet: {path}")
    col = _load(path)
    assert col["type"] == "FeatureCollection"
    assert len(col["features"]) > 0
    crs = col.get("crs") or {}
    # tippecanoe input may include CRS84 name; fixtures always should
    if crs:
        name = json.dumps(crs).lower()
        assert "4326" in name or "crs84" in name or "crs:84" in name
    for f in col["features"][:200]:
        g = f.get("geometry") or {}
        assert g.get("type") in (
            "Polygon",
            "MultiPolygon",
            "LineString",
            "MultiLineString",
        )
        coords = g.get("coordinates")
        assert coords
        # walk first coordinate pair
        c = coords
        while isinstance(c, list) and c and isinstance(c[0], list):
            c = c[0]
        assert isinstance(c[0], (int, float)) and isinstance(c[1], (int, float))
        lon, lat = float(c[0]), float(c[1])
        assert -180 <= lon <= 180 and -90 <= lat <= 90


def test_buildings_height_honesty():
    path = PROCESSED / "buildings.geojson"
    if not path.is_file():
        path = FIXTURES / "buildings.fixture.geojson"
    if not path.is_file():
        pytest.skip("no buildings geojson")
    col = _load(path)
    for f in col["features"]:
        props = f.get("properties") or {}
        if "normalized_height_m" in props:
            assert props.get("height_source") in ("osm_explicit", "osm_levels_estimate")
        if props.get("height_source") == "unknown":
            assert "normalized_height_m" not in props
        assert "height_m" not in props and "height_method" not in props
        assert props.get("sample") is not True
