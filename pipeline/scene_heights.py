"""Height precedence for the 3D scene: every footprint gets a height.

Precedence (first that applies wins):
  1. ``mapped``    — explicit OSM ``height``/``building:height`` or an Overture
                     ``height`` (contributor-mapped value)
  2. ``floors``    — mapped floor count (OSM ``building:levels`` or Overture
                     ``num_floors``) × 3.0 m
  3. ``satellite`` — GlobalBuildingAtlas per-building height (ML from satellite)
  4. ``area``      — area-level satellite estimate (mean building height raster)
  5. ``default``   — labelled default from footprint size and building type

Estimates are never presented as measured: the source travels with the value.
"""

from __future__ import annotations

from typing import Any, Optional

from heights import parse_length_m, parse_levels

FLOOR_M = 3.0
MIN_HEIGHT_M = 2.8
MAX_HEIGHT_M = 250.0

SOURCES = ("mapped", "floors", "satellite", "area", "default")
SOURCE_CODE = {s: i for i, s in enumerate(SOURCES)}
SOURCE_LABEL = {
    "mapped": "Mapped height",
    "floors": "Mapped floors × 3 m",
    "satellite": "Satellite estimate (GlobalBuildingAtlas, calibrated)",
    "area": "Area estimate (GHSL 100 m)",
    "default": "Default by size and type",
}

SMALL_TYPES = {"hut", "shed", "kiosk", "garage", "garages", "roof", "carport", "toilets", "cabin"}


CALIBRATE_MIN_AREA_M2 = 40.0


def fit_affine_cv(x, y, k: int = 5, seed: int = 0) -> dict:
    """Fit ``y ≈ a·x + b`` and report k-fold held-out MAE before/after.

    ``x`` = satellite estimate, ``y`` = mapped reference height for the same
    buildings. The returned error figures are held-out, never in-sample.
    """
    import numpy as np

    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    n = len(x)
    if n < 20:
        return {"a": 1.0, "b": 0.0, "n": int(n), "mae_raw_m": None, "mae_cal_m": None}
    idx = np.random.default_rng(seed).permutation(n)
    errs = []
    for f in np.array_split(idx, k):
        tr = np.setdiff1d(idx, f)
        a, b = np.polyfit(x[tr], y[tr], 1)
        errs.append(np.abs(a * x[f] + b - y[f]))
    a, b = np.polyfit(x, y, 1)
    return {
        "a": round(float(a), 4),
        "b": round(float(b), 3),
        "n": int(n),
        "mae_raw_m": round(float(np.mean(np.abs(x - y))), 2),
        "mae_cal_m": round(float(np.mean(np.concatenate(errs))), 2),
    }


def calibrated(sat: Optional[float], area_m2: float, cal: Optional[dict]) -> Optional[float]:
    """Apply the satellite calibration; tiny footprints (sheds) keep the raw value."""
    if sat is None or cal is None or area_m2 < CALIBRATE_MIN_AREA_M2:
        return sat
    return cal["a"] * sat + cal["b"]


def default_height(area_m2: float, btype: Optional[str]) -> float:
    """Labelled default when no height signal exists. Conservative low-rise."""
    if btype in SMALL_TYPES or area_m2 < 25:
        return 3.0
    if area_m2 < 120:
        return 6.0
    if area_m2 < 500:
        return 9.0
    return 12.0


def _positive(v: Optional[float]) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or f <= 0:
        return None
    return f


def resolve_height(
    osm_tags: Optional[dict[str, Any]] = None,
    overture_height: Optional[float] = None,
    overture_floors: Optional[float] = None,
    satellite_height: Optional[float] = None,
    area_height: Optional[float] = None,
    area_m2: float = 100.0,
    btype: Optional[str] = None,
) -> tuple[float, str]:
    """Return ``(height_m, source)``; ``source`` is one of :data:`SOURCES`."""
    tags = osm_tags or {}

    explicit, _ = parse_length_m(tags.get("height") or tags.get("building:height"))
    h = _positive(explicit) or _positive(overture_height)
    if h is not None and h <= MAX_HEIGHT_M:
        return max(h, MIN_HEIGHT_M), "mapped"

    levels, _ = parse_levels(tags.get("building:levels"))
    levels = _positive(levels) or _positive(overture_floors)
    if levels is not None and levels * FLOOR_M <= MAX_HEIGHT_M:
        return max(levels * FLOOR_M, MIN_HEIGHT_M), "floors"

    sat = _positive(satellite_height)
    if sat is not None and sat <= MAX_HEIGHT_M:
        return max(sat, MIN_HEIGHT_M), "satellite"

    area = _positive(area_height)
    if area is not None:
        return max(min(area, 60.0), MIN_HEIGHT_M), "area"

    return default_height(area_m2, btype), "default"
