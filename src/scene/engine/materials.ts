/**
 * Scene materials. All extend MeshStandardMaterial through onBeforeCompile so
 * they keep three's lighting, shadows, fog and environment reflections.
 * Window grids, shutters, weathering, lane markings and waves are generated in
 * the shader (disclosed as generated in About).
 */

import { Color, MeshStandardMaterial, Vector2, type Texture } from "three";

export interface SharedUniforms {
  uTime: { value: number };
  uNight: { value: number };
  /** 0..1 road/building wetness from live weather. */
  uWet: { value: number };
  /** 0..1 precipitation intensity (visual). */
  uPrecip: { value: number };
  /** 0..1 wind strength for foliage. */
  uWindStrength: { value: number };
  /** Wind direction on XZ (unit-ish). */
  uWindDir: { value: Vector2 };
  /** Lightning flash 0..1. */
  uLightning: { value: number };
}

export function makeSharedUniforms(): SharedUniforms {
  return {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uWet: { value: 0 },
    uPrecip: { value: 0 },
    uWindStrength: { value: 0 },
    uWindDir: { value: new Vector2(1, 0) },
    uLightning: { value: 0 },
  };
}

const NOISE_GLSL = /* glsl */ `
float pvHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float pvHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pvNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pvHash2(i), pvHash2(i + vec2(1.0, 0.0)), u.x),
             mix(pvHash2(i + vec2(0.0, 1.0)), pvHash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float pvFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * pvNoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
float pvBox(float x, float lo, float hi, float aa) {
  return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x));
}
`;

const VARY_DECL = /* glsl */ `
varying vec3 vPvWorld;
`;

function addWorldPos(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VARY_DECL}`)
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>\n  vPvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>\n${VARY_DECL}\n${NOISE_GLSL}`,
  );
}

// ---------------------------------------------------------------- buildings

export function makeBuildingMaterial(u: SharedUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = u.uNight;
    shader.uniforms.uWet = u.uWet;
    addWorldPos(shader);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec2 facade;
attribute vec4 bdata;
varying vec2 vFacade;
varying vec4 vBData;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  vFacade = facade;
  vBData = bdata;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uNight;
uniform float uWet;
varying vec2 vFacade;
varying vec4 vBData;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float pvKind = vBData.x;
  float pvPart = vBData.y;
  float pvSeed = vBData.z;
  float pvFloors = vBData.w;
  float pvRough = 0.88;
  float pvLit = 0.0;
  vec3 pvLitColor = vec3(1.0, 0.78, 0.48);
  vec3 pvBase = pow(diffuseColor.rgb, vec3(2.2));
  bool isApt = pvKind > 0.5 && pvKind < 1.5;
  bool isComm = pvKind > 1.5 && pvKind < 2.5;
  bool isInd = pvKind > 2.5 && pvKind < 3.5;
  bool isCivic = pvKind > 4.5 && pvKind < 5.5;
  bool isPlain = (pvKind > 3.5 && pvKind < 4.5) || pvKind > 5.5;
  float seedLo = mod(pvSeed, 256.0);
  float seedHi = floor(pvSeed / 256.0);
  if (pvPart < 0.5) {
    float fh = isInd ? 4.5 : ((isComm || isCivic) ? 3.6 : (isApt ? 3.05 : 3.1));
    // Occasional taller ground floor for shops / stilts (deterministic).
    float groundBoost = (!isInd && !isPlain && mod(seedLo, 7.0) < 2.0) ? 0.35 : 0.0;
    float vf = vFacade.y / fh;
    float fi = floor(vf);
    float fv = fract(vf);
    if (fi < 0.5) fv = vFacade.y / (fh + groundBoost);
    float spacing = isComm ? (2.1 + mod(seedHi, 3.0) * 0.15)
      : (isApt ? (2.7 + mod(seedLo, 3.0) * 0.2) : (2.85 + mod(seedLo, 5.0) * 0.28));
    float uf = vFacade.x / spacing;
    float wi = floor(uf);
    float fu = fract(uf);
    float fwU = fwidth(uf);
    float fwV = fwidth(vf);
    float detail = 1.0 - smoothstep(0.18, 0.55, max(fwU, fwV));
    float rnd = pvHash(vec3(pvSeed * 0.001 + seedHi, fi, wi));
    float bayStyle = pvHash(vec3(seedLo * 0.17, wi, seedHi * 0.31));
    float belowRoof = step(fi + 0.5, pvFloors);
    float hw = isComm ? (0.38 + mod(seedHi, 3.0) * 0.04)
      : (isApt ? (0.28 + mod(seedLo, 3.0) * 0.03) : (0.22 + mod(seedLo, 4.0) * 0.035));
    float wy0 = isInd ? 0.52 : (isApt ? 0.28 : 0.30);
    float wy1 = isInd ? 0.88 : (0.72 + mod(seedHi, 3.0) * 0.04);
    // Wider living-room openings on some residential bays.
    if (!isComm && !isInd && bayStyle > 0.72) { hw = min(0.46, hw + 0.08); wy0 = 0.22; }
    float win = pvBox(fu, 0.5 - hw, 0.5 + hw, fwU * 1.2) * pvBox(fv, wy0, wy1, fwV * 1.2);
    // ~12% blank wall, ~18% balcony recess (not a window).
    float bayRoll = pvHash(vec3(pvSeed * 0.37, wi, 3.0 + seedHi));
    float blank = step(0.88, bayRoll);
    float balcony = step(0.70, bayRoll) * (1.0 - blank) * step(0.5, fi) * (isPlain ? 0.0 : 1.0) * (isInd ? 0.0 : 1.0);
    win *= belowRoof * (1.0 - blank) * (1.0 - balcony);
    if (isPlain) win = 0.0;
    float shop = 0.0;
    float sign = 0.0;
    bool hasShop = fi < 0.5 && (isComm || ((pvKind < 1.5 || isApt) && mod(seedLo, 5.0) < 2.0 && pvFloors > 1.5));
    if (hasShop) {
      win = 0.0;
      balcony = 0.0;
      shop = pvBox(fu, 0.06, 0.94, fwU) * pvBox(fv, 0.0, 0.70, fwV);
      sign = pvBox(fv, 0.74, 0.96, fwV);
    }
    float slab = 1.0 - pvBox(fv, 0.0, 0.05, fwV) * 0.28;
    // Chajja / sunshade band above openings.
    float ledge = pvBox(fv, wy1 + 0.02, wy1 + 0.09, fwV);
    float ledgeShadow = pvBox(fv, wy1 - 0.04, wy1 + 0.02, fwV) * 0.35;
    vec3 col = pvBase * 0.92;
    float streak = pvNoise(vec2(vFacade.x * 0.9 + pvSeed * 0.01, vFacade.y * 0.06));
    float blotch = pvFbm(vFacade * vec2(0.15, 0.22) + vec2(seedLo, seedHi) * 0.05);
    col *= 0.86 + 0.14 * streak;
    col *= 0.92 + 0.12 * blotch;
    col *= mix(0.70, 1.0, smoothstep(0.0, 2.4, vFacade.y));
    // Apartments: slightly cooler / flatter paint; houses: warmer plaster variation.
    if (isApt) col = mix(col, col * vec3(0.96, 0.97, 1.0), 0.25);
    if (pvKind < 0.5) col = mix(col, col * vec3(1.04, 1.0, 0.94), 0.18 * blotch);
    col *= mix(1.0, slab, detail);
    col = mix(col, col * 1.1 + 0.025, ledge * detail * belowRoof * (isPlain ? 0.0 : 1.0));
    col *= 1.0 - ledgeShadow * detail * belowRoof * (isPlain ? 0.0 : 1.0);
    // Balcony: recessed dark slab + thin railing.
    float balBody = balcony * pvBox(fu, 0.08, 0.92, fwU) * pvBox(fv, 0.08, 0.92, fwV);
    float rail = balcony * pvBox(fu, 0.08, 0.92, fwU) * pvBox(fv, 0.78, 0.88, fwV);
    float railPost = balcony * (
      pvBox(fu, 0.12, 0.16, fwU) + pvBox(fu, 0.48, 0.52, fwU) + pvBox(fu, 0.84, 0.88, fwU)
    ) * pvBox(fv, 0.55, 0.88, fwV);
    col = mix(col, col * 0.55, balBody * detail * 0.85);
    col = mix(col, vec3(0.55, 0.56, 0.58), rail * detail);
    col = mix(col, vec3(0.42, 0.43, 0.45), railPost * detail);
    // Occasional AC / box AC under a window bay.
    float acRoll = pvHash(vec3(pvSeed * 0.11, wi, fi + 11.0));
    float ac = step(0.82, acRoll) * (1.0 - blank) * (1.0 - balcony) * step(0.5, fi) * belowRoof * (isPlain || isInd ? 0.0 : 1.0);
    float acBox = ac * pvBox(fu, 0.62, 0.92, fwU) * pvBox(fv, 0.08, 0.28, fwV);
    col = mix(col, vec3(0.72, 0.74, 0.76), acBox * detail);
    vec3 glass = mix(vec3(0.07, 0.08, 0.09), vec3(0.20, 0.25, 0.30), rnd);
    if (isComm || isCivic) glass = mix(vec3(0.10, 0.16, 0.20), vec3(0.22, 0.32, 0.38), rnd);
    float grille = pvBox(fu, 0.49, 0.51, fwU) * win;
    float grilleH = pvBox(fv, 0.54, 0.56, fwV) * win * step(0.55, bayStyle);
    glass = mix(glass, vec3(0.05), (grille + grilleH) * 0.55);
    col = mix(col, glass, win * detail * 1.15);
    col *= mix(1.0, 0.88, step(0.02, fv) * step(fv, 0.08) * detail * belowRoof);
    col = mix(col, col * (isPlain ? 1.0 : 0.82), (1.0 - detail) * belowRoof * 0.6);
    vec3 shutter = mix(vec3(0.38, 0.40, 0.42), vec3(0.55, 0.52, 0.45), pvHash(vec3(pvSeed, wi, 9.0)));
    shutter *= 0.85 + 0.15 * step(0.5, fract(fv * 14.0));
    col = mix(col, shutter, shop * detail);
    float sp = pvHash(vec3(pvSeed, wi, 5.0));
    vec3 signCol = sp < 0.25 ? vec3(0.75, 0.12, 0.10) : (sp < 0.5 ? vec3(0.10, 0.30, 0.65) : (sp < 0.75 ? vec3(0.90, 0.68, 0.10) : vec3(0.12, 0.45, 0.22)));
    col = mix(col, signCol, sign * detail);
    pvBase = col;
    pvRough = mix(0.9, 0.18, win * detail);
    pvRough = mix(pvRough, 0.55, balcony * detail);
    float on = step(0.62, pvHash(vec3(pvSeed * 1.7 + 3.0, fi, wi)));
    // Fewer lit windows — avoids the whole city glowing at night.
    pvLit = (win * on + shop * 0.55 + sign * 0.85 + balcony * 0.12) * belowRoof;
    pvLitColor = sign > 0.5 ? signCol * 1.25 + 0.15 : (rnd > 0.8 ? vec3(0.85, 0.92, 1.0) : vec3(1.0, 0.78, 0.48));
    pvLit = mix(pvLit, 0.14 * (isPlain ? 0.0 : 1.0) * belowRoof, 1.0 - detail);
  } else if (pvPart < 1.5) {
    vec2 rp = vFacade;
    float n1 = pvFbm(rp * 0.35);
    float n2 = pvNoise(rp * 2.1);
    pvBase *= 0.9 + 0.12 * n1;
    pvBase *= 0.94 + 0.08 * n2;
    pvBase *= 0.96 + 0.04 * smoothstep(0.0, 0.4, length(rp));
    // Sparse solar panels on larger roofs (paint only — disclosed as generated).
    float solarChance = pvHash(vec3(pvSeed * 0.02, floor(rp.x * 0.08), floor(rp.y * 0.08)));
    float panel = step(0.72, solarChance) * step(8.0, pvFloors) * (isPlain ? 0.0 : 1.0);
    vec2 cell = fract(rp * 0.55);
    float panelMask = panel * pvBox(cell.x, 0.12, 0.88, fwidth(cell.x) * 2.0) * pvBox(cell.y, 0.18, 0.82, fwidth(cell.y) * 2.0);
    float grid = panel * (pvBox(cell.x, 0.48, 0.52, fwidth(cell.x)) + pvBox(cell.y, 0.48, 0.52, fwidth(cell.y)));
    vec3 solarCol = vec3(0.08, 0.12, 0.22);
    pvBase = mix(pvBase, solarCol, panelMask * 0.85);
    pvBase = mix(pvBase, vec3(0.15, 0.18, 0.28), grid * 0.5);
    pvRough = mix(0.92, 0.35, panelMask);
  } else {
    // Parapet inner face — slightly lighter coping edge via facade.y.
    float cope = smoothstep(0.0, 0.35, fract(vFacade.y * 2.0));
    pvBase *= 0.78 + 0.08 * cope;
  }
  float wetB = clamp(uWet, 0.0, 1.0);
  if (pvPart < 0.5) {
    pvBase *= 1.0 - 0.12 * wetB;
    pvRough = mix(pvRough, 0.35, wetB * 0.5);
  }
  diffuseColor.rgb = pvBase;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = pvRough;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += pvLitColor * pvLit * uNight * 1.15;`,
      );
  };
  m.customProgramCacheKey = () => "pv-building-wet-v1";
  return m;
}

// ---------------------------------------------------------------- terrain

export function makeTerrainMaterial(map: Texture): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    addWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
  {
    vec2 wp = vPvWorld.xz;
    float d1 = pvFbm(wp * 0.08);
    float d2 = pvNoise(wp * 0.9);
    float d3 = pvNoise(wp * 4.0);
    // Soft micro-relief — keep DEM elevation honest; this is albedo only.
    diffuseColor.rgb *= 0.86 + 0.2 * d1;
    diffuseColor.rgb *= 0.95 + 0.07 * d2 + 0.04 * d3;
    // Slight greener pockets where Sentinel is already dark (veg / water margins).
    float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float veg = smoothstep(0.18, 0.42, luma) * (1.0 - smoothstep(0.45, 0.72, luma));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 1.06, 0.90), veg * 0.22 * d1);
    // Contact darkening near buildings (world Y is elev − base; low = valley floors).
    float contact = smoothstep(0.0, 35.0, abs(vPvWorld.y));
    diffuseColor.rgb *= mix(0.88, 1.0, contact);
  }`,
    );
  };
  m.customProgramCacheKey = () => "pv-terrain";
  return m;
}

// ---------------------------------------------------------------- water

export function makeWaterMaterial(u: SharedUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    // Mumbai-like deep teal river / creek (not bright pool blue).
    color: new Color(0.035, 0.09, 0.085),
    roughness: 0.08,
    metalness: 0.0,
    envMapIntensity: 1.25,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    addWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
  {
    vec2 p = vPvWorld.xz;
    float t = uTime;
    float e = 0.35;
    #define PVW(q) (pvNoise((q) * 0.18 + vec2(t * 0.20, t * 0.13)) * 0.6 + pvNoise((q) * 0.55 - vec2(t * 0.31, -t * 0.22)) * 0.3 + pvNoise((q) * 1.7 + vec2(t * 0.6, t * 0.45)) * 0.1)
    float h0 = PVW(p);
    float hx = PVW(p + vec2(e, 0.0));
    float hz = PVW(p + vec2(0.0, e));
    vec3 nW = normalize(vec3(-(hx - h0) / e * 0.55, 1.0, -(hz - h0) / e * 0.55));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  // Soft coastal teal variation.
  float wv = pvFbm(vPvWorld.xz * 0.01 + uTime * 0.005);
  diffuseColor.rgb = mix(vec3(0.03, 0.08, 0.09), vec3(0.05, 0.12, 0.11), wv);
  diffuseColor.rgb *= 0.9 + 0.25 * wv;`,
      );
  };
  m.customProgramCacheKey = () => "pv-water";
  return m;
}

// ---------------------------------------------------------------- roads + rail

export function makeRoadMaterial(u: SharedUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = u.uNight;
    shader.uniforms.uWet = u.uWet;
    addWorldPos(shader);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 rdata;
varying vec2 vRoadUv;
varying vec4 vRData;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  vRoadUv = uv;
  vRData = rdata;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uNight;
uniform float uWet;
varying vec2 vRoadUv;
varying vec4 vRData;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float cls = vRData.x;
  float flags = vRData.y;
  float part = vRData.z;
  float along = vRoadUv.x;
  float across = vRoadUv.y;
  float fa = fwidth(across);
  float fl = fwidth(along);
  vec3 c;
  float rough = 0.9;
  if (part > 0.5) {
    c = vec3(0.62, 0.60, 0.56) * (0.85 + 0.15 * pvNoise(vPvWorld.xz * 0.5 + vPvWorld.y));
  } else if (cls > 10.5) {
    // Metro viaduct deck: concrete with two tracks.
    c = vec3(0.60, 0.59, 0.56);
    float a = abs(across);
    float rails = pvBox(a, 0.18, 0.21, fa) + pvBox(a, 0.48, 0.51, fa);
    c = mix(c, vec3(0.32, 0.30, 0.28), pvBox(a, 0.10, 0.60, fa) * 0.7);
    c = mix(c, vec3(0.72, 0.72, 0.74), rails);
    c = mix(c, vec3(0.75, 0.74, 0.70), pvBox(a, 0.86, 1.01, fa));
  } else if (cls > 9.5) {
    c = vec3(0.36, 0.33, 0.30) * (0.8 + 0.3 * pvNoise(vPvWorld.xz * 3.0));
    float a = abs(across);
    float rails = pvBox(a, 0.30, 0.34, fa);
    float sleepers = pvBox(fract(along / 0.65), 0.0, 0.35, fl / 0.65) * pvBox(a, 0.0, 0.55, fa);
    c = mix(c, vec3(0.25, 0.20, 0.17), sleepers * 0.8);
    c = mix(c, vec3(0.70, 0.70, 0.72), rails);
  } else {
    float shade = cls < 1.5 ? 0.20 : (cls < 3.5 ? 0.24 : 0.30);
    c = vec3(shade) * vec3(1.0, 0.99, 0.97);
    float n = pvFbm(vPvWorld.xz * 0.6);
    c *= 0.85 + 0.25 * n;
    // Worn wheel tracks and patches.
    c *= 1.0 - 0.06 * pvBox(abs(across), 0.25, 0.55, fa);
    float detail = 1.0 - smoothstep(0.3, 0.9, fa * 6.0);
    if (cls < 3.5) {
      float edge = pvBox(abs(across), 0.88, 0.93, fa);
      bool oneway = mod(floor(flags / 4.0), 2.0) > 0.5;
      float dash = step(fract(along / 9.0), 0.5);
      float centre = oneway ? 0.0 : pvBox(abs(across), 0.0, 0.025, fa) * dash;
      float lanes = cls < 1.5 ? pvBox(abs(abs(across) - 0.45), 0.0, 0.02, fa) * dash : 0.0;
      if (cls < 1.5 && !oneway) centre = pvBox(abs(across), 0.0, 0.035, fa);
      float mark = max(max(edge, centre), lanes) * detail;
      c = mix(c, vec3(0.86, 0.85, 0.80), mark * 0.9);
    }
    // Kerb / footpath strip on major roads.
    if (cls < 2.5) c = mix(c, vec3(0.55, 0.53, 0.50), pvBox(abs(across), 0.955, 1.01, fa));
    rough = 0.85;
  }
  // Wet roads: darker asphalt, lower roughness — not a mirror.
  float wet = clamp(uWet, 0.0, 1.0);
  if (part < 0.5 && cls < 9.5) {
    c *= 1.0 - 0.22 * wet;
    rough = mix(rough, 0.28, wet * 0.85);
    // Subtle puddle patches (noise), not full-surface mirror.
    float puddle = smoothstep(0.62, 0.78, pvFbm(vPvWorld.xz * 0.35));
    rough = mix(rough, 0.18, puddle * wet * 0.55);
    c *= 1.0 - puddle * wet * 0.12;
  }
  diffuseColor.rgb = pow(c, vec3(2.2));`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = rough;`,
      );
  };
  m.customProgramCacheKey = () => "pv-road-wet-v1";
  return m;
}
