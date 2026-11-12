import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildingDetailRows, buildingInfoFromProps, osmUrl } from "./buildingInfo";

/** FIXTURE: real features from the S0 center bake (see buildings.fixture.geojson). */
const fixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "public/data/fixtures/buildings.fixture.geojson"),
    "utf8",
  ),
) as { features: Array<{ id: number; properties: Record<string, unknown> }> };

function rowsByLabel(props: Record<string, unknown>, id?: number) {
  return Object.fromEntries(
    buildingDetailRows(buildingInfoFromProps(props, id)).map((r) => [r.label, r]),
  );
}

describe("buildingInfoFromProps / buildingDetailRows", () => {
  it("unknown-height building shows Unknown for height, floors, source", () => {
    const f = fixture.features.find(
      (x) => x.properties.height_source === "unknown" && !x.properties.levels_raw,
    )!;
    const rows = rowsByLabel(f.properties, f.id);
    expect(rows.Height.value).toBe("Unknown");
    expect(rows.Floors.value).toBe("Unknown");
    expect(rows["Height source"].value).toBe("Unknown");
    expect(rows.Confidence.value).toBe("None — no height data");
    expect(rows["OSM id"].href).toMatch(/^https:\/\/www\.openstreetmap\.org\/(way|relation)\/\d+$/);
  });

  it("explicit height shows metres, high confidence, dataset", () => {
    const f = fixture.features.find((x) => x.properties.height_source === "osm_explicit")!;
    const rows = rowsByLabel(f.properties, f.id);
    expect(rows.Height.value).toBe(
      `${Number(f.properties.normalized_height_m)} m`.replace(/(\.\d)\d+ m$/, "$1 m"),
    );
    expect(rows["Height source"].value).toBe("OSM height tag");
    expect(rows.Confidence.value).toMatch(/^High — height as tagged in OpenStreetMap/);
    if (f.properties.levels) {
      expect(rows.Floors.value).toMatch(/tagged separately; height uses the OSM height tag/);
    }
    expect(rows.Dataset.value).toMatch(/^osm-geofabrik-western-zone@\d{4}-\d{2}-\d{2}$/);
  });

  it("floors estimate is labelled with the floor-height assumption", () => {
    const f = fixture.features.find(
      (x) => x.properties.height_source === "osm_levels_estimate",
    )!;
    const rows = rowsByLabel(f.properties, f.id);
    expect(rows.Height.value).toMatch(/estimate: floors × 3 m/);
    expect(rows.Floors.value).toBe(String(f.properties.levels));
    expect(rows.Confidence.value).toBe("Medium — estimated from the floor count");
  });

  it("never fabricates a name; shows OSM name only when tagged", () => {
    expect(rowsByLabel({ height_source: "unknown" })["OSM name"]).toBeUndefined();
    expect(rowsByLabel({ height_source: "unknown", name: "Tata Hall" })["OSM name"].value).toBe(
      "Tata Hall",
    );
  });

  it("empty / garbage props degrade to Unknown everywhere", () => {
    const rows = rowsByLabel({ height_source: "bogus", normalized_height_m: 12 });
    expect(rows.Height.value).toBe("Unknown");
    expect(rows["Building type"].value).toBe("Unknown");
    expect(rows.Dataset.value).toBe("Unknown");
    expect(rows["OSM id"].value).toBe("Unknown");
    expect(rows["OSM id"].href).toBeUndefined();
  });

  it("validation flags are surfaced with the raw tag", () => {
    const rows = rowsByLabel({
      height_source: "osm_levels_estimate",
      normalized_height_m: 45,
      levels: 15,
      floor_height_m: 3,
      height_raw: "30-40m",
      validation_flags: "height_unparseable",
    });
    expect(rows["Data note"].value).toBe('height unparseable (height="30-40m")');
  });
});

describe("osmUrl", () => {
  it("maps w/r ids and rejects anything else", () => {
    expect(osmUrl("w52755363")).toBe("https://www.openstreetmap.org/way/52755363");
    expect(osmUrl("r10")).toBe("https://www.openstreetmap.org/relation/10");
    expect(osmUrl("n1")).toBeNull();
    expect(osmUrl("w12; javascript:")).toBeNull();
    expect(osmUrl(null)).toBeNull();
  });
});
