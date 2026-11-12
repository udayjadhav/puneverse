#!/usr/bin/env python3
"""Small bbox read of Overture Maps buildings + building_part for the S0 centre.

Reads the public GeoParquet release directly with DuckDB (httpfs + spatial) using a
predicate on the ``bbox`` struct columns, so only the S0 row groups are fetched.
This is NOT a city-wide ingestion. Output: data/processed/overture/*.geojson
(gitignored) plus a small JSON summary of coverage.
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
BBOX_FILE = ROOT / "data" / "boundaries" / "pune-center.bbox"
OUT_DIR = ROOT / "data" / "processed" / "overture"
RELEASE_DEFAULT = "2026-10-21.0"

COLUMNS = (
    "id, names.primary AS name, subtype, class, height, num_floors, min_height, "
    "min_floor, roof_shape, roof_height, is_underground, sources, "
    "ST_AsGeoJSON(geometry) AS geom"
)


def read_bbox() -> list[float]:
    return [float(v) for v in BBOX_FILE.read_text().strip().split(",")]


def stac_files(release: str, kind: str, bbox: list[float]) -> list[str]:
    """S3 paths of the release files whose STAC item bbox intersects ``bbox``.

    Globbing the whole release makes DuckDB read every file footer (hundreds of
    files); the STAC items carry per-file bboxes so only intersecting files are read.
    """
    base = f"https://stac.overturemaps.org/{release}/buildings/{kind}"
    coll = json.load(urllib.request.urlopen(f"{base}/collection.json", timeout=60))
    items = [ln["href"] for ln in coll["links"] if ln["rel"] == "item"]
    xmin, ymin, xmax, ymax = bbox

    def item(url: str) -> dict:
        return json.load(urllib.request.urlopen(url, timeout=60))

    files = []
    with ThreadPoolExecutor(32) as ex:
        for it in ex.map(item, items):
            x0, y0, x1, y1 = it["bbox"]
            if x0 <= xmax and x1 >= xmin and y0 <= ymax and y1 >= ymin:
                for asset in it["assets"].values():
                    href = asset["href"]
                    if "amazonaws.com/" in href and href.endswith(".parquet"):
                        files.append("s3://overturemaps-us-west-2/" + href.split("amazonaws.com/", 1)[1])
    return sorted(set(files))


def fetch(con: duckdb.DuckDBPyConnection, release: str, kind: str, bbox: list[float]) -> list:
    xmin, ymin, xmax, ymax = bbox
    cols = (
        COLUMNS
        if kind == "building"
        else COLUMNS.replace("subtype, class, ", "") + ", building_id"
    )
    files = stac_files(release, kind, bbox)
    print(kind, "files", files, flush=True)
    file_list = ", ".join(f"'{f}'" for f in files)
    sql = f"""
        SELECT {cols}
        FROM read_parquet([{file_list}])
        WHERE bbox.xmin <= {xmax} AND bbox.xmax >= {xmin}
          AND bbox.ymin <= {ymax} AND bbox.ymax >= {ymin}
    """
    return con.execute(sql).fetchall(), [d[0] for d in con.description]


def to_feature(row: tuple, names: list) -> dict:
    rec = dict(zip(names, row))
    geom = json.loads(rec.pop("geom"))
    srcs = rec.pop("sources") or []
    props = {k: v for k, v in rec.items() if v is not None}
    props["sources"] = [
        {"dataset": s.get("dataset"), "record_id": s.get("record_id"), "property": s.get("property")}
        for s in srcs
    ]
    return {"type": "Feature", "properties": props, "geometry": geom}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", default=RELEASE_DEFAULT)
    ap.add_argument("--bbox-file", type=Path, default=BBOX_FILE)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = ap.parse_args()
    bbox = [float(v) for v in args.bbox_file.read_text().strip().split(",")]
    out_dir = args.out_dir
    con = duckdb.connect()
    for ext in ("httpfs", "spatial"):
        con.execute(f"INSTALL {ext}; LOAD {ext};")
    con.execute("SET s3_region='us-west-2';")
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = {"release": args.release, "bbox": bbox}
    for kind in ("building", "building_part"):
        rows, names = fetch(con, args.release, kind, bbox)
        feats = [to_feature(r, names) for r in rows]
        (out_dir / f"{kind}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": feats})
        )
        summary[kind] = len(feats)
        print(kind, len(feats), flush=True)
    (out_dir / "fetch-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
