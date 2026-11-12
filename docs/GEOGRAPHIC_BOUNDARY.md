# Geographic boundary

## Product extent (scope B)

- **Pune Municipal Corporation (PMC)**
- **Pimpri-Chinchwad Municipal Corporation (PCMC)**
- **Cantonments: in** (per G0 `cantonments: true`)

Display name: **Pune & Pimpri-Chinchwad**.

## maxBounds (placeholder)

`config/cities/pune.json` sets:

```json
"maxBounds": [73.65, 18.35, 74.05, 18.75]
```

This is a **placeholder** bbox roughly around urban Pune so MapLibre has a pan limit during scaffolding. It is **not** an official PMC/PCMC/cantonment polygon.

### Next steps (not done)

1. Obtain authoritative admin boundaries (OSM `admin_level` / civic GIS).
2. Replace placeholder bbox with a proper mask or soft boundary.
3. Document CRS and source date in this file.

## Center / zoom

- Center ≈ `[73.8567, 18.5204]`
- Default zoom ≈ `11.5`
