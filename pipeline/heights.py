"""Height normalization for OSM buildings (Q6: never invent heights).

Precedence per building:
  1. explicit OSM height (``height``, then ``building:height``) — metres or feet
  2. ``building:levels`` × floor_height_m — an estimate, labelled as such
  3. unknown — no ``normalized_height_m`` (rendered as a flat footprint)

Base height: ``min_height`` (explicit) else ``building:min_level`` × floor_height_m.
A base that is not strictly below the height is reset to 0 and flagged.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

FLOOR_HEIGHT_M_DEFAULT = 3.0
SUSPICIOUS_HEIGHT_M = 300.0
FEET_TO_M = 0.3048

SOURCE_EXPLICIT = "osm_explicit"
SOURCE_LEVELS = "osm_levels_estimate"
SOURCE_UNKNOWN = "unknown"

CONFIDENCE = {
    SOURCE_EXPLICIT: "high",
    SOURCE_LEVELS: "medium",
    SOURCE_UNKNOWN: "none",
}

_NUM = r"([0-9]+(?:\.[0-9]+)?)"
_METRES_RE = re.compile(rf"^{_NUM}\s*(?:m|meter|meters|metre|metres)?$", re.IGNORECASE)
_FEET_RE = re.compile(rf"^{_NUM}\s*(?:ft|feet|foot|'|\u2032)$", re.IGNORECASE)
_FEET_INCHES_RE = re.compile(
    r"^([0-9]+)\s*(?:'|\u2032)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\"|\u2033)$"
)
_LEVELS_RE = re.compile(rf"^{_NUM}$")


def parse_length_m(raw: Any) -> Tuple[Optional[float], Optional[str]]:
    """Parse an OSM length tag into metres.

    Returns ``(metres, flag)``. ``flag`` is ``"unit_ft_converted"`` for feet input,
    ``"unparseable"`` for anything else that is not a plain length (ranges, words,
    comma decimals), or ``None`` for clean metre input.
    """
    if raw is None:
        return None, None
    s = str(raw).strip()
    if not s:
        return None, None
    m = _METRES_RE.fullmatch(s)
    if m:
        return float(m.group(1)), None
    m = _FEET_RE.fullmatch(s)
    if m:
        return float(m.group(1)) * FEET_TO_M, "unit_ft_converted"
    m = _FEET_INCHES_RE.fullmatch(s)
    if m:
        feet = float(m.group(1)) + float(m.group(2)) / 12.0
        return feet * FEET_TO_M, "unit_ft_converted"
    return None, "unparseable"


def parse_levels(raw: Any) -> Tuple[Optional[float], Optional[str]]:
    """Parse ``building:levels``. Plain non-negative numbers only (``G+3`` etc. rejected)."""
    if raw is None:
        return None, None
    s = str(raw).strip()
    if not s:
        return None, None
    m = _LEVELS_RE.fullmatch(s)
    if not m:
        return None, "levels_unparseable"
    return float(m.group(1)), None


def _round(v: float) -> float:
    return round(v, 2)


def normalize_heights(
    tags: Dict[str, Any], floor_height_m: float = FLOOR_HEIGHT_M_DEFAULT
) -> Dict[str, Any]:
    """Return normalized height properties for one building's OSM tags.

    Raw source values are preserved under ``*_raw`` keys. ``validation_flags`` lists
    every problem seen; ``validation_status`` is ``ok`` or ``warning``.
    """
    if floor_height_m <= 0:
        raise ValueError("floor_height_m must be > 0")

    flags: List[str] = []
    out: Dict[str, Any] = {}

    def tag(key: str) -> Optional[str]:
        v = tags.get(key)
        return str(v) if v is not None and str(v).strip() else None

    height_raw = tag("height")
    height_key = "height"
    if height_raw is None and tag("building:height") is not None:
        height_raw = tag("building:height")
        height_key = "building:height"
    levels_raw = tag("building:levels")
    min_height_raw = tag("min_height")
    min_level_raw = tag("building:min_level")

    if height_raw is not None:
        out["height_raw"] = height_raw
        if height_key != "height":
            out["height_raw_key"] = height_key
    if levels_raw is not None:
        out["levels_raw"] = levels_raw
    if min_height_raw is not None:
        out["min_height_raw"] = min_height_raw
    if min_level_raw is not None:
        out["min_level_raw"] = min_level_raw

    levels, lv_flag = parse_levels(levels_raw)
    if lv_flag:
        flags.append(lv_flag)
    if levels is not None:
        out["levels"] = levels

    height: Optional[float] = None
    source = SOURCE_UNKNOWN

    explicit, h_flag = parse_length_m(height_raw)
    if h_flag == "unit_ft_converted":
        flags.append(h_flag)
    elif h_flag == "unparseable":
        flags.append("height_unparseable")
    if explicit is not None:
        if explicit <= 0:
            flags.append("height_non_positive")
        else:
            height = explicit
            source = SOURCE_EXPLICIT
            if explicit > SUSPICIOUS_HEIGHT_M:
                flags.append("height_suspicious_gt_300m")

    if height is None and levels is not None:
        if levels <= 0:
            flags.append("levels_non_positive")
        else:
            height = levels * floor_height_m
            source = SOURCE_LEVELS
            out["floor_height_m"] = floor_height_m
            if height > SUSPICIOUS_HEIGHT_M:
                flags.append("height_suspicious_gt_300m")

    out["height_source"] = source
    out["height_confidence"] = CONFIDENCE[source]

    if height is not None:
        base = 0.0
        min_h, mh_flag = parse_length_m(min_height_raw)
        if mh_flag == "unit_ft_converted":
            flags.append("min_height_ft_converted")
        elif mh_flag == "unparseable":
            flags.append("min_height_unparseable")
        if min_h is not None:
            base = min_h
        else:
            min_lv, ml_flag = parse_levels(min_level_raw)
            if ml_flag:
                flags.append("min_level_unparseable")
            if min_lv is not None:
                base = min_lv * floor_height_m
        if base >= height:
            flags.append("base_clamped")
            base = 0.0
        out["normalized_height_m"] = _round(height)
        out["normalized_base_height_m"] = _round(base)

    out["validation_status"] = "warning" if flags else "ok"
    if flags:
        out["validation_flags"] = ",".join(flags)
    return out


def source_feature_id_from_area_id(area_id: int) -> str:
    """Map an osmium area id back to the OSM object id (``w123`` / ``r456``).

    osmium encodes areas from ways as ``2*id`` and from relations as ``2*id + 1``.
    """
    if area_id < 0:
        raise ValueError("negative area id")
    if area_id % 2 == 0:
        return f"w{area_id // 2}"
    return f"r{(area_id - 1) // 2}"
