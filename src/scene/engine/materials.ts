/**
 * Scene materials. All extend MeshStandardMaterial through onBeforeCompile so
 * they keep three's lighting, shadows, fog and environment reflections.
 * Window grids, shutters, weathering, lane markings and waves are generated in
 * the shader (disclosed as generated in About).
 */

import { Color, MeshStandardMaterial, type Texture } from "three";

export interface SharedUniforms {
  uTime: { value: number };
  uNight: { value: number };
}

export function makeSharedUniforms(): SharedUniforms {
  return { uTime: { value: 0 }, uNight: { value: 0 } };
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
  bool isComm = pvKind > 1.5 && pvKind < 2.5;
  bool isInd = pvKind > 2.5 && pvKind < 3.5;
  bool isPlain = pvKind > 3.5 && pvKind < 4.5 || pvKind > 5.5;
  if (pvPart < 0.5) {
    float fh = isInd ? 4.5 : ((isComm || (pvKind > 4.5 && pvKind < 5.5)) ? 3.6 : 3.1);
    float vf = vFacade.y / fh;
    float fi = floor(vf);
    float fv = fract(vf);
    float spacing = isComm ? 2.3 : (2.9 + mod(pvSeed, 4.0) * 0.3);
    float uf = vFacade.x / spacing;
    float wi = floor(uf);
    float fu = fract(uf);
    float fwU = fwidth(uf);
    float fwV = fwidth(vf);
    float detail = 1.0 - smoothstep(0.18, 0.55, max(fwU, fwV));
    float rnd = pvHash(vec3(pvSeed, fi, wi));
    float belowRoof = step(fi + 0.5, pvFloors);
    float hw = isComm ? 0.44 : (0.24 + mod(pvSeed, 3.0) * 0.04);
    float wy0 = isInd ? 0.55 : 0.30;
    float wy1 = isInd ? 0.80 : 0.80;
    float win = pvBox(fu, 0.5 - hw, 0.5 + hw, fwU * 1.2) * pvBox(fv, wy0, wy1, fwV * 1.2);
    // Some bays are blank wall or have a balcony recess.
    float blank = step(0.86, pvHash(vec3(pvSeed * 0.37, wi, 3.0)));
    win *= belowRoof * (1.0 - blank);
    if (isPlain) win = 0.0;
    float shop = 0.0;
    float sign = 0.0;
    bool hasShop = fi < 0.5 && (isComm || (pvKind < 1.5 && mod(pvSeed, 5.0) < 2.0 && pvFloors > 1.5));
    if (hasShop) {
      win = 0.0;
      shop = pvBox(fu, 0.06, 0.94, fwU) * pvBox(fv, 0.0, 0.70, fwV);
      sign = pvBox(fv, 0.74, 0.96, fwV);
    }
    // Floor slab edge and sunshade ledge (chajja) above each window row.
    float slab = 1.0 - pvBox(fv, 0.0, 0.06, fwV) * 0.22;
    float ledge = pvBox(fv, 0.82, 0.87, fwV);
    float ledgeShadow = pvBox(fv, 0.80, 0.82, fwV) * 0.0 + pvBox(fv, wy1 - 0.02, 0.82, fwV) * 0.25;
    vec3 col = pvBase * 0.92;
    // Weathering: monsoon streaks, grime at the base.
    float streak = pvNoise(vec2(vFacade.x * 0.9 + pvSeed, vFacade.y * 0.06));
    float blotch = pvFbm(vFacade * vec2(0.15, 0.22) + pvSeed);
    col *= 0.86 + 0.14 * streak;
    col *= 0.92 + 0.12 * blotch;
    col *= mix(0.72, 1.0, smoothstep(0.0, 2.2, vFacade.y));
    col *= mix(1.0, slab, detail);
    col = mix(col, col * 1.08 + 0.03, ledge * detail * belowRoof * (isPlain ? 0.0 : 1.0));
    col *= 1.0 - ledgeShadow * detail * belowRoof * (isPlain ? 0.0 : 1.0);
    vec3 glass = mix(vec3(0.07, 0.08, 0.09), vec3(0.20, 0.25, 0.30), rnd);
    if (isComm) glass = mix(vec3(0.10, 0.16, 0.20), vec3(0.22, 0.32, 0.38), rnd);
    // Window frame grilles common on Indian homes: darker mullion.
    float grille = pvBox(fu, 0.49, 0.51, fwU) * win;
    glass = mix(glass, vec3(0.05), grille * 0.6);
    // Stronger floor/window contrast so near facades read like Mumbai CSMT close-ups.
    col = mix(col, glass, win * detail * 1.15);
    col *= mix(1.0, 0.9, step(0.02, fv) * step(fv, 0.08) * detail * belowRoof);
    // Far away the grid averages out instead of shimmering.
    col = mix(col, col * (isPlain ? 1.0 : 0.82), (1.0 - detail) * belowRoof * 0.6);
    vec3 shutter = mix(vec3(0.38, 0.40, 0.42), vec3(0.55, 0.52, 0.45), pvHash(vec3(pvSeed, wi, 9.0)));
    shutter *= 0.85 + 0.15 * step(0.5, fract(fv * 14.0));
    col = mix(col, shutter, shop * detail);
    float sp = pvHash(vec3(pvSeed, wi, 5.0));
    vec3 signCol = sp < 0.25 ? vec3(0.75, 0.12, 0.10) : (sp < 0.5 ? vec3(0.10, 0.30, 0.65) : (sp < 0.75 ? vec3(0.90, 0.68, 0.10) : vec3(0.12, 0.45, 0.22)));
    col = mix(col, signCol, sign * detail);
    pvBase = col;
    pvRough = mix(0.9, 0.18, win * detail);
    float on = step(0.58, pvHash(vec3(pvSeed * 1.7 + 3.0, fi, wi)));
    pvLit = (win * on + shop * 0.6 + sign * 0.9) * belowRoof;
    pvLitColor = sign > 0.5 ? signCol * 1.4 + 0.2 : (rnd > 0.75 ? vec3(0.85, 0.92, 1.0) : vec3(1.0, 0.76, 0.45));
    // Distant buildings: average night glow instead of single windows.
    pvLit = mix(pvLit, 0.22 * (isPlain ? 0.0 : 1.0) * belowRoof, 1.0 - detail);
  } else if (pvPart < 1.5) {
    vec2 rp = vFacade;
    float n1 = pvFbm(rp * 0.35);
    float n2 = pvNoise(rp * 2.1);
    // Keep satellite / tin roof colour vivid (Mumbai Dharavi blue / grey blocks).
    pvBase *= 0.9 + 0.12 * n1;
    pvBase *= 0.94 + 0.08 * n2;
    // Mild edge darkening only — do not grey-wash coloured roofs.
    pvBase *= 0.96 + 0.04 * smoothstep(0.0, 0.4, length(rp));
    pvRough = 0.92;
  } else {
    // Plain side wall without window grid — keep bake wall tint.
    pvBase *= 0.82;
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
  totalEmissiveRadiance += pvLitColor * pvLit * uNight * 1.6;`,
      );
  };
  m.customProgramCacheKey = () => "pv-building";
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
    diffuseColor.rgb *= 0.86 + 0.2 * d1;
    diffuseColor.rgb *= 0.95 + 0.07 * d2 + 0.04 * d3;
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
  diffuseColor.rgb = pow(c, vec3(2.2));`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = rough;`,
      );
  };
  m.customProgramCacheKey = () => "pv-road";
  return m;
}
