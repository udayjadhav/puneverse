"""Local metric grid for the 3D scene.

All scene assets live in UTM zone 43N (EPSG:32643) shifted so the origin sits on
Shaniwar Wada. ``x`` grows east and ``y`` grows north, both in metres. The
renderer maps ``(x, y, z)`` to Three.js ``(x, z, -y)``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import Transformer

CRS = "EPSG:32643"
ORIGIN_LONLAT = (73.8553, 18.5195)
CHUNK_SIZE_M = 1000.0

_to_utm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
_to_ll = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
ORIGIN_UTM = _to_utm.transform(*ORIGIN_LONLAT)


def lonlat_to_local(lon, lat):
    """Lon/lat (scalars or numpy arrays) to local metres relative to the origin."""
    e, n = _to_utm.transform(lon, lat)
    return e - ORIGIN_UTM[0], n - ORIGIN_UTM[1]


def local_to_lonlat(x, y):
    return _to_ll.transform(x + ORIGIN_UTM[0], y + ORIGIN_UTM[1])


def utm_to_local(e, n):
    return e - ORIGIN_UTM[0], n - ORIGIN_UTM[1]


def chunk_of(x: float, y: float, size: float = CHUNK_SIZE_M) -> tuple[int, int]:
    return math.floor(x / size), math.floor(y / size)


def chunk_center(ix: int, iy: int, size: float = CHUNK_SIZE_M) -> tuple[float, float]:
    return (ix + 0.5) * size, (iy + 0.5) * size


@dataclass(frozen=True)
class Extent:
    """Axis-aligned rectangle in local metres."""

    xmin: float
    ymin: float
    xmax: float
    ymax: float

    @property
    def width(self) -> float:
        return self.xmax - self.xmin

    @property
    def height(self) -> float:
        return self.ymax - self.ymin

    def contains(self, x: float, y: float) -> bool:
        return self.xmin <= x <= self.xmax and self.ymin <= y <= self.ymax


def extent_inside_bbox(lon0: float, lat0: float, lon1: float, lat1: float, snap: float = 50.0) -> Extent:
    """Largest snapped local rectangle that stays inside a lon/lat bbox."""
    xs, ys = [], []
    for lon, lat in ((lon0, lat0), (lon1, lat0), (lon1, lat1), (lon0, lat1)):
        x, y = lonlat_to_local(lon, lat)
        xs.append(x)
        ys.append(y)
    xmin = max(xs[0], xs[3])
    xmax = min(xs[1], xs[2])
    ymin = max(ys[0], ys[1])
    ymax = min(ys[2], ys[3])
    return Extent(
        math.ceil(xmin / snap) * snap,
        math.ceil(ymin / snap) * snap,
        math.floor(xmax / snap) * snap,
        math.floor(ymax / snap) * snap,
    )
