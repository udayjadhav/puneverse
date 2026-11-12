#!/usr/bin/env python3
"""pytest: OSM + Overture conflation (dedupe, lineage, height precedence).

Feature shapes below are FIXTURES modelled on the real Overture 2026-10-21.0
building schema (``sources`` list of {dataset, record_id, property}) and on the
normalized OSM properties written by bake_center.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from conflate import (  # noqa: E402
    CONTAINED_MATCH,
    IOU_MATCH,
    SOURCE_OVERTURE_HEIGHT,
    SOURCE_OVERTURE_LEVELS,
    conflate,
    geometry_dataset,
    height_dataset,
    overture_height_props,
)
from heights import normalize_heights, source_feature_id_from_area_id  # noqa: E402

LNG, LAT = 73.8553, 18.5195
D = 0.0001  # ~10 m


def square(x0: float, y0: float, size: float = D) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [[[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]],
    }


def osm_feature(area_id: int, geom: dict, tags: dict) -> dict:
    props = {
        "building_type": tags.get("building", "yes"),
        "source_dataset": "osm-geofabrik-western-zone@FIXTURE",
        "source_feature_id": source_feature_id_from_area_id(area_id),
        **normalize_heights(tags),
    }
    if tags.get("name"):
        props["name"] = tags["name"]
    return {"type": "Feature", "id": area_id, "properties": props, "geometry": geom}


def ov_feature(oid: str, geom: dict, dataset: str, **props) -> dict:
    srcs = [{"dataset": dataset, "record_id": f"{oid}-rec", "property": ""}]
    if props.pop("height_from", None):
        srcs.append({"dataset": props.pop("height_dataset"), "record_id": None, "property": "/properties/height"})
    return {
        "type": "Feature",
        "properties": {"id": oid, "is_underground": False, "sources": srcs, **props},
        "geometry": geom,
    }


def test_thresholds_are_documented_values():
    assert IOU_MATCH == 0.3
    assert CONTAINED_MATCH == 0.5


def test_osm_kept_overture_osm_copy_dropped_ml_added():
    osm = [osm_feature(200, square(LNG, LAT), {"building": "apartments", "height": "30"})]
    ov = [
        ov_feature("a", square(LNG, LAT), "OpenStreetMap", height=30.0),
        ov_feature("b", square(LNG + 5 * D, LAT), "Google Open Buildings"),
    ]
    merged, stats = conflate(osm, ov, 3.0, 1000)
    assert [f["properties"]["source"] for f in merged] == ["osm", "overture"]
    assert stats["overture_osm_sourced"] == 1
    assert stats["overture_added"] == 1
    added = merged[1]
    assert added["id"] == 1000
    assert added["properties"]["footprint_dataset"] == "Google Open Buildings"
    assert added["properties"]["source_id"] == "b"
    assert added["properties"]["height_source"] == "unknown"
    assert "normalized_height_m" not in added["properties"]
    # Lineage on the OSM feature, original height untouched.
    o = merged[0]["properties"]
    assert o["source_id"] == "w100" and o["footprint_dataset"] == "OpenStreetMap"
    assert o["normalized_height_m"] == 30.0 and o["height_source"] == "osm_explicit"


def test_ml_footprint_overlapping_osm_is_deduped_by_iou():
    osm = [osm_feature(2, square(LNG, LAT), {"building": "yes"})]
    shifted = square(LNG + 0.2 * D, LAT)  # IoU ~0.67
    merged, stats = conflate(osm, [ov_feature("m", shifted, "Microsoft ML Buildings")], 3.0, 10)
    assert len(merged) == 1
    assert stats["overture_dropped_iou"] == 1


def test_small_ml_footprint_inside_osm_is_deduped_by_containment():
    osm = [osm_feature(2, square(LNG, LAT, 4 * D), {"building": "yes"})]
    inner = square(LNG + D, LAT + D, D)  # IoU 1/16 but fully contained
    merged, stats = conflate(osm, [ov_feature("m", inner, "Google Open Buildings")], 3.0, 10)
    assert len(merged) == 1
    assert stats["overture_dropped_contained"] == 1


def test_touching_but_separate_footprints_are_both_kept():
    osm = [osm_feature(2, square(LNG, LAT), {"building": "yes"})]
    neighbour = square(LNG + D, LAT)  # shares an edge, zero area overlap
    merged, _ = conflate(osm, [ov_feature("n", neighbour, "Google Open Buildings")], 3.0, 10)
    assert len(merged) == 2


class TestOvertureHeightPrecedence:
    def test_non_osm_height_used(self):
        p = overture_height_props(
            {"height": 41.5, "num_floors": 3, "sources": [
                {"dataset": "Google Open Buildings", "property": ""},
                {"dataset": "Esri Community Maps", "property": "/properties/height"},
            ]},
            3.0,
        )
        assert p["height_source"] == SOURCE_OVERTURE_HEIGHT
        assert p["normalized_height_m"] == 41.5
        assert p["height_dataset"] == "Esri Community Maps"

    def test_floors_estimate_when_no_height(self):
        p = overture_height_props(
            {"num_floors": 4, "sources": [{"dataset": "Microsoft ML Buildings", "property": ""}]}, 3.2
        )
        assert p["height_source"] == SOURCE_OVERTURE_LEVELS
        assert p["normalized_height_m"] == 12.8
        assert p["floor_height_m"] == 3.2

    def test_unknown_stays_flat(self):
        p = overture_height_props({"sources": [{"dataset": "Google Open Buildings", "property": ""}]}, 3.0)
        assert p == {"height_source": "unknown", "height_confidence": "none"}

    @pytest.mark.parametrize("bad", [0, -3])
    def test_non_positive_height_ignored(self, bad):
        p = overture_height_props({"height": bad, "sources": [{"dataset": "Esri", "property": ""}]}, 3.0)
        assert p["height_source"] == "unknown"

    def test_base_clamped_when_not_below_height(self):
        p = overture_height_props(
            {"height": 10, "min_height": 12, "sources": [{"dataset": "Esri", "property": ""}]}, 3.0
        )
        assert p["normalized_base_height_m"] == 0.0

    def test_osm_explicit_beats_overture_height_for_same_building(self):
        # OSM features are never overwritten by Overture values.
        osm = [osm_feature(4, square(LNG, LAT), {"building": "yes", "height": "18"})]
        ov = [ov_feature("x", square(LNG, LAT), "OpenStreetMap", height=99.0)]
        merged, _ = conflate(osm, ov, 3.0, 10)
        assert merged[0]["properties"]["normalized_height_m"] == 18.0


def test_source_helpers():
    srcs = [
        {"dataset": "Google Open Buildings", "property": ""},
        {"dataset": "Esri Community Maps", "property": "/properties/height"},
    ]
    assert geometry_dataset(srcs) == "Google Open Buildings"
    assert height_dataset(srcs) == "Esri Community Maps"
    assert height_dataset(srcs[:1]) == "Google Open Buildings"
