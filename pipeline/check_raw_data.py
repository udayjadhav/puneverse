#!/usr/bin/env python3
"""Verify a local OSM PBF exists and report size / optional md5."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"


def md5_file(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    pbfs = sorted(RAW.glob("*.osm.pbf"))
    if not pbfs:
        print(
            "ERROR: no *.osm.pbf under data/raw/.\n"
            "Download manually from:\n"
            "  https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf\n"
            "Then place it in data/raw/ and re-run.",
            file=sys.stderr,
        )
        return 1
    print(f"OK: found {len(pbfs)} extract(s):")
    for p in pbfs:
        size_mb = p.stat().st_size / (1024 * 1024)
        print(f"  - {p} ({size_mb:.1f} MiB)")
        md5_path = Path(str(p) + ".md5")
        if md5_path.is_file():
            expected = md5_path.read_text().strip().split()[0]
            actual = md5_file(p)
            status = "OK" if expected == actual else "MISMATCH"
            print(f"    md5 {status}: expected={expected} actual={actual}")
            if status != "OK":
                return 2
        if size_mb < 150:
            print(
                f"    WARNING: size {size_mb:.1f} MiB looks incomplete "
                "(western-zone is ~211 MB).",
                file=sys.stderr,
            )
    print("Next: python3 pipeline/bake_center.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
