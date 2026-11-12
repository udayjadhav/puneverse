#!/usr/bin/env python3
"""pytest: 3D scene height precedence, clamps, defaults and satellite calibration."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scene_heights import (  # noqa: E402
    CALIBRATE_MIN_AREA_M2,
    FLOOR_M,
    MAX_HEIGHT_M,
    MIN_HEIGHT_M,
    SOURCES,
    calibrated,
    default_height,
    fit_affine_cv,
    resolve_height,
)

ALL = dict(overture_height=40.0, overture_floors=5, satellite_height=20.0, area_height=15.0)


class TestPrecedence:
    def test_osm_height_wins_over_everything(self):
        assert resolve_height({"height": "33", "building:levels": "4"}, **ALL) == (33.0, "mapped")

    def test_osm_building_height_tag(self):
        assert resolve_height({"building:height": "21 m"}, satellite_height=9.0) == (21.0, "mapped")

    def test_overture_height_is_mapped(self):
        assert resolve_height({}, **ALL) == (40.0, "mapped")

    def test_osm_levels_beat_satellite(self):
        h, src = resolve_height({"building:levels": "4"}, satellite_height=30.0, area_height=10.0)
        assert (h, src) == (4 * FLOOR_M, "floors")

    def test_overture_floors(self):
        assert resolve_height(None, overture_floors=6, satellite_height=7.0) == (18.0, "floors")

    def test_satellite_beats_area(self):
        assert resolve_height({}, satellite_height=11.5, area_height=30.0) == (11.5, "satellite")

    def test_area_used_and_capped_at_60(self):
        assert resolve_height({}, area_height=12.0) == (12.0, "area")
        assert resolve_height({}, area_height=95.0) == (60.0, "area")

    def test_default_when_nothing(self):
        assert resolve_height({}, area_m2=300.0) == (9.0, "default")

    def test_sources_are_known(self):
        for kw in ({}, ALL, {"satellite_height": 5.0}, {"area_height": 5.0}):
            assert resolve_height({}, **kw)[1] in SOURCES


class TestClampsAndFallthrough:
    @pytest.mark.parametrize(
        "kw",
        [
            {"overture_height": 1.0},
            {"overture_floors": 0.5},
            {"satellite_height": 0.4},
            {"area_height": 1.2},
        ],
    )
    def test_min_height_clamp(self, kw):
        h, _ = resolve_height({}, **kw)
        assert h == MIN_HEIGHT_M

    def test_mapped_over_max_falls_to_floors(self):
        h, src = resolve_height({"height": str(MAX_HEIGHT_M + 50)}, overture_floors=10)
        assert (h, src) == (30.0, "floors")

    def test_floors_over_max_falls_to_satellite(self):
        h, src = resolve_height({"building:levels": "200"}, satellite_height=25.0)
        assert (h, src) == (25.0, "satellite")

    def test_satellite_over_max_falls_to_area(self):
        assert resolve_height({}, satellite_height=900.0, area_height=14.0) == (14.0, "area")

    def test_exactly_max_is_accepted(self):
        assert resolve_height({}, overture_height=MAX_HEIGHT_M) == (MAX_HEIGHT_M, "mapped")

    @pytest.mark.parametrize("raw", ["tall", "10-12", "12,5", "G+3"])
    def test_unparseable_osm_height_falls_through(self, raw):
        assert resolve_height({"height": raw}, overture_floors=3) == (9.0, "floors")

    def test_unparseable_levels_fall_through(self):
        assert resolve_height({"building:levels": "G+3"}, satellite_height=8.0) == (8.0, "satellite")

    @pytest.mark.parametrize("bad", [0, -5, float("nan"), "x", None])
    def test_non_positive_or_bad_numbers_ignored(self, bad):
        assert resolve_height({}, overture_height=bad, satellite_height=7.0) == (7.0, "satellite")


class TestDefaultHeight:
    @pytest.mark.parametrize(
        "area,btype,expected",
        [
            (20.0, None, 3.0),
            (300.0, "shed", 3.0),
            (1000.0, "garage", 3.0),
            (60.0, None, 6.0),
            (300.0, "house", 9.0),
            (499.9, None, 9.0),
            (500.0, None, 12.0),
            (5000.0, "apartments", 12.0),
        ],
    )
    def test_by_area_and_type(self, area, btype, expected):
        assert default_height(area, btype) == expected

    def test_resolve_default_passes_type(self):
        assert resolve_height({}, area_m2=800.0, btype="hut") == (3.0, "default")


class TestCalibration:
    def test_fit_recovers_affine_and_improves_heldout_mae(self):
        rng = np.random.default_rng(1)
        x = rng.uniform(3, 60, 400)
        y = 1.2 * x + 3 + rng.normal(0, 1.0, x.size)
        cal = fit_affine_cv(x, y)
        assert cal["n"] == 400
        assert cal["a"] == pytest.approx(1.2, abs=0.03)
        assert cal["b"] == pytest.approx(3.0, abs=0.5)
        assert cal["mae_cal_m"] < cal["mae_raw_m"]
        assert cal["mae_cal_m"] == pytest.approx(0.8, abs=0.2)  # E|N(0,1)| ≈ 0.80

    def test_fit_small_sample_returns_identity(self):
        cal = fit_affine_cv(list(range(19)), list(range(19)))
        assert cal == {"a": 1.0, "b": 0.0, "n": 19, "mae_raw_m": None, "mae_cal_m": None}

    def test_fit_is_deterministic(self):
        rng = np.random.default_rng(2)
        x = rng.uniform(3, 40, 50)
        y = x + rng.normal(0, 2, 50)
        assert fit_affine_cv(x, y) == fit_affine_cv(x, y)

    def test_calibrated_applies_affine(self):
        assert calibrated(10.0, 100.0, {"a": 1.2, "b": 3.0}) == pytest.approx(15.0)

    def test_calibrated_skips_small_footprints(self):
        assert calibrated(10.0, CALIBRATE_MIN_AREA_M2 - 0.1, {"a": 2.0, "b": 5.0}) == 10.0

    def test_calibrated_threshold_inclusive(self):
        assert calibrated(10.0, CALIBRATE_MIN_AREA_M2, {"a": 2.0, "b": 5.0}) == 25.0

    def test_calibrated_none_stays_none(self):
        assert calibrated(None, 500.0, {"a": 2.0, "b": 5.0}) is None

    def test_calibrated_without_calibration(self):
        assert calibrated(12.0, 500.0, None) == 12.0
