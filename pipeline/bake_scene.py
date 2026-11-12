#!/usr/bin/env python3
"""Bake the S0 3D city scene into compact local assets under public/scene/s0/.

Inputs (all local, all open data, see docs/DATA_SOURCES.md):
  data/processed/overture-scene/building.geojson   Overture buildings 2026-10-21.0
  data/processed/scene/osm/*.geojsonseq             OSM clip (osmium export)
  data/processed/scene/gba.parquet                  GlobalBuildingAtlas LoD1 clip
  data/raw/ghsl/*R7_C26.tif                         GHS-BUILT-H 100 m (area fallback)
  data/raw/dem/cop30_N18_E073.tif                   Copernicus DEM GLO-30
  data/raw/s2/s2_*.tif                              Sentinel-2 L2A TCI crops
  data/raw/worldcover/worldcover.tif                ESA WorldCover 2021

Run: .venv/bin/python3.14 pipeline/bake_scene.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import duckdb
import numpy as np
import rasterio
import shapely
import shapely.prepared
from PIL import Image, ImageEnhance, ImageFilter
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import reproject
from scipy import ndimage
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))

import scene_format  # noqa: E402
from scene_grid import (  # noqa: E402
    CHUNK_SIZE_M,
    CRS,
    ORIGIN_LONLAT,
    ORIGIN_UTM,
    Extent,
    chunk_center,
    chunk_of,
    extent_inside_bbox,
    local_to_lonlat,
    lonlat_to_local,
)
from scene_heights import SOURCE_CODE, SOURCE_LABEL, SOURCES, calibrated, fit_affine_cv, resolve_height  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
OSM = PROC / "scene" / "osm"
OUT = ROOT / "public" / "scene" / "s0"

# Expanded to include Sinhgad Fort (SW) and Wagholi / Wadgaon Sheri (NE).
SCENE_BBOX = (73.74, 18.35, 74.00, 18.60)
TERRAIN_STEP = 15.0
GROUND_UPSCALE = 4
MASK_RES = 1.0

KIND_CODES = {
    "residential": 0,
    "apartments": 1,
    "commercial": 2,
    "industrial": 3,
    "religious": 4,
    "civic": 5,
    "small": 6,
    "historic": 7,
}

ROAD_CLASSES = {
    "motorway": (0, 16.0),
    "trunk": (0, 14.0),
    "primary": (1, 12.0),
    "secondary": (2, 10.0),
    "tertiary": (3, 8.0),
    "motorway_link": (1, 7.0),
    "trunk_link": (1, 7.0),
    "primary_link": (1, 7.0),
    "secondary_link": (2, 6.5),
    "tertiary_link": (3, 6.0),
    "unclassified": (4, 6.0),
    "residential": (4, 6.0),
    "living_street": (5, 5.0),
    "busway": (2, 7.0),
    "pedestrian": (6, 5.0),
    "service": (5, 4.0),
}

# Real Pune street variety: plaster, brick, grey RCC, cream, dusty pink, pale
# blue, yellow, terracotta — distinct enough to read from altitude.
WALL_PALETTE = np.array(
    [
        (196, 178, 152), (186, 168, 142), (204, 186, 160), (178, 162, 140),
        (172, 164, 152), (190, 172, 146), (210, 192, 168), (168, 152, 128),
        (160, 152, 140), (198, 180, 154), (182, 166, 132), (170, 176, 166),
        (188, 168, 148), (158, 160, 162), (200, 178, 148), (148, 136, 118),
        (186, 166, 160), (170, 176, 186), (176, 156, 128), (164, 146, 120),
        (210, 170, 150), (180, 140, 120), (150, 155, 160), (130, 140, 150),
        (200, 190, 160), (170, 185, 175), (190, 160, 145), (155, 145, 135),
        (220, 200, 175), (165, 155, 145), (175, 165, 155), (145, 150, 165),
        (195, 175, 165), (160, 150, 140), (185, 175, 145), (140, 155, 170),
        # Stronger chroma — societies / chawls / offices that punch through haze
        (230, 210, 175), (215, 185, 145), (200, 155, 130), (175, 125, 105),
        (145, 165, 185), (120, 145, 170), (165, 175, 190), (190, 195, 200),
        (210, 195, 170), (185, 155, 135), (155, 140, 125), (135, 145, 140),
        (225, 215, 195), (160, 130, 110), (140, 120, 100), (175, 180, 165),
        (200, 170, 155), (155, 160, 175), (180, 145, 125), (125, 135, 145),
    ],
    dtype=np.uint8,
)

# Flat / grey roofs get a seeded palette so whole neighbourhoods are not identical.
ROOF_FALLBACK = np.array(
    [
        (95, 100, 105), (120, 115, 105), (140, 130, 115), (85, 95, 110),
        (110, 90, 75), (70, 110, 150), (55, 100, 145), (150, 110, 85),
        (130, 130, 125), (100, 115, 95), (160, 140, 100), (90, 90, 95),
        (125, 105, 95), (105, 120, 130), (145, 125, 110), (80, 85, 90),
    ],
    dtype=np.uint8,
)

_utm_from_ll = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


def seed_of(s: str) -> int:
    return int.from_bytes(hashlib.blake2b(s.encode(), digest_size=4).digest(), "little")


def to_local_geom(g):
    return shapely.transform(g, lambda c: np.column_stack(lonlat_to_local(c[:, 0], c[:, 1])))


def read_seq(path: Path):
    with path.open() as fh:
        for line in fh:
            line = line.strip().lstrip("\x1e")
            if line:
                yield json.loads(line)


# --------------------------------------------------------------------------- terrain


class Terrain:
    """Regular height grid in local metres; row 0 is the southern edge."""

    def __init__(self, heights: np.ndarray, x0: float, y0: float, step: float):
        self.h = heights.astype(np.float32)
        self.x0, self.y0, self.step = x0, y0, step
        self.ny, self.nx = self.h.shape

    def sample(self, x, y):
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        fx = np.clip((x - self.x0) / self.step, 0, self.nx - 1.0001)
        fy = np.clip((y - self.y0) / self.step, 0, self.ny - 1.0001)
        i = np.floor(fx).astype(int)
        j = np.floor(fy).astype(int)
        tx, ty = fx - i, fy - j
        h = self.h
        return (
            h[j, i] * (1 - tx) * (1 - ty)
            + h[j, i + 1] * tx * (1 - ty)
            + h[j + 1, i] * (1 - tx) * ty
            + h[j + 1, i + 1] * tx * ty
        )


def build_terrain(ext: Extent) -> Terrain:
    """Mosaic available Copernicus GLO-30 tiles covering SCENE_BBOX."""
    from rasterio.merge import merge as rio_merge

    log("terrain: reproject Copernicus GLO-30 (mosaic)")
    nx = int(round(ext.width / TERRAIN_STEP)) + 1
    ny = int(round(ext.height / TERRAIN_STEP)) + 1
    e0 = ext.xmin + ORIGIN_UTM[0]
    n1 = ext.ymax + ORIGIN_UTM[1]
    dst_tf = from_origin(e0 - TERRAIN_STEP / 2, n1 + TERRAIN_STEP / 2, TERRAIN_STEP, TERRAIN_STEP)
    dem_files = sorted((RAW / "dem").glob("cop30_*.tif"))
    if not dem_files:
        raise SystemExit("no DEM tiles in data/raw/dem/")
    srcs = [rasterio.open(p) for p in dem_files]
    try:
        mosaic, mosaic_tf = rio_merge(srcs, nodata=-32767.0)
        dem = mosaic[0].astype(np.float32)
        dem[dem <= -1000] = np.nan
        # Fill small holes then smooth; keep hills.
        if np.isnan(dem).any():
            mask = np.isnan(dem)
            dem = dem.copy()
            dem[mask] = np.nanmedian(dem)
        dem = ndimage.grey_opening(np.nan_to_num(dem, nan=0.0), size=(3, 3))
        dem = ndimage.gaussian_filter(dem, 0.8)
        dst = np.zeros((ny, nx), dtype=np.float32)
        reproject(
            dem,
            dst,
            src_transform=mosaic_tf,
            src_crs=srcs[0].crs,
            dst_transform=dst_tf,
            dst_crs=CRS,
            resampling=Resampling.cubic,
        )
        log("terrain: mosaicked", len(dem_files), "tiles", "min/max", float(dst.min()), float(dst.max()))
    finally:
        for s in srcs:
            s.close()
    if float(dst.max()) < 50:
        raise SystemExit("terrain bake produced near-zero heights — DEM mosaic failed")
    return Terrain(np.flipud(dst), ext.xmin, ext.ymin, TERRAIN_STEP)


# --------------------------------------------------------------------------- water


def _riverside_building_pads(ext: Extent, water):
    """Building pads that touch the river — Overture first, OSM as backup.

    Earlier bake took the first 120k OSM footprints citywide, which often missed
    Mundhwa / Keshav Nagar banks, so water still rendered under apartments.
    """
    if water is None or getattr(water, "is_empty", True):
        return []
    corridor = water.buffer(55)
    prep = shapely.prepared.prep(corridor)
    box = shapely.box(ext.xmin - 40, ext.ymin - 40, ext.xmax + 40, ext.ymax + 40)
    pads = []

    ov_path = PROC / "overture-scene" / "building.geojson"
    if ov_path.exists():
        for f in json.load(open(ov_path))["features"]:
            if f["properties"].get("is_underground"):
                continue
            g = to_local_geom(shape(f["geometry"]))
            if g.is_empty or g.area < 20:
                continue
            rp = g.representative_point()
            if not box.contains(rp):
                continue
            if prep.intersects(g):
                pads.append(g.buffer(0))

    if len(pads) < 200:
        for f in read_seq(OSM / "bld.geojsonseq"):
            g = to_local_geom(shape(f["geometry"]))
            if g.is_empty or g.area < 20 or not prep.intersects(g):
                continue
            pads.append(g.buffer(0))

    log("water: riverside building pads", len(pads))
    return pads


def _road_bank_pads(ext: Extent):
    """Wide road corridors so water never covers decks or bridge approaches."""
    pads = []
    box = shapely.box(ext.xmin - 40, ext.ymin - 40, ext.xmax + 40, ext.ymax + 40)
    for f in read_seq(OSM / "roads.geojsonseq"):
        p = f["properties"]
        hw = p.get("highway")
        if hw not in ROAD_CLASSES:
            continue
        g = to_local_geom(shape(f["geometry"]))
        if g.is_empty or not g.intersects(box):
            continue
        nm = (p.get("name:en") or p.get("name") or "").lower()
        bridge = p.get("bridge") not in (None, "no") or "bridge" in nm
        # Bridges and their approaches need a fat dry strip.
        w = ROAD_CLASSES[hw][1] * (0.85 if bridge else 0.55) + (10.0 if bridge else 3.5)
        pads.append(g.buffer(w, cap_style="flat"))
    return pads


def load_water(ext: Extent):
    """Build river / lake polygons that stay clear of buildings and road decks."""
    polys, rivers = [], []
    for f in read_seq(OSM / "land.geojsonseq"):
        p = f["properties"]
        gt = f["geometry"]["type"]
        is_water = p.get("natural") == "water" or p.get("waterway") == "riverbank" or p.get("landuse") == "reservoir"
        if is_water and gt in ("Polygon", "MultiPolygon"):
            polys.append(to_local_geom(shape(f["geometry"])))
        elif p.get("waterway") in ("river", "canal") and gt == "LineString":
            # Narrow centre-line fill — wide buffers flooded Mutha banks.
            w = 14.0 if p.get("waterway") == "river" else 5.0
            try:
                w = min(float(p.get("width", w)), 28.0)
            except ValueError:
                pass
            rivers.append(to_local_geom(shape(f["geometry"])).buffer(w / 2, cap_style="flat"))
    box = shapely.box(ext.xmin, ext.ymin, ext.xmax, ext.ymax)
    water = shapely.union_all([g.buffer(0) for g in polys]) if polys else Polygon()
    if rivers:
        gap_fills = []
        poly_pad = water.buffer(30) if not water.is_empty else Polygon()
        for r in rivers:
            if water.is_empty or not r.intersects(poly_pad):
                gap_fills.append(r)
            else:
                gap_fills.append(r.intersection(poly_pad.buffer(12)))
        if gap_fills:
            water = shapely.union_all([water] + [g for g in gap_fills if not g.is_empty])
    water = water.intersection(box).buffer(0)
    # Pull shoreline hard inward so banks / societies sit on dry land.
    if not water.is_empty:
        eroded = water.buffer(-22)
        water = eroded if not eroded.is_empty else water.buffer(-10)
        water = water.buffer(0)
    # Cut water out under riverside buildings (Overture pads) and road decks.
    pads = _riverside_building_pads(ext, water)
    if pads and not water.is_empty:
        ban = shapely.union_all(pads).buffer(16)
        water = water.difference(ban).buffer(0)
    # Cut water only at shoreline road approaches (not midspan) so banks stay dry
    # while the river still runs under Mundhwa / Bund Garden decks.
    road_pads = _road_bank_pads(ext)
    if road_pads and not water.is_empty:
        shore = water.boundary.buffer(28)
        approaches = [g for g in road_pads if shore.intersects(g)]
        if approaches:
            water = water.difference(shapely.union_all(approaches)).buffer(0)
    log("water: polygons", len(polys), "river lines", len(rivers), "area m2", int(getattr(water, "area", 0) or 0))
    return water if not water.is_empty else Polygon()


def carve_water(terrain: Terrain, water, road_mask: np.ndarray | None = None) -> np.ndarray:
    """Lower channel under water, raise clear banks; never carve under roads."""
    t = terrain
    tr = from_origin(t.x0 - t.step / 2, t.y0 + (t.ny - 0.5) * t.step, t.step, t.step)
    geoms = [g for g in getattr(water, "geoms", [water]) if not g.is_empty]
    if not geoms:
        return np.full((t.ny, t.nx), np.nanmean(t.h), dtype=np.float32)
    mask = rasterize(geoms, out_shape=(t.ny, t.nx), transform=tr, all_touched=True).astype(bool)
    mask = np.flipud(mask)
    if road_mask is not None:
        # Roads/bridges keep their bank height — stops decks “ending in water”.
        mask = mask & ~road_mask
    big = np.where(mask, t.h, np.inf)
    lvl = ndimage.minimum_filter(big, size=9)
    lvl = np.where(np.isfinite(lvl), lvl, np.nan)
    w = np.where(mask & np.isfinite(lvl), 1.0, 0.0)
    v = np.where(w > 0, lvl, 0.0)
    num = ndimage.gaussian_filter(v, 4)
    den = ndimage.gaussian_filter(w, 4)
    level = np.where(den > 1e-6, num / np.maximum(den, 1e-6), np.nan)
    idx = ndimage.distance_transform_edt(np.isnan(level), return_distances=False, return_indices=True)
    level = level[tuple(idx)]
    # Deepen channel so water sits clearly below apartment plinths / bridge decks.
    t.h = np.where(mask, np.minimum(t.h, level - 5.0), t.h).astype(np.float32)
    # Raised berm: wider ring so riverside societies read as dry bank, not floodplain.
    ring = ndimage.binary_dilation(mask, iterations=3) & ~mask
    if road_mask is not None:
        ring = ring & ~road_mask
    t.h = np.where(ring, np.maximum(t.h, level + 3.6), t.h).astype(np.float32)
    return level.astype(np.float32)


def triangulate(poly) -> np.ndarray:
    """Constrained triangulation of a polygon; returns (n,3,2) triangles."""
    tris = shapely.constrained_delaunay_triangles(poly)
    out = []
    for tri in getattr(tris, "geoms", []):
        c = np.asarray(tri.exterior.coords)[:3]
        out.append(c)
    return np.asarray(out, dtype=np.float64).reshape(-1, 3, 2)


def bake_water(water, level_grid: np.ndarray, terrain: Terrain) -> dict:
    lv = Terrain(level_grid, terrain.x0, terrain.y0, terrain.step)
    pos = []
    for g in getattr(water, "geoms", [water]):
        if g.is_empty or g.area < 50:
            continue
        g = shapely.segmentize(g.simplify(1.0), 25.0)
        tris = triangulate(g)
        if not len(tris):
            continue
        xy = tris.reshape(-1, 2)
        # Sit water below carved banks (berm is ~level+3.6) so shoreline reads cleanly.
        z = lv.sample(xy[:, 0], xy[:, 1]) - 2.0
        pos.append(np.column_stack([xy, z]))
    pos = np.concatenate(pos).astype(np.float32) if pos else np.zeros((0, 3), np.float32)
    log("water: triangles", len(pos) // 3)
    scene_format.write(OUT / "water.bin", {"kind": "water"}, {"position": (pos.ravel(), 3)})
    return {"triangles": len(pos) // 3}


def road_protect_mask(ext: Extent, terrain: Terrain) -> np.ndarray:
    """Raster of road corridors that must not be carved into the river channel."""
    lines = []
    for f in read_seq(OSM / "roads.geojsonseq"):
        p = f["properties"]
        hw = p.get("highway")
        if hw not in ROAD_CLASSES:
            continue
        g = to_local_geom(shape(f["geometry"]))
        if g.is_empty:
            continue
        nm = (p.get("name:en") or p.get("name") or "").lower()
        bridge = p.get("bridge") not in (None, "no") or "bridge" in nm
        # Fat protect under bridges / trunks so approaches keep bank height.
        w = ROAD_CLASSES[hw][1] * (0.9 if bridge else 0.6) + (12.0 if bridge else 4.0)
        lines.append(g.buffer(w))
    t = terrain
    tr = from_origin(t.x0 - t.step / 2, t.y0 + (t.ny - 0.5) * t.step, t.step, t.step)
    if not lines:
        return np.zeros((t.ny, t.nx), dtype=bool)
    mask = rasterize(lines, out_shape=(t.ny, t.nx), transform=tr, all_touched=True).astype(bool)
    return np.flipud(mask)


# --------------------------------------------------------------------------- stadiums (procedural bowls on real OSM footprints)


def load_stadium_footprints(ext: Extent):
    """OSM leisure=stadium polygons (MultiPolygon preferred over LineString shells)."""
    found = {}
    for f in read_seq(OSM / "land.geojsonseq"):
        p = f["properties"]
        if p.get("leisure") != "stadium":
            continue
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
            continue
        nm = p.get("name:en") or p.get("name") or "Stadium"
        g = to_local_geom(shape(f["geometry"])).buffer(0)
        if g.is_empty or g.area < 2500:
            continue
        if g.geom_type == "MultiPolygon":
            g = max(g.geoms, key=lambda q: q.area)
        if not ext.contains(g.representative_point().x, g.representative_point().y):
            continue
        prev = found.get(nm)
        if prev is None or g.area > prev.area:
            found[nm] = g
    return [(nm, g) for nm, g in found.items()]


def _extrude_ring(outer, inner, z0: float, z1: float, rgb) -> tuple[np.ndarray, np.ndarray]:
    """Wall + top deck between two rings. Returns (N,3) positions and (M,) uint32 indices."""
    from shapely.geometry import Polygon as SPoly

    ring = SPoly(outer.exterior.coords, [inner.exterior.coords])
    ring = ring.buffer(0)
    if ring.is_empty:
        return np.zeros((0, 3), np.float32), np.zeros(0, np.uint32)
    # Top deck
    top_tris = triangulate(ring)
    pos = []
    idx = []
    base = 0
    if len(top_tris):
        xy = top_tris.reshape(-1, 2)
        for p in xy:
            pos.append([p[0], p[1], z1])
        for i in range(0, len(xy), 3):
            idx.extend([base + i, base + i + 1, base + i + 2])
        base = len(pos)
    # Outer wall
    oc = np.asarray(outer.exterior.coords)[:-1]
    for a, b in zip(oc, np.roll(oc, -1, axis=0)):
        i0 = len(pos)
        pos += [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]
        idx += [i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3]
    # Inner wall (facing field)
    ic = np.asarray(inner.exterior.coords)[:-1]
    for a, b in zip(ic, np.roll(ic, -1, axis=0)):
        i0 = len(pos)
        pos += [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]
        idx += [i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2]
    p = np.asarray(pos, np.float32)
    # colours packed later
    return p, np.asarray(idx, np.uint32)


def bake_stadiums(ext: Extent, terrain: Terrain):
    """Replace boxy stand footprints with bowl meshes from real stadium polygons."""
    stadia = load_stadium_footprints(ext)
    all_pos, all_col, all_idx = [], [], []
    labels = []
    index_base = 0
    for nm, outer in stadia:
        # Field = eroded interior; stands = ring.
        inset = min(28.0, max(12.0, math.sqrt(outer.area) * 0.12))
        field = outer.buffer(-inset)
        if field.is_empty or field.area < 800:
            import shapely.affinity as _aff

            field = _aff.scale(outer, 0.52, 0.52, origin="centroid")
        if field.geom_type == "MultiPolygon":
            field = max(field.geoms, key=lambda q: q.area)
        rp = outer.representative_point()
        z0 = float(terrain.sample(np.array([rp.x]), np.array([rp.y]))[0])
        # Pitch
        for g in (field,):
            tris = triangulate(shapely.segmentize(g.simplify(1.5), 12.0))
            if not len(tris):
                continue
            xy = tris.reshape(-1, 2)
            for p in xy:
                all_pos.append([p[0], p[1], z0 + 0.35])
                all_col.append([55, 130, 70])
            for i in range(0, len(xy), 3):
                all_idx.extend([index_base + i, index_base + i + 1, index_base + i + 2])
            index_base = len(all_pos)
        # Tiered stands (3 rings) — grey concrete bowls, not apartment boxes.
        tiers = [
            (0.0, inset * 0.38, 6.5, (150, 152, 155)),
            (inset * 0.32, inset * 0.70, 11.0, (135, 138, 145)),
            (inset * 0.62, inset * 1.02, 16.5, (120, 124, 132)),
        ]
        for a0, a1, h, rgb in tiers:
            ring_out = outer.buffer(-(a0)) if a0 > 0.5 else outer
            ring_in = outer.buffer(-(a1))
            if ring_out.is_empty or ring_in.is_empty:
                continue
            if ring_out.geom_type == "MultiPolygon":
                ring_out = max(ring_out.geoms, key=lambda q: q.area)
            if ring_in.geom_type == "MultiPolygon":
                ring_in = max(ring_in.geoms, key=lambda q: q.area)
            if ring_in.area >= ring_out.area * 0.98:
                continue
            p, ix = _extrude_ring(ring_out, ring_in, z0 + 0.4, z0 + h, rgb)
            if not len(p):
                continue
            for v in p:
                all_pos.append(v.tolist())
                all_col.append(list(rgb))
            all_idx.extend((ix + index_base).tolist())
            index_base = len(all_pos)
        labels.append({"name": nm, "x": round(rp.x, 1), "y": round(rp.y, 1), "z": round(z0 + 18, 1), "kind": "stadium"})
        log("stadium:", nm, "area", int(outer.area))
    pos = np.asarray(all_pos, np.float32).ravel() if all_pos else np.zeros(0, np.float32)
    col = np.asarray(all_col, np.uint8).ravel() if all_col else np.zeros(0, np.uint8)
    idx = np.asarray(all_idx, np.uint32) if all_idx else np.zeros(0, np.uint32)
    scene_format.write(
        OUT / "stadiums.bin",
        {"kind": "stadiums", "count": len(stadia), "names": [n for n, _ in stadia]},
        {"position": (pos, 3), "color": (col, 3), "index": (idx, 1)},
    )
    geoms = [g for _, g in stadia]
    log("stadiums: baked", len(stadia), "tris", len(idx) // 3)
    return {"count": len(stadia), "geoms": geoms, "labels": labels}


# --------------------------------------------------------------------------- ground texture


def bake_ground(ext: Extent, water) -> dict:
    log("ground: Sentinel-2 median composite")
    stack = []
    for p in sorted((RAW / "s2").glob("s2_*.tif")):
        with rasterio.open(p) as s:
            e0, n0 = ext.xmin + ORIGIN_UTM[0], ext.ymin + ORIGIN_UTM[1]
            e1, n1 = ext.xmax + ORIGIN_UTM[0], ext.ymax + ORIGIN_UTM[1]
            win = rasterio.windows.from_bounds(e0, n0, e1, n1, transform=s.transform)
            arr = s.read(window=win, out_shape=(3, int(round(ext.height / 10)), int(round(ext.width / 10))), resampling=Resampling.bilinear)
            stack.append(arr.astype(np.float32))
    med = np.median(np.stack(stack), axis=0)
    rgb = np.transpose(med, (1, 2, 0))
    # TCI is hazy and dark; lift it toward what the eye sees on the ground.
    rgb = np.clip(rgb / 255.0, 0, 1)
    rgb = np.clip((rgb - 0.02) * 1.12, 0, 1) ** 0.95
    img = Image.fromarray((rgb * 255).astype(np.uint8))
    roof_src = np.asarray(img).copy()
    w, h = img.size
    img = img.resize((w * GROUND_UPSCALE, h * GROUND_UPSCALE), Image.LANCZOS)
    img = ImageEnhance.Color(img).enhance(1.15)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    img.save(OUT / "ground.jpg", quality=86, optimize=True)
    log("ground: texture", img.size)
    return {"image": roof_src, "width_px": img.size[0], "height_px": img.size[1]}


def sample_rgb(img: np.ndarray, ext: Extent, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    h, w, _ = img.shape
    px = np.clip(((x - ext.xmin) / ext.width * w).astype(int), 1, w - 2)
    py = np.clip(((ext.ymax - y) / ext.height * h).astype(int), 1, h - 2)
    acc = np.zeros((len(x), 3), np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            acc += img[py + dy, px + dx].astype(np.float32)
    return acc / 9.0


# --------------------------------------------------------------------------- buildings


def classify(btype: str | None, ov_class: str | None, ov_sub: str | None, area: float, h: float, tags: dict) -> str:
    t = (btype or "").lower()
    c = (ov_class or "").lower()
    s = (ov_sub or "").lower()
    if tags.get("historic") or t in ("fort", "palace", "castle"):
        return "historic"
    if t in ("temple", "mosque", "church", "religious", "shrine", "chapel") or s == "religious" or tags.get("amenity") == "place_of_worship":
        return "religious"
    if t in ("hut", "shed", "kiosk", "garage", "garages", "roof", "carport", "toilets") or (area < 40 and h < 5):
        return "small"
    if t in ("industrial", "warehouse", "factory", "manufacture") or s == "industrial":
        return "industrial"
    if t in ("commercial", "retail", "office", "hotel", "supermarket", "mall") or s == "commercial":
        return "commercial"
    if t in ("school", "college", "university", "hospital", "government", "public", "train_station", "civic") or s in ("education", "civic", "medical", "transportation"):
        return "civic"
    if t in ("apartments", "residential") or c == "apartments" or h >= 15:
        return "apartments"
    return "residential"


def load_osm_buildings():
    tags_by_id: dict[str, dict] = {}
    geoms, ids = [], []
    for f in read_seq(OSM / "bld.geojsonseq"):
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
            continue
        p = f["properties"]
        key = f"{p.get('@type', 'w')[0]}{p.get('@id')}"
        tags_by_id[key] = p
        geoms.append(to_local_geom(shape(f["geometry"])))
        ids.append(key)
    return tags_by_id, geoms, ids


def load_gba(ext: Extent):
    con = duckdb.connect()
    con.execute("LOAD spatial;")
    rows = con.execute(
        f"SELECT height, wkb FROM '{PROC / 'scene' / 'gba.parquet'}'"
    ).fetchall()
    hs = np.array([r[0] for r in rows], dtype=np.float32)
    geoms = shapely.from_wkb([bytes(r[1]) for r in rows])
    geoms = np.array([to_local_geom(g) for g in geoms], dtype=object)
    log("gba: footprints", len(geoms))
    return hs, geoms


def ghsl_sampler():
    path = next((RAW / "ghsl").glob("*R7_C26.tif"))
    src = rasterio.open(path)
    arr = src.read(1)
    to_moll = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)

    def sample(x, y):
        lon, lat = local_to_lonlat(np.asarray(x), np.asarray(y))
        mx, my = to_moll.transform(lon, lat)
        rows, cols = rasterio.transform.rowcol(src.transform, mx, my)
        rows = np.clip(np.asarray(rows), 0, arr.shape[0] - 1)
        cols = np.clip(np.asarray(cols), 0, arr.shape[1] - 1)
        v = arr[rows, cols].astype(np.float32)
        v[v <= 0] = np.nan
        return v

    return sample


def best_match(src_geoms, tgt_geoms, tree: STRtree, iou_min=0.3):
    """For each source geom, index of best target by IoU (or centroid containment), else -1."""
    n = len(src_geoms)
    best = np.full(n, -1, dtype=np.int64)
    best_iou = np.zeros(n, dtype=np.float64)
    si, ti = tree.query(src_geoms, predicate="intersects")
    if len(si):
        a = src_geoms[si]
        b = tgt_geoms[ti]
        inter = shapely.area(shapely.intersection(a, b, grid_size=0.01))
        union = shapely.area(a) + shapely.area(b) - inter
        iou = np.where(union > 0, inter / union, 0)
        order = np.argsort(iou)
        for k in order:
            s = si[k]
            if iou[k] > best_iou[s]:
                best_iou[s] = iou[k]
                best[s] = ti[k]
    weak = best_iou < iou_min
    if weak.any():
        cent = shapely.point_on_surface(src_geoms[weak])
        ci, cti = tree.query(cent, predicate="within")
        widx = np.nonzero(weak)[0]
        best[widx] = -1
        sa = shapely.area(src_geoms[widx])
        for k in range(len(ci)):
            s = widx[ci[k]]
            ratio = sa[ci[k]] / max(shapely.area(tgt_geoms[cti[k]]), 1e-6)
            if 0.33 <= ratio <= 3.0:
                best[s] = cti[k]
    return best, best_iou


def rotated_frame(poly) -> tuple[float, float, float]:
    """Dominant edge angle (radians) and the oriented-box extents."""
    mrr = poly.minimum_rotated_rectangle
    c = np.asarray(mrr.exterior.coords)
    if len(c) < 4:
        return 0.0, 1.0, 1.0
    e1 = c[1] - c[0]
    e2 = c[2] - c[1]
    l1, l2 = np.hypot(*e1), np.hypot(*e2)
    ang = math.atan2(e1[1], e1[0]) if l1 >= l2 else math.atan2(e2[1], e2[0])
    return ang, max(l1, l2), min(l1, l2)


def diversify_height(h: float, src: str, oid: str, kind: str) -> float:
    """Stretch skyline contrast + per-building jitter so satellite/GHSL blocks differ."""
    from scene_heights import MAX_HEIGHT_M, MIN_HEIGHT_M

    if src in ("mapped", "floors"):
        return float(np.clip(h, MIN_HEIGHT_M, MAX_HEIGHT_M))
    s = seed_of(oid)
    u = (s % 1000) / 1000.0
    v = ((s // 1000) % 1000) / 1000.0
    mid = 11.0
    # Amplify deviation from a typical mid-rise so towers and bungalows separate.
    h = mid + (h - mid) * (1.65 if src == "area" else 1.45)
    h *= 0.78 + 0.44 * u
    if kind == "apartments":
        h *= 1.05 + 0.35 * v
    elif kind == "commercial":
        h *= 1.08 + 0.28 * u
    elif kind == "industrial":
        h *= 0.88 + 0.22 * v
    elif kind == "residential":
        h *= 0.85 + 0.40 * v
    elif kind == "civic":
        h *= 1.0 + 0.25 * u
    elif kind == "small":
        h = min(h, 4.5)
    return float(np.clip(h, MIN_HEIGHT_M, MAX_HEIGHT_M))


def roof_props(poly, z_roof: float, rng: np.random.Generator, ang: float, height_m: float):
    """Sparse rooftop clutter — not the same white stair on every building."""
    tanks, stairs = [], []
    area = poly.area
    if area < 80 or height_m < 8.0:
        return tanks, stairs
    inner = poly.buffer(-1.6)
    if inner.is_empty or inner.area < 8:
        return tanks, stairs
    minx, miny, maxx, maxy = inner.bounds
    prepared = shapely.prepared.prep(inner)

    def rand_pt():
        for _ in range(12):
            p = (rng.uniform(minx, maxx), rng.uniform(miny, maxy))
            if prepared.contains(Point(p)):
                return p
        return None

    # Stair heads only on mid/high rises, and only on a fraction of roofs.
    if height_m >= 12.0 and area >= 110 and rng.random() < 0.38:
        c = rand_pt() or (inner.point_on_surface().x, inner.point_on_surface().y)
        sx = 1.5 + rng.uniform(0, 1.1)
        sy = 1.3 + rng.uniform(0, 0.8)
        sh = 1.7 + rng.uniform(0, 1.1)
        stairs.append((c[0], c[1], z_roof, sx, sy, sh, ang + rng.uniform(-0.5, 0.5)))
        if rng.random() < 0.55:
            off = 2.0 + rng.uniform(0, 1.2)
            tanks.append(
                (
                    c[0] + math.cos(ang) * off,
                    c[1] + math.sin(ang) * off,
                    z_roof + sh * 0.35,
                    0.55 + rng.uniform(0, 0.35),
                )
            )
    n_tanks = 0
    if height_m >= 9.0 and rng.random() < 0.5:
        n_tanks = 1 + (1 if area > 280 and rng.random() < 0.4 else 0)
    for _ in range(n_tanks):
        p = rand_pt()
        if p:
            tanks.append((p[0], p[1], z_roof, 0.5 + rng.uniform(0, 0.4)))
    return tanks, stairs


def bake_buildings(ext: Extent, terrain: Terrain, ground_img: np.ndarray, stadium_geoms=None):
    log("buildings: load Overture")
    ov = json.load(open(PROC / "overture-scene" / "building.geojson"))["features"]
    box = shapely.box(ext.xmin, ext.ymin, ext.xmax, ext.ymax)
    stadium_ban = None
    if stadium_geoms:
        stadium_ban = shapely.prepared.prep(shapely.union_all([g.buffer(6) for g in stadium_geoms]))
    geoms, props = [], []
    skipped_stad = 0
    for f in ov:
        if f["properties"].get("is_underground"):
            continue
        g = to_local_geom(shape(f["geometry"]))
        if not g.is_valid:
            g = g.buffer(0)
        if g.is_empty:
            continue
        rp = g.representative_point()
        if not ext.contains(rp.x, rp.y):
            continue
        if g.geom_type == "MultiPolygon":
            g = max(g.geoms, key=lambda q: q.area)
        if g.area < 6:
            continue
        # Drop boxy “stands” that sit on a real stadium footprint — bowl mesh replaces them.
        if stadium_ban is not None and stadium_ban.intersects(g):
            skipped_stad += 1
            continue
        geoms.append(g)
        props.append(f["properties"])
    geoms = np.array(geoms, dtype=object)
    log("buildings: overture in extent", len(geoms), "skipped stadium boxes", skipped_stad)

    tags_by_id, osm_geoms, osm_ids = load_osm_buildings()
    osm_geoms = np.array(osm_geoms, dtype=object)
    osm_tree = STRtree(osm_geoms)
    osm_match, _ = best_match(geoms, osm_geoms, osm_tree, iou_min=0.5)

    gba_h, gba_geoms = load_gba(ext)
    gba_tree = STRtree(gba_geoms)
    gba_match, gba_iou = best_match(geoms, gba_geoms, gba_tree)
    ghsl = ghsl_sampler()
    cents = shapely.point_on_surface(geoms)
    cx, cy = shapely.get_x(cents), shapely.get_y(cents)
    area_h = ghsl(cx, cy)
    roof_rgb = sample_rgb(ground_img, ext, cx, cy)

    # Pass 1: tags + raw satellite value; mapped references for validation.
    pre = []
    validation = []
    for i, (g, p) in enumerate(zip(geoms, props)):
        osm_tags = {}
        for s in p.get("sources") or []:
            rid = (s.get("record_id") or "").split("@")[0]
            if s.get("dataset") == "OpenStreetMap" and rid in tags_by_id:
                osm_tags = tags_by_id[rid]
                break
        if not osm_tags and osm_match[i] >= 0:
            osm_tags = tags_by_id[osm_ids[osm_match[i]]]
        btype = osm_tags.get("building") if osm_tags else None
        sat = float(gba_h[gba_match[i]]) if gba_match[i] >= 0 else None
        ref, ref_src = resolve_height(osm_tags, p.get("height"), p.get("num_floors"), None, None, g.area, btype)
        if ref_src in ("mapped", "floors") and sat is not None:
            validation.append((ref, sat, ref_src))
        pre.append((osm_tags, btype, sat))

    cal_pairs = [(s, r) for r, s, _src in validation]
    calibration = fit_affine_cv([a for a, _ in cal_pairs], [b for _, b in cal_pairs])
    log("buildings: GBA calibration (held-out)", calibration)

    # Pass 2: resolve with the calibrated satellite estimate.
    records = []
    src_count = Counter()
    for i, (g, p) in enumerate(zip(geoms, props)):
        osm_tags, btype, sat = pre[i]
        h, src = resolve_height(
            osm_tags,
            p.get("height"),
            p.get("num_floors"),
            calibrated(sat, g.area, calibration),
            float(area_h[i]) if np.isfinite(area_h[i]) else None,
            g.area,
            btype,
        )
        oid = p.get("id", str(i))
        kind = classify(btype, p.get("class"), p.get("subtype"), g.area, h, osm_tags)
        h = diversify_height(h, src, oid, kind)
        src_count[src] += 1
        name = osm_tags.get("name:en") or osm_tags.get("name") or p.get("name")
        records.append((g, h, src, kind, name, oid, btype or p.get("class") or p.get("subtype")))

    log("buildings: height sources", dict(src_count))
    v = np.array([(a, b) for a, b, _ in validation if _ == "mapped"], dtype=np.float64)
    vf = np.array([(a, b) for a, b, _ in validation if _ == "floors"], dtype=np.float64)

    def stats(arr):
        if not len(arr):
            return {"n": 0}
        d = arr[:, 1] - arr[:, 0]
        return {
            "n": int(len(arr)),
            "mae_m": round(float(np.mean(np.abs(d))), 2),
            "bias_m": round(float(np.mean(d)), 2),
            "median_abs_m": round(float(np.median(np.abs(d))), 2),
            "within_3m_pct": round(float(np.mean(np.abs(d) <= 3) * 100), 1),
        }

    gba_val = {"vs_mapped_height": stats(v), "vs_mapped_floors_x3": stats(vf)}
    log("buildings: GBA validation", gba_val)

    # ---- chunk + encode
    chunks: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, (g, *_r) in enumerate(records):
        chunks[chunk_of(cx[i], cy[i])].append(i)

    rng = np.random.default_rng(42)
    names: list[str] = []
    name_idx: dict[str, int] = {}
    towers = []
    chunk_meta = {}
    total_bytes = 0
    pending = {}
    for key, idxs in chunks.items():
        ox, oy = chunk_center(*key)
        ring_start = [0]
        bld_ring = [0]
        xy = []
        heights, bases, srcs, kinds, roofs, walls, nidx, seeds = [], [], [], [], [], [], [], []
        tanks, stairs = [], []
        for i in idxs:
            g, h, src, kind, name, oid, btype = records[i]
            g = g.simplify(0.25, preserve_topology=True)
            if g.is_empty or g.geom_type != "Polygon":
                continue
            g = shapely.geometry.polygon.orient(g, 1.0)
            rings = [g.exterior] + [r for r in g.interiors if Polygon(r).area > 4]
            ok = True
            loc_rings = []
            for r in rings:
                c = np.asarray(r.coords)[:-1]
                q = np.round((c - (ox, oy)) * 10).astype(np.int64)
                if np.abs(q).max() > 32000 or len(c) < 3:
                    ok = False
                    break
                loc_rings.append(q.astype(np.int16))
            if not ok:
                continue
            for q in loc_rings:
                xy.append(q)
                ring_start.append(ring_start[-1] + len(q))
            bld_ring.append(bld_ring[-1] + len(loc_rings))
            ext_c = np.asarray(g.exterior.coords)
            zs = terrain.sample(ext_c[:, 0], ext_c[:, 1])
            base = float(zs.min()) - 0.3
            heights.append(h)
            bases.append(base)
            srcs.append(SOURCE_CODE[src])
            kinds.append(KIND_CODES[kind])
            rr = np.asarray(roof_rgb[i], dtype=np.float64)
            s = seed_of(oid)
            if kind == "small":
                rr = rr * 0.4 + ROOF_FALLBACK[s % len(ROOF_FALLBACK)].astype(np.float64) * 0.6
            elif float(np.std(rr)) < 14.0:
                # Satellite sample is nearly grey — inject seeded roof colour.
                rr = rr * 0.35 + ROOF_FALLBACK[s % len(ROOF_FALLBACK)].astype(np.float64) * 0.65
            mean = float(rr.mean()) + 1e-3
            rr = np.clip(mean + (rr - mean) * 1.75, 0, 255)
            roofs.append(np.clip(rr * 1.04, 0, 255))
            base_wall = WALL_PALETTE[s % len(WALL_PALETTE)].astype(np.float64)
            # Push wall chroma so Midday haze does not flatten every society to beige.
            wmean = float(base_wall.mean()) + 1e-3
            base_wall = np.clip(wmean + (base_wall - wmean) * 1.35, 0, 255)
            # Light satellite tint only — palette must dominate colour identity.
            tint = np.clip(rr * 0.28 + 95, 55, 215)
            walls.append(np.clip(base_wall * 0.82 + tint * 0.18, 0, 255).astype(np.uint8))
            seeds.append(s & 0xFFFF)
            if name:
                if name not in name_idx:
                    name_idx[name] = len(names)
                    names.append(name)
                nidx.append(name_idx[name])
            else:
                nidx.append(-1)
            if kind not in ("small", "religious", "historic") and h >= 8.0 and g.area >= 70:
                ang, _l, _w = rotated_frame(g)
                t, st = roof_props(g, base + 0.3 + h, rng, ang, h)
                tanks += t
                stairs += st
            if h >= 45:
                towers.append({"x": round(cx[i], 1), "y": round(cy[i], 1), "z": round(base + h, 1), "h": round(h, 1), "name": name, "src": src})
        if not heights:
            continue
        pending[key] = dict(
            ox=ox, oy=oy,
            arrays={
                "ring_start": (np.array(ring_start, np.uint32), 1),
                "bld_ring": (np.array(bld_ring, np.uint32), 1),
                "xy": (np.concatenate(xy).ravel(), 2),
                "height": (np.array(heights, np.float32), 1),
                "base": (np.array(bases, np.float32), 1),
                "src": (np.array(srcs, np.uint8), 1),
                "kind": (np.array(kinds, np.uint8), 1),
                "roof": (np.array(roofs, np.uint8).ravel(), 3),
                "wall": (np.array(walls, np.uint8).ravel(), 3),
                "name": (np.array(nidx, np.int32), 1),
                "seed": (np.array(seeds, np.uint16), 1),
                "tank": (np.array(tanks, np.float32).reshape(-1, 4).ravel() if tanks else np.zeros(0, np.float32), 4),
                "stair": (np.array(stairs, np.float32).reshape(-1, 7).ravel() if stairs else np.zeros(0, np.float32), 7),
            },
            count=len(heights),
        )
    return records, pending, names, towers, dict(src_count), gba_val, calibration


# --------------------------------------------------------------------------- roads + rail


def parse_layer(p) -> int:
    try:
        return int(float(p.get("layer", 0)))
    except ValueError:
        return 0


def densify(coords: np.ndarray, step: float) -> np.ndarray:
    line = LineString(coords)
    return np.asarray(shapely.segmentize(line, step).coords)


def smooth1d(v: np.ndarray, sigma: float) -> np.ndarray:
    if len(v) < 3:
        return v
    return ndimage.gaussian_filter1d(v, sigma, mode="nearest")


def bake_roads(ext: Extent, terrain: Terrain, water=None):
    log("roads: load")
    water_pad = None
    water_wide = None
    if water is not None and not getattr(water, "is_empty", True):
        # Auto-bridge detection + wet-endpoint tests need a generous pad — OSM
        # bridge ways often stop short of the mapped bank (Mundhwa).
        water_pad = shapely.prepared.prep(water.buffer(18))
        water_wide = shapely.prepared.prep(water.buffer(35))
    ways = []
    for f in read_seq(OSM / "roads.geojsonseq"):
        p = f["properties"]
        hw = p.get("highway")
        if hw not in ROAD_CLASSES or f["geometry"]["type"] != "LineString":
            continue
        if p.get("area") == "yes":
            continue
        cls, w = ROAD_CLASSES[hw]
        try:
            lanes = float(str(p.get("lanes", "")).split(";")[0])
            w = max(w * 0.7, min(lanes * 3.3, 26))
        except ValueError:
            pass
        if p.get("oneway") == "yes" and "lanes" not in p:
            w *= 0.75
        c = np.asarray(f["geometry"]["coordinates"])
        nm = p.get("name:en") or p.get("name")
        bridge = p.get("bridge") not in (None, "no") or (nm and "bridge" in nm.lower())
        ways.append(dict(
            ll=c, cls=cls, w=w, hw=hw,
            bridge=bridge,
            tunnel=p.get("tunnel") not in (None, "no") or p.get("covered") == "yes",
            layer=parse_layer(p),
            oneway=p.get("oneway") in ("yes", "1", "true"),
            name=nm,
        ))
    # Junctions: coordinates shared by more than one way (same OSM node).
    use = Counter()
    for wy in ways:
        for k in map(tuple, np.round(wy["ll"], 7)):
            use[k] += 1
        use[tuple(np.round(wy["ll"][0], 7))] += 1
        use[tuple(np.round(wy["ll"][-1], 7))] += 1
    node_id: dict[tuple, int] = {}

    def nid(k):
        if k not in node_id:
            node_id[k] = len(node_id)
        return node_id[k]

    segs = []
    for wy in ways:
        keys = [tuple(k) for k in np.round(wy["ll"], 7)]
        cut = [0] + [i for i in range(1, len(keys) - 1) if use[keys[i]] > 1] + [len(keys) - 1]
        for a, b in zip(cut[:-1], cut[1:]):
            if b <= a:
                continue
            segs.append(dict(wy, ll=wy["ll"][a : b + 1], na=nid(keys[a]), nb=nid(keys[b])))

    # Auto-mark segments that cross the river even if OSM forgot bridge=yes (Bund Garden).
    if water_pad is not None:
        for s in segs:
            if s["bridge"] or s["tunnel"]:
                continue
            x, y = lonlat_to_local(s["ll"][:, 0], s["ll"][:, 1])
            if water_pad.intersects(LineString(np.column_stack([x, y]))):
                s["bridge"] = True

    # Effective layer: OSM layer tag, else class/name hints for untagged flyovers.
    for s in segs:
        s["stack_bonus"] = 0.0
        if not s["bridge"]:
            s["eff_layer"] = max(s["layer"], 0)
            continue
        layer = max(s["layer"], 0)
        nm = (s["name"] or "").lower()
        if layer == 0:
            if s["cls"] <= 2 or "flyover" in nm or "overbridge" in nm or "elevated" in nm:
                layer = 1
            elif s["cls"] <= 3 and s["hw"] not in ("residential", "service"):
                layer = 1
        s["eff_layer"] = layer

    # When two bridge decks cross in plan with the same layer, lift one so
    # Swargate / Dandekar stacks read as separate 3D levels (not a flat scribble).
    bridge_lines, bridge_idxs = [], []
    for i, s in enumerate(segs):
        if not s["bridge"] or len(s["ll"]) < 2:
            continue
        x, y = lonlat_to_local(s["ll"][:, 0], s["ll"][:, 1])
        bridge_lines.append(LineString(np.column_stack([x, y])))
        bridge_idxs.append(i)
    if bridge_lines:
        btree = STRtree(bridge_lines)
        for li, line in enumerate(bridge_lines):
            for hj in btree.query(line, predicate="intersects"):
                if hj <= li:
                    continue
                a, b = bridge_idxs[li], bridge_idxs[hj]
                sa, sb = segs[a], segs[b]
                # Shared endpoints = continuous ramp, not a crossing.
                if sa["na"] in (sb["na"], sb["nb"]) or sa["nb"] in (sb["na"], sb["nb"]):
                    continue
                if sa["eff_layer"] != sb["eff_layer"]:
                    continue
                # Prefer higher-class (lower cls) deck on top; stable tie-break by index.
                top = a if (sa["cls"], a) <= (sb["cls"], b) else b
                segs[top]["stack_bonus"] = max(segs[top]["stack_bonus"], 8.5)

    # Bridge connectivity: an endpoint of a bridge segment that touches only
    # non-bridge segments is a ramp foot.
    bridge_at = Counter()
    for s in segs:
        if s["bridge"]:
            bridge_at[s["na"]] += 1
            bridge_at[s["nb"]] += 1

    vstart = [0]
    xyz = []
    cls_a, w_a, flags_a, na_a, nb_a, name_a = [], [], [], [], [], []
    piers, lamps = [], []
    names, nidx = [], {}
    box = shapely.box(ext.xmin - 50, ext.ymin - 50, ext.xmax + 50, ext.ymax + 50)
    n_bridge = 0
    for s in segs:
        x, y = lonlat_to_local(s["ll"][:, 0], s["ll"][:, 1])
        c = np.column_stack([x, y])
        if not LineString(c).intersects(box):
            continue
        c = densify(c, 10.0)
        g = terrain.sample(c[:, 0], c[:, 1])
        z = smooth1d(g, 1.5) + 0.25
        if s["bridge"]:
            n_bridge += 1
            seglen = np.r_[0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))]
            total = max(float(seglen[-1]), 1.0)
            # Layer 0 → ~6 m, layer 1 → ~15.5 m, layer 2 → ~25 m + crossing bonus.
            layer = int(s.get("eff_layer", max(s["layer"], 0)))
            lift = 6.0 + layer * 9.5 + (2.5 if s["cls"] <= 1 else 0.0) + float(s.get("stack_bonus", 0.0))
            if s["hw"] in ("residential", "service"):
                lift = min(lift, 6.5)
            # Dry-bank height: never aim the deck at carved channel samples.
            dry = [g[i] for i in range(len(c)) if water_wide is None or not water_wide.intersects(Point(c[i, 0], c[i, 1]))]
            bank = float(max(dry)) if dry else float(np.nanmax(g) + 3.0)
            a_wet = water_wide is not None and water_wide.intersects(Point(c[0, 0], c[0, 1]))
            b_wet = water_wide is not None and water_wide.intersects(Point(c[-1, 0], c[-1, 1]))
            end_a = bank if a_wet else float(g[0])
            end_b = bank if b_wet else float(g[-1])
            deck = np.interp(seglen, [0, total], np.array([end_a, end_b])) + lift
            deck = np.maximum(deck, bank + 5.5)
            # Clearance floor over any wet sample along the span (Mundhwa mid-river).
            if water_wide is not None:
                wet_clear = np.array(
                    [bank + lift if water_wide.intersects(Point(c[i, 0], c[i, 1])) else deck[i] for i in range(len(c))],
                    dtype=np.float64,
                )
                deck = np.maximum(deck, wet_clear)
            ramp = min(180.0, max(50.0, total / 1.8))
            # Never ramp down into water — only ease onto dry approach feet.
            fa = 1.0 if (bridge_at[s["na"]] > 1 or a_wet) else np.clip(seglen / ramp, 0, 1)
            fb = 1.0 if (bridge_at[s["nb"]] > 1 or b_wet) else np.clip((total - seglen) / ramp, 0, 1)
            f = np.minimum(fa, fb)
            f = f * f * (3 - 2 * f)
            z = g + 0.25 + (deck - g - 0.25) * f
            # Force wet vertices to full deck height (stops “island bridge” dip).
            if water_wide is not None:
                for i in range(len(c)):
                    if water_wide.intersects(Point(c[i, 0], c[i, 1])):
                        z[i] = max(z[i], bank + lift)
            for k in range(0, len(c), 3):
                if z[k] - g[k] > 3.0:
                    piers.append((c[k, 0], c[k, 1], z[k] - 0.6, min(g[k], bank) - 1.2, min(s["w"] * 0.4, 3.2)))
        flags = (1 if s["bridge"] else 0) | (2 if s["tunnel"] else 0) | (4 if s["oneway"] else 0)
        xyz.append(np.column_stack([c, z]))
        vstart.append(vstart[-1] + len(c))
        cls_a.append(s["cls"])
        w_a.append(s["w"])
        flags_a.append(flags)
        na_a.append(s["na"])
        nb_a.append(s["nb"])
        nm = s["name"]
        if nm and nm not in nidx:
            nidx[nm] = len(names)
            names.append(nm)
        name_a.append(nidx[nm] if nm else -1)
        if s["cls"] <= 4 and not s["tunnel"]:
            seglen = np.r_[0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))]
            spacing = 30.0 if s["cls"] <= 2 else 38.0
            for k, d in enumerate(np.arange(spacing / 2, seglen[-1], spacing)):
                j = min(np.searchsorted(seglen, d), len(c) - 1)
                j0 = max(j - 1, 0)
                dx, dy = c[j] - c[j0] if j != j0 else (c[min(j + 1, len(c) - 1)] - c[j])
                n = math.hypot(dx, dy) or 1
                side = 1 if k % 2 == 0 else -1
                off = s["w"] / 2 + 0.8
                # Arm points back toward the carriageway.
                lamps.append((c[j, 0] - dy / n * off * side, c[j, 1] + dx / n * off * side, z[j], math.atan2(-dx * side, dy * side)))
    xyz = np.concatenate(xyz).astype(np.float32)
    log("roads: bridge segments", n_bridge, "piers", len(piers))
    meta = {"kind": "roads", "names": names}
    scene_format.write(
        OUT / "roads.bin",
        meta,
        {
            "vstart": (np.array(vstart, np.uint32), 1),
            "xyz": (xyz.ravel(), 3),
            "cls": (np.array(cls_a, np.uint8), 1),
            "width": (np.array(w_a, np.float32), 1),
            "flags": (np.array(flags_a, np.uint8), 1),
            "na": (np.array(na_a, np.uint32), 1),
            "nb": (np.array(nb_a, np.uint32), 1),
            "name": (np.array(name_a, np.int32), 1),
            "pier": (np.array(piers, np.float32).ravel(), 5),
            "lamp": (np.array(lamps, np.float32).ravel(), 4),
        },
    )
    log("roads: segments", len(cls_a), "verts", len(xyz), "piers", len(piers), "lamps", len(lamps))
    road_polys = [
        LineString(xyz[vstart[i] : vstart[i + 1], :2]).buffer(w_a[i] / 2 + 0.5, cap_style="flat")
        for i in range(len(cls_a))
        if not flags_a[i] & 2
    ]
    return {"segments": len(cls_a), "piers": len(piers), "lamps": len(lamps)}, road_polys


def bake_rail(ext: Extent, terrain: Terrain):
    vstart, xyz, kinds, elevated = [0], [], [], []
    piers = []
    stations = []
    for f in read_seq(OSM / "rail.geojsonseq"):
        p = f["properties"]
        rw = p.get("railway")
        gt = f["geometry"]["type"]
        if rw == "station" and p.get("name"):
            g = to_local_geom(shape(f["geometry"])).representative_point()
            if ext.contains(g.x, g.y):
                stations.append({"name": p.get("name:en") or p["name"], "x": round(g.x, 1), "y": round(g.y, 1), "metro": p.get("station") == "subway" or "Metro" in str(p.get("network", "")) or p.get("subway") == "yes"})
            continue
        if rw not in ("rail", "subway", "light_rail") or gt != "LineString":
            continue
        if p.get("tunnel") not in (None, "no") or p.get("service") in ("yard", "siding", "spur"):
            continue
        ll = np.asarray(f["geometry"]["coordinates"])
        x, y = lonlat_to_local(ll[:, 0], ll[:, 1])
        c = densify(np.column_stack([x, y]), 10.0)
        if not any(ext.contains(px, py) for px, py in c[:: max(1, len(c) // 8)]):
            continue
        g = terrain.sample(c[:, 0], c[:, 1])
        elev = p.get("bridge") not in (None, "no")
        metro = rw in ("subway", "light_rail")
        if elev and metro:
            z = smooth1d(g, 4.0) + 12.0 + 1.5 * max(parse_layer(p) - 1, 0)
        elif elev:
            z = np.maximum(smooth1d(g, 3.0) + 1.0, max(g[0], g[-1]) + 1.0)
        else:
            z = smooth1d(g, 2.0) + 0.4
        xyz.append(np.column_stack([c, z]))
        vstart.append(vstart[-1] + len(c))
        kinds.append(1 if metro else 0)
        elevated.append(1 if elev else 0)
        if elev and metro:
            for k in range(0, len(c), 3):
                piers.append((c[k, 0], c[k, 1], z[k] - 1.6, g[k] - 1.0, 1.8))
    xyz = np.concatenate(xyz).astype(np.float32) if xyz else np.zeros((0, 3), np.float32)
    scene_format.write(
        OUT / "rail.bin",
        {"kind": "rail"},
        {
            "vstart": (np.array(vstart, np.uint32), 1),
            "xyz": (xyz.ravel(), 3),
            "metro": (np.array(kinds, np.uint8), 1),
            "elevated": (np.array(elevated, np.uint8), 1),
            "pier": (np.array(piers, np.float32).ravel(), 5),
        },
    )
    log("rail: lines", len(kinds), "metro piers", len(piers), "stations", len(stations))
    return {"lines": len(kinds), "piers": len(piers)}, stations


# --------------------------------------------------------------------------- trees


def bake_trees(ext: Extent, terrain: Terrain, records, road_polys, water, pending):
    log("trees: obstacle mask")
    w = int(ext.width / MASK_RES)
    h = int(ext.height / MASK_RES)
    tr = from_origin(ext.xmin, ext.ymax, MASK_RES, MASK_RES)
    shapes = [(r[0].buffer(1.2), 1) for r in records]
    shapes += [(g, 1) for g in road_polys]
    shapes += [(g, 1) for g in getattr(water, "geoms", [water]) if not g.is_empty]
    mask = rasterize(shapes, out_shape=(h, w), transform=tr, dtype=np.uint8)

    log("trees: WorldCover")
    wc_w, wc_h = int(ext.width / 10), int(ext.height / 10)
    wc = np.zeros((wc_h, wc_w), np.uint8)
    with rasterio.open(RAW / "worldcover" / "worldcover.tif") as s:
        reproject(
            s.read(1), wc,
            src_transform=s.transform, src_crs=s.crs,
            dst_transform=from_origin(ext.xmin + ORIGIN_UTM[0], ext.ymax + ORIGIN_UTM[1], 10, 10),
            dst_crs=CRS, resampling=Resampling.nearest,
        )
    green = []
    for f in read_seq(OSM / "land.geojsonseq"):
        p = f["properties"]
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
            continue
        if p.get("leisure") in ("park", "garden") or p.get("landuse") in ("forest", "recreation_ground", "cemetery", "orchard") or p.get("natural") in ("wood", "scrub"):
            green.append(to_local_geom(shape(f["geometry"])))
    gmask = np.zeros((wc_h, wc_w), np.uint8)
    if green:
        gmask = rasterize([(g, 1) for g in green], out_shape=(wc_h, wc_w), transform=from_origin(ext.xmin, ext.ymax, 10, 10), dtype=np.uint8)

    rng = np.random.default_rng(7)
    pts = []
    jj, ii = np.nonzero((wc == 10) | (wc == 20) | ((wc == 30) & (gmask == 1)))
    for j, i in zip(jj, ii):
        cls = wc[j, i]
        n = 1 if cls == 10 else 0
        if cls == 10 and rng.random() < 0.35:
            n = 2
        if cls == 20 and rng.random() < 0.35:
            n = 1
        if cls == 30 and rng.random() < 0.15:
            n = 1
        for _ in range(n):
            x = ext.xmin + (i + rng.random()) * 10
            y = ext.ymax - (j + rng.random()) * 10
            big = cls == 10
            pts.append((x, y, (7.0 + rng.random() * 7.0) if big else (3.5 + rng.random() * 3.5), 0 if big else 1))
    for f in read_seq(OSM / "pts.geojsonseq"):
        if f["properties"].get("natural") == "tree":
            x, y = lonlat_to_local(*f["geometry"]["coordinates"])
            pts.append((x, y, 6.0 + rng.random() * 6.0, 2))
    pts = np.array(pts, dtype=np.float64)
    mi = ((ext.ymax - pts[:, 1]) / MASK_RES).astype(int).clip(0, h - 1)
    mj = ((pts[:, 0] - ext.xmin) / MASK_RES).astype(int).clip(0, w - 1)
    keep = mask[mi, mj] == 0
    # Also keep canopy away from walls (crown radius ~ 0.35 * height).
    pts = pts[keep]
    log("trees: candidates kept", len(pts), "of", len(keep))
    z = terrain.sample(pts[:, 0], pts[:, 1])
    variant = np.where(pts[:, 3] == 1, rng.integers(3, 5, len(pts)), rng.integers(0, 3, len(pts)))
    palm = rng.random(len(pts)) < 0.06
    variant = np.where(palm & (pts[:, 3] != 1), 5, variant)
    by_chunk = defaultdict(list)
    for k in range(len(pts)):
        by_chunk[chunk_of(pts[k, 0], pts[k, 1])].append(k)
    for key, idx in by_chunk.items():
        idx = np.array(idx)
        ox, oy = chunk_center(*key)
        arr = np.column_stack([pts[idx, 0] - ox, pts[idx, 1] - oy, z[idx], pts[idx, 2], variant[idx] + rng.random(len(idx)) * 0.99]).astype(np.float32)
        pending.setdefault(key, dict(ox=ox, oy=oy, arrays={}, count=0))
        pending[key]["arrays"]["tree"] = (arr.ravel(), 5)
    return {"trees": int(len(pts))}


# --------------------------------------------------------------------------- labels


PRESET_WANT = [
    ("Shaniwar Wada", ["Shaniwar Wada", "Shaniwarwada"]),
    ("Dagdusheth Ganpati", ["Dagdusheth", "Shrimant Dagdusheth", "Shreemant Dagdusheth"]),
    ("Pune Station", ["Pune Junction", "Pune Railway Station"]),
    ("Fergusson College", ["Fergusson College"]),
    ("Parvati", ["Parvati"]),
    ("Sarasbaug", ["Sarasbaug"]),
    ("Nehru Stadium", ["Jawaharlal Nehru Cricket Stadium", "Nehru Stadium"]),
    ("Vetal Tekdi", ["Vetal Tekdi"]),
    ("Taljai", ["Taljai"]),
    ("Kasba Ganpati", ["Kasba Ganpati"]),
    ("Pataleshwar", ["Pataleshwar"]),
    ("Chaturshringi", ["Chaturshringi"]),
    ("Deccan", ["Deccan Gymkhana"]),
    ("Swargate", ["Swargate"]),
    ("Koregaon Park", ["Koregaon Park"]),
    ("Baner", ["Baner"]),
    ("Katraj", ["Katraj"]),
    ("Kharadi", ["Kharadi"]),
    ("Hadapsar", ["Hadapsar"]),
    ("Sinhgad Fort", ["Sinhagad Fort", "Sinhgad Fort"]),
    ("Wagholi", ["Wagholi"]),
    ("Wadgaon Sheri", ["Wadgaon Sheri", "Wadgaonsheri", "Vadgaon Sheri"]),
    ("Bund Garden", ["Bund Garden"]),
    ("Bund Garden Bridge", ["Bund Garden Bridge"]),
    ("Sambhaji Bridge", ["Sambhaji Bridge"]),
    ("Shivaji Bridge", ["Shivaji Bridge"]),
    ("Mundhwa Bridge", ["Mundhwa Bridge"]),
    ("Dandekar Bridge", ["Dandekar Bridge"]),
    ("Harris Bridge", ["Harris Bridge", "New Harris Bridge"]),
    ("Aga Khan Palace", ["Aga Khan Palace"]),
]


# Lon/lat pins when OSM has no place node (documented gazetteer fallback).
PRESET_COORDS = {
    "Wadgaon Sheri": (73.9195, 18.5516),
    "Wagholi": (73.9830, 18.5808),
    "Dagdusheth Ganpati": (73.8562, 18.5165),
    "Koregaon Park": (73.8940, 18.5362),
    "Katraj": (73.8615, 18.4520),
    "Kharadi": (73.9440, 18.5515),
    "Hadapsar": (73.9380, 18.5080),
    "Chaturshringi": (73.8305, 18.5385),
}


def _preset_from_buildings(label: str, pats: list[str], ext: Extent, terrain: Terrain):
    """Fall back to a named building centroid when OSM place/landmark tags miss."""
    for f in read_seq(OSM / "bld.geojsonseq"):
        p = f["properties"]
        nm = p.get("name:en") or p.get("name") or ""
        if not nm or not any(pt.lower() in nm.lower() for pt in pats):
            continue
        g = to_local_geom(shape(f["geometry"]))
        rp = g.representative_point()
        if not ext.contains(rp.x, rp.y):
            continue
        z = float(terrain.sample(rp.x, rp.y))
        return {"label": label, "x": round(rp.x, 1), "y": round(rp.y, 1), "z": round(z, 1), "kind": "place"}
    return None


def _preset_from_roads(label: str, pats: list[str], ext: Extent, terrain: Terrain):
    """Named bridge / road centerline midpoint (OSM highway=* with name)."""
    for f in read_seq(OSM / "roads.geojsonseq"):
        p = f["properties"]
        nm = p.get("name:en") or p.get("name") or ""
        if not nm or not any(pt.lower() in nm.lower() for pt in pats):
            continue
        g = to_local_geom(shape(f["geometry"]))
        rp = g.representative_point()
        if not ext.contains(rp.x, rp.y):
            continue
        z = float(terrain.sample(rp.x, rp.y))
        kind = "bridge" if ("bridge" in label.lower() or p.get("bridge") not in (None, "no")) else "place"
        return {"label": label, "x": round(rp.x, 1), "y": round(rp.y, 1), "z": round(z + (8 if kind == "bridge" else 0), 1), "kind": kind}
    return None


def _preset_from_coords(label: str, ext: Extent, terrain: Terrain):
    lonlat = PRESET_COORDS.get(label)
    if not lonlat:
        return None
    x, y = lonlat_to_local(np.array([lonlat[0]]), np.array([lonlat[1]]))
    x, y = float(x[0]), float(y[0])
    if not ext.contains(x, y):
        return None
    z = float(terrain.sample(x, y))
    return {"label": label, "x": round(x, 1), "y": round(y, 1), "z": round(z, 1), "kind": "place"}


def bake_labels(ext: Extent, terrain: Terrain):
    places, landmarks = [], []
    seen = set()
    for f in read_seq(OSM / "poi.geojsonseq"):
        p = f["properties"]
        nm = p.get("name:en") or p.get("name")
        if not nm:
            continue
        g = to_local_geom(shape(f["geometry"]))
        rp = g.representative_point() if g.geom_type != "Point" else g
        if not ext.contains(rp.x, rp.y):
            continue
        z = float(terrain.sample(rp.x, rp.y))
        place = p.get("place")
        # Dense local names (Dharavi-style: Sai Baba Nagar, Laxmi Baug, …).
        if place in ("suburb", "quarter", "neighbourhood", "locality", "town", "village", "hamlet", "isolated_dwelling"):
            key = ("p", nm)
            if key not in seen:
                seen.add(key)
                rank = {
                    "town": 0,
                    "suburb": 0,
                    "village": 1,
                    "quarter": 1,
                    "neighbourhood": 2,
                    "locality": 2,
                    "hamlet": 2,
                    "isolated_dwelling": 2,
                }[place]
                places.append({"name": nm, "x": round(rp.x, 1), "y": round(rp.y, 1), "z": round(z, 1), "rank": rank})
            continue
        if place in ("plot", "square") and ("p", nm) not in seen:
            seen.add(("p", nm))
            places.append({"name": nm, "x": round(rp.x, 1), "y": round(rp.y, 1), "z": round(z, 1), "rank": 2})
            continue
        kind = None
        if p.get("historic") in ("fort", "palace", "castle", "city_gate", "monument", "temple", "building", "ruins") or p.get("tourism") in ("attraction", "museum"):
            kind = "heritage"
        elif p.get("natural") in ("peak", "hill"):
            kind = "hill"
        elif p.get("railway") == "station":
            kind = "station"
        elif p.get("amenity") in ("college", "university") and g.geom_type != "Point" and g.area > 20000:
            kind = "campus"
        elif p.get("leisure") == "stadium":
            kind = "stadium"
        elif p.get("amenity") == "place_of_worship" and (p.get("wikidata") or p.get("wikipedia")):
            kind = "temple"
        if kind and ("l", nm) not in seen:
            seen.add(("l", nm))
            landmarks.append({"name": nm, "kind": kind, "x": round(rp.x, 1), "y": round(rp.y, 1), "z": round(z, 1), "wiki": bool(p.get("wikidata"))})

    # Named societies / mohallas from landuse polygons (Dharavi-style local labels).
    land_path = OSM / "land.geojsonseq"
    if land_path.exists():
        for f in read_seq(land_path):
            p = f["properties"]
            nm = p.get("name:en") or p.get("name")
            if not nm or p.get("landuse") not in ("residential", "commercial", "retail"):
                continue
            if ("p", nm) in seen:
                continue
            g = to_local_geom(shape(f["geometry"]))
            if g.is_empty:
                continue
            # Skip tiny plots; keep colony / society scale (~Dharavi chawl blocks).
            if g.area < 2500:
                continue
            rp = g.representative_point()
            if not ext.contains(rp.x, rp.y):
                continue
            # Spatial thin: skip if another locality sits within ~280 m.
            too_close = False
            for pl in places:
                if pl["rank"] > 1 and (pl["x"] - rp.x) ** 2 + (pl["y"] - rp.y) ** 2 < 280 ** 2:
                    too_close = True
                    break
            if too_close:
                continue
            seen.add(("p", nm))
            z = float(terrain.sample(rp.x, rp.y))
            places.append({"name": nm, "x": round(rp.x, 1), "y": round(rp.y, 1), "z": round(z, 1), "rank": 2})

    presets = []
    for label, pats in PRESET_WANT:
        hit = None
        for lm in landmarks + [dict(pl, kind="place") for pl in places]:
            if any(pt.lower() in lm["name"].lower() for pt in pats):
                hit = lm
                break
        if hit:
            presets.append({"label": label, "x": hit["x"], "y": hit["y"], "z": hit["z"], "kind": hit["kind"]})
        else:
            fb = (
                _preset_from_roads(label, pats, ext, terrain)
                or _preset_from_buildings(label, pats, ext, terrain)
                or _preset_from_coords(label, ext, terrain)
            )
            if fb:
                presets.append(fb)
    log("labels: places", len(places), "landmarks", len(landmarks), "presets", [p["label"] for p in presets])
    return places, landmarks, presets


# --------------------------------------------------------------------------- horizon

OUTER_HALF_M = 30000.0
OUTER_STEP = 120.0
S2_SCENE_URL = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/43/Q/CA/2026/1/S2B_43QCA_20260118_0_L2A/TCI.tif"


def bake_outer(ext: Extent) -> dict:
    """Low-res terrain + imagery out to ±30 km so the horizon has real hills."""
    log("horizon: DEM + Sentinel-2 overview")
    n = int(2 * OUTER_HALF_M / OUTER_STEP) + 1
    e0 = -OUTER_HALF_M + ORIGIN_UTM[0]
    n1 = OUTER_HALF_M + ORIGIN_UTM[1]
    dst = np.zeros((n, n), np.float32)
    dst_tf = from_origin(e0 - OUTER_STEP / 2, n1 + OUTER_STEP / 2, OUTER_STEP, OUTER_STEP)
    for path in sorted((RAW / "dem").glob("cop30_*.tif")):
        with rasterio.open(path) as src:
            reproject(
                rasterio.band(src, 1),
                dst,
                dst_transform=dst_tf,
                dst_crs=CRS,
                resampling=Resampling.average,
            )
    h = np.flipud(dst)
    # East of 74°E lies outside the downloaded DEM tile: extend the nearest value.
    nodata = h <= 1.0
    if nodata.any():
        idx = ndimage.distance_transform_edt(nodata, return_distances=False, return_indices=True)
        h = h[tuple(idx)]
    xs = -OUTER_HALF_M + np.arange(n) * OUTER_STEP
    ys = -OUTER_HALF_M + np.arange(n) * OUTER_STEP
    X, Y = np.meshgrid(xs, ys)
    inside = (X > ext.xmin - 60) & (X < ext.xmax + 60) & (Y > ext.ymin - 60) & (Y < ext.ymax + 60)
    h = np.where(inside, h - 6.0, h).astype(np.float32)
    scene_format.write(
        OUT / "outer.bin",
        {"kind": "terrain", "x0": -OUTER_HALF_M, "y0": -OUTER_HALF_M, "step": OUTER_STEP, "nx": n, "ny": n},
        {"height": (h.ravel(), 1)},
    )
    px = 1024
    with rasterio.open(S2_SCENE_URL) as s:
        win = rasterio.windows.from_bounds(e0, n1 - 2 * OUTER_HALF_M, e0 + 2 * OUTER_HALF_M, n1, transform=s.transform)
        arr = s.read(window=win, out_shape=(3, px, px), boundless=True, fill_value=0, resampling=Resampling.average).astype(np.float32)
    rgb = np.transpose(arr, (1, 2, 0)) / 255.0
    empty = rgb.sum(axis=2) < 0.02
    if empty.any():
        rgb[empty] = np.median(rgb[~empty], axis=0)
    rgb = np.clip((rgb - 0.03) * 1.3, 0, 1) ** 0.9
    Image.fromarray((rgb * 255).astype(np.uint8)).save(OUT / "outer.jpg", quality=85)
    log("horizon: grid", n, "elev", float(h.min()), float(h.max()))
    return {"half": OUTER_HALF_M}


# --------------------------------------------------------------------------- main


def main() -> int:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in (OUT / "chunks").glob("*.bin") if (OUT / "chunks").exists() else []:
        old.unlink()
    ext = extent_inside_bbox(*SCENE_BBOX)
    log("extent", ext)
    terrain = build_terrain(ext)
    water = load_water(ext)
    roads_keep = road_protect_mask(ext, terrain)
    level = carve_water(terrain, water, roads_keep)
    water_stats = bake_water(water, level, terrain)
    scene_format.write(
        OUT / "terrain.bin",
        {"kind": "terrain", "x0": terrain.x0, "y0": terrain.y0, "step": terrain.step, "nx": terrain.nx, "ny": terrain.ny},
        {"height": (terrain.h.ravel(), 1)},
    )
    log("terrain: grid", terrain.nx, terrain.ny, "min/max", float(terrain.h.min()), float(terrain.h.max()))
    ground = bake_ground(ext, water)
    bake_outer(ext)
    stadium_stats = bake_stadiums(ext, terrain)
    records, pending, bnames, towers, src_count, gba_val, calibration = bake_buildings(
        ext, terrain, ground["image"], stadium_stats.get("geoms")
    )
    road_stats, road_polys = bake_roads(ext, terrain, water)
    rail_stats, stations = bake_rail(ext, terrain)
    tree_stats = bake_trees(ext, terrain, records, road_polys, water, pending)
    places, landmarks, presets = bake_labels(ext, terrain)
    # Prefer stadium labels from baked bowls.
    for lab in stadium_stats.get("labels") or []:
        if not any(l.get("name") == lab["name"] for l in landmarks):
            landmarks.append({**lab, "wiki": False})

    chunk_list = []
    total = 0
    for (ix, iy), c in sorted(pending.items()):
        arrays = c["arrays"]
        if "tree" not in arrays:
            arrays["tree"] = (np.zeros(0, np.float32), 5)
        n = scene_format.write(OUT / "chunks" / f"c_{ix}_{iy}.bin", {"ix": ix, "iy": iy, "ox": c["ox"], "oy": c["oy"]}, arrays)
        total += n
        hs = arrays.get("height", (np.zeros(0),))[0]
        chunk_list.append({"ix": ix, "iy": iy, "buildings": int(len(hs)), "trees": int(len(arrays["tree"][0]) // 5), "maxZ": float((arrays["base"][0] + hs).max()) if len(hs) else 0.0, "bytes": n})
    n_b = sum(src_count.values())
    lon0, lat0 = local_to_lonlat(ext.xmin, ext.ymin)
    lon1, lat1 = local_to_lonlat(ext.xmax, ext.ymax)
    manifest = {
        "version": 1,
        "name": "Pune · S0 centre",
        "crs": CRS,
        "origin_lonlat": ORIGIN_LONLAT,
        "origin_utm": [round(ORIGIN_UTM[0], 3), round(ORIGIN_UTM[1], 3)],
        "extent": {"xmin": ext.xmin, "ymin": ext.ymin, "xmax": ext.xmax, "ymax": ext.ymax},
        "extent_lonlat": [round(lon0, 5), round(lat0, 5), round(lon1, 5), round(lat1, 5)],
        "chunk_size": CHUNK_SIZE_M,
        "chunks": chunk_list,
        "building_names": bnames,
        "stats": {
            "buildings": n_b,
            "height_sources": {s: src_count.get(s, 0) for s in SOURCES},
            "height_source_labels": SOURCE_LABEL,
            "height_validation_gba": gba_val,
            "height_calibration": calibration,
            "trees": tree_stats["trees"],
            "road_segments": road_stats["segments"],
            "street_lights": road_stats["lamps"],
            "rail_lines": rail_stats["lines"],
            "water_triangles": water_stats["triangles"],
        },
        "towers": sorted(towers, key=lambda t: -t["h"])[:60],
        "places": places,
        "landmarks": landmarks,
        "stations": stations,
        "presets": presets,
        "sources": {
            "footprints": "Overture Maps buildings 2026-10-21.0 (OSM, Google Open Buildings, Microsoft ML Buildings)",
            "osm": "OpenStreetMap contributors, Geofabrik western-zone extract (ODbL)",
            "heights_building": "GlobalBuildingAtlas LoD1 (Zhu et al., TUM, 2025) via Source Cooperative — CC BY-NC 4.0",
            "heights_area": "GHS-BUILT-H R2023A ANBH 2018, 100 m (European Commission JRC) — CC BY 4.0",
            "terrain": "Copernicus DEM GLO-30 (ESA / Airbus), AWS open data",
            "imagery": "Sentinel-2 L2A (Copernicus), Earth Search STAC, median of 3 scenes Dec 2025–Jan 2026",
            "trees": "ESA WorldCover 2021 v200 (CC BY 4.0) + OSM natural=tree",
        },
        "baked_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "bytes_chunks": total,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False))
    log("done", n_b, "buildings,", len(chunk_list), "chunks,", round(total / 1e6, 1), "MB chunks in", round(time.time() - t0), "s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
