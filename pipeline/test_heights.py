#!/usr/bin/env python3
"""pytest: height normalization precedence, units, invalid values, base clamp."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from heights import (  # noqa: E402
    FLOOR_HEIGHT_M_DEFAULT,
    normalize_heights,
    parse_length_m,
    parse_levels,
    source_feature_id_from_area_id,
)


class TestParseLength:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("12", 12.0),
            ("12.5", 12.5),
            ("12 m", 12.0),
            ("12m", 12.0),
            ("15 metres", 15.0),
            ("10 meters", 10.0),
            ("23 meters", 23.0),
        ],
    )
    def test_metres(self, raw, expected):
        assert parse_length_m(raw) == (expected, None)

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("40 ft", 12.192),
            ("40ft", 12.192),
            ("40 feet", 12.192),
            ("10'", 3.048),
            ("10\u2032", 3.048),
            ("10'6\"", 3.2004),
        ],
    )
    def test_feet_converted_and_flagged(self, raw, expected):
        value, flag = parse_length_m(raw)
        assert value == pytest.approx(expected)
        assert flag == "unit_ft_converted"

    @pytest.mark.parametrize("raw", ["30-40m", "tall", "12,5", "~20", "12 km"])
    def test_unparseable(self, raw):
        assert parse_length_m(raw) == (None, "unparseable")

    @pytest.mark.parametrize("raw", [None, "", "   "])
    def test_empty(self, raw):
        assert parse_length_m(raw) == (None, None)


class TestParseLevels:
    def test_plain(self):
        assert parse_levels("4") == (4.0, None)
        assert parse_levels("2.5") == (2.5, None)

    @pytest.mark.parametrize("raw", ["Ground+3", "G+3", "3;4", "four"])
    def test_rejected(self, raw):
        assert parse_levels(raw) == (None, "levels_unparseable")


class TestPrecedence:
    def test_explicit_wins_over_levels(self):
        p = normalize_heights({"height": "20", "building:levels": "4"})
        assert p["height_source"] == "osm_explicit"
        assert p["height_confidence"] == "high"
        assert p["normalized_height_m"] == 20.0
        assert p["levels"] == 4.0
        assert p["height_raw"] == "20"
        assert p["levels_raw"] == "4"
        assert p["validation_status"] == "ok"
        assert "floor_height_m" not in p

    def test_building_height_alias(self):
        p = normalize_heights({"building:height": "9"})
        assert p["normalized_height_m"] == 9.0
        assert p["height_raw_key"] == "building:height"

    def test_levels_estimate_uses_default_floor_height(self):
        p = normalize_heights({"building:levels": "3"})
        assert p["height_source"] == "osm_levels_estimate"
        assert p["height_confidence"] == "medium"
        assert p["normalized_height_m"] == 3 * FLOOR_HEIGHT_M_DEFAULT
        assert p["floor_height_m"] == FLOOR_HEIGHT_M_DEFAULT

    def test_levels_estimate_configurable_floor_height(self):
        p = normalize_heights({"building:levels": "3"}, floor_height_m=3.5)
        assert p["normalized_height_m"] == 10.5
        assert p["floor_height_m"] == 3.5

    def test_unknown_has_no_height(self):
        p = normalize_heights({"building": "yes"})
        assert p["height_source"] == "unknown"
        assert p["height_confidence"] == "none"
        assert "normalized_height_m" not in p
        assert "normalized_base_height_m" not in p
        assert p["validation_status"] == "ok"

    def test_unparseable_height_falls_back_to_levels_and_flags(self):
        p = normalize_heights({"height": "30-40m", "building:levels": "15"})
        assert p["height_source"] == "osm_levels_estimate"
        assert p["normalized_height_m"] == 45.0
        assert p["height_raw"] == "30-40m"
        assert p["validation_status"] == "warning"
        assert "height_unparseable" in p["validation_flags"]

    def test_zero_height_rejected(self):
        p = normalize_heights({"height": "0", "building:levels": "6"})
        assert p["height_source"] == "osm_levels_estimate"
        assert "height_non_positive" in p["validation_flags"]

    def test_zero_levels_is_unknown(self):
        p = normalize_heights({"building:levels": "0"})
        assert p["height_source"] == "unknown"
        assert "normalized_height_m" not in p
        assert "levels_non_positive" in p["validation_flags"]

    def test_unparseable_levels_is_unknown(self):
        p = normalize_heights({"building:levels": "Ground+3"})
        assert p["height_source"] == "unknown"
        assert p["levels_raw"] == "Ground+3"
        assert "levels" not in p

    def test_feet_height_converted(self):
        p = normalize_heights({"height": "100 ft"})
        assert p["normalized_height_m"] == 30.48
        assert "unit_ft_converted" in p["validation_flags"]

    def test_suspicious_height_kept_and_flagged(self):
        p = normalize_heights({"height": "450"})
        assert p["normalized_height_m"] == 450.0
        assert p["height_raw"] == "450"
        assert "height_suspicious_gt_300m" in p["validation_flags"]

    def test_suspicious_levels_estimate_flagged(self):
        p = normalize_heights({"building:levels": "200"})
        assert p["normalized_height_m"] == 600.0
        assert "height_suspicious_gt_300m" in p["validation_flags"]

    def test_whitespace_height_falls_back_to_building_height(self):
        p = normalize_heights({"height": "  ", "building:height": "9"})
        assert p["normalized_height_m"] == 9.0
        assert p["height_raw_key"] == "building:height"

    def test_floor_height_must_be_positive(self):
        with pytest.raises(ValueError):
            normalize_heights({"building:levels": "2"}, floor_height_m=0)


class TestBase:
    def test_min_height(self):
        p = normalize_heights({"height": "18", "min_height": "15"})
        assert p["normalized_base_height_m"] == 15.0
        assert p["validation_status"] == "ok"

    def test_min_level_times_floor_height(self):
        p = normalize_heights({"building:levels": "6", "building:min_level": "2"})
        assert p["normalized_base_height_m"] == 6.0

    def test_min_height_wins_over_min_level(self):
        p = normalize_heights(
            {"height": "18", "min_height": "15", "building:min_level": "4"}
        )
        assert p["normalized_base_height_m"] == 15.0

    def test_base_above_height_clamped_and_flagged(self):
        p = normalize_heights({"height": "0.2", "min_height": "0.5"})
        assert p["normalized_height_m"] == 0.2
        assert p["normalized_base_height_m"] == 0.0
        assert "base_clamped" in p["validation_flags"]
        assert p["min_height_raw"] == "0.5"

    def test_no_base_without_height(self):
        p = normalize_heights({"min_height": "5"})
        assert "normalized_base_height_m" not in p
        assert p["min_height_raw"] == "5"


def test_area_id_decoding():
    assert source_feature_id_from_area_id(105510726) == "w52755363"
    assert source_feature_id_from_area_id(21) == "r10"
    with pytest.raises(ValueError):
        source_feature_id_from_area_id(-1)
