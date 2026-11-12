#!/usr/bin/env python3
"""Clip Geofabrik western-zone PBF to SCENE_BBOX and export layers for bake_scene."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "western-zone-latest.osm.pbf"
BBOX_FILE = ROOT / "data" / "boundaries" / "scene-s0.bbox"
OUT = ROOT / "data" / "processed" / "scene"
CLIP = OUT / "extent.osm.pbf"
OSM = OUT / "osm"

LAYERS = {
    "bld": ["n/building", "w/building", "r/building"],
    "roads": ["w/highway", "r/highway"],
    "rail": ["w/railway", "n/railway", "r/railway", "n/public_transport=station", "n/railway=station"],
    "land": [
        "w/natural",
        "r/natural",
        "w/landuse",
        "r/landuse",
        "w/leisure",
        "r/leisure",
        "w/waterway",
        "r/waterway",
    ],
    "pts": ["n/natural=tree", "n/natural=peak"],
    "poi": [
        "n/place",
        "n/tourism",
        "n/historic",
        "n/amenity=place_of_worship",
        "n/amenity=college",
        "n/amenity=university",
        "n/leisure=stadium",
        "n/railway=station",
        "w/place",
        "w/tourism",
        "w/historic",
        "w/amenity=college",
        "w/amenity=university",
        "w/leisure=stadium",
        "r/place",
        "r/tourism",
        "r/historic",
        "r/amenity=college",
        "r/amenity=university",
    ],
}


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.check_call(cmd)


def main() -> int:
    if not RAW.exists():
        raise SystemExit(f"missing {RAW}")
    west, south, east, north = [float(x) for x in BBOX_FILE.read_text().strip().split(",")]
    OSM.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    poly = OUT / "extent.poly"
    # Simple bbox .poly for osmium
    poly.write_text(
        f"extent\n1\n  {west} {south}\n  {east} {south}\n  {east} {north}\n  {west} {north}\n  {west} {south}\nEND\nEND\n"
    )
    run(
        [
            "osmium",
            "extract",
            "-b",
            f"{west},{south},{east},{north}",
            "-o",
            str(CLIP),
            "--overwrite",
            str(RAW),
        ]
    )
    for name, tags in LAYERS.items():
        filtered = OSM / f"{name}.pbf"
        geo = OSM / f"{name}.geojsonseq"
        run(["osmium", "tags-filter", str(CLIP), *tags, "-o", str(filtered), "--overwrite"])
        run(
            [
                "osmium",
                "export",
                str(filtered),
                "-o",
                str(geo),
                "-f",
                "geojsonseq",
                "--overwrite",
            ]
        )
    meta = {"bbox": [west, south, east, north], "layers": list(LAYERS)}
    (OUT / "osm-meta.json").write_text(json.dumps(meta, indent=2))
    print("OK", meta)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
