"""PVB1: tiny binary container for scene assets.

Layout (little endian)::

    b"PVB1" | u32 header_len | header JSON (utf-8, space-padded to 8 bytes) | buffers

The header is ``{"meta": {...}, "arrays": {name: {"dtype", "offset", "length", "itemSize"}}}``
where ``offset`` is relative to the start of the buffer area and every buffer is
8-byte aligned so the browser can wrap it in a typed array without copying.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

import numpy as np

MAGIC = b"PVB1"
DTYPES = {
    "float32": np.float32,
    "uint32": np.uint32,
    "int32": np.int32,
    "uint16": np.uint16,
    "int16": np.int16,
    "uint8": np.uint8,
    "int8": np.int8,
}


def encode(meta: dict[str, Any], arrays: dict[str, tuple[np.ndarray, int]]) -> bytes:
    """``arrays`` maps name -> (array, itemSize)."""
    entries: dict[str, dict[str, Any]] = {}
    chunks: list[bytes] = []
    offset = 0
    for name, (arr, item) in arrays.items():
        a = np.ascontiguousarray(arr)
        dt = a.dtype.name
        if dt not in DTYPES:
            raise ValueError(f"unsupported dtype {dt} for {name}")
        raw = a.astype(a.dtype.newbyteorder("<"), copy=False).tobytes()
        pad = (-len(raw)) % 8
        entries[name] = {"dtype": dt, "offset": offset, "length": int(a.size), "itemSize": int(item)}
        chunks.append(raw + b"\0" * pad)
        offset += len(raw) + pad
    header = json.dumps({"meta": meta, "arrays": entries}, separators=(",", ":")).encode()
    header += b" " * ((-(len(header) + 8)) % 8)
    return MAGIC + struct.pack("<I", len(header)) + header + b"".join(chunks)


def decode(buf: bytes) -> tuple[dict[str, Any], dict[str, np.ndarray]]:
    if buf[:4] != MAGIC:
        raise ValueError("not a PVB1 buffer")
    (hlen,) = struct.unpack("<I", buf[4:8])
    header = json.loads(buf[8 : 8 + hlen])
    base = 8 + hlen
    out = {}
    for name, e in header["arrays"].items():
        dt = np.dtype(DTYPES[e["dtype"]]).newbyteorder("<")
        start = base + e["offset"]
        out[name] = np.frombuffer(buf, dtype=dt, count=e["length"], offset=start)
    return header["meta"], out


def write(path: Path, meta: dict[str, Any], arrays: dict[str, tuple[np.ndarray, int]]) -> int:
    data = encode(meta, arrays)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data)
