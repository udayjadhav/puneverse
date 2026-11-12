import {
  AdditiveBlending,
  Color,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
} from "three";
import type { SharedUniforms } from "./materials";

export interface CullUniforms {
  uCam: { value: Vector3 };
  uNearR: { value: number };
}

/**
 * Vertex-coloured standard material for instanced props. ``glow`` attribute:
 * 1 headlight, 2 tail light, 3 street lamp. Optional leaf clumping and a
 * near-radius cull (far-LOD trees hide inside the radius where near trees draw).
 */
export function makePropMaterial(
  u: SharedUniforms,
  opts: { leaf?: boolean; cull?: CullUniforms; roughness?: number } = {},
): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.8, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = u.uNight;
    if (opts.cull) {
      shader.uniforms.uCam = opts.cull.uCam;
      shader.uniforms.uNearR = opts.cull.uNearR;
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float glow;
varying float vGlow;
varying vec3 vPropW;
${opts.cull ? "uniform vec3 uCam; uniform float uNearR;" : ""}`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
  vGlow = glow;
  {
    vec4 pw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      pw = instanceMatrix * pw;
    #endif
    vPropW = (modelMatrix * pw).xyz;
  }
  ${
    opts.cull
      ? `{
    vec4 ip = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix * ip;
    #endif
    ip = modelMatrix * ip;
    if (distance(ip.xz, uCam.xz) < uNearR) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`
      : ""
  }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uNight;
varying float vGlow;
varying vec3 vPropW;
float ppHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ppNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ppHash(i), ppHash(i + vec2(1.0, 0.0)), u.x), mix(ppHash(i + vec2(0.0, 1.0)), ppHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  ${
    opts.leaf
      ? `{
    float n = ppNoise(vPropW.xz * 1.3 + vPropW.y * 0.7) * 0.6 + ppNoise(vPropW.xy * 3.1) * 0.4;
    diffuseColor.rgb *= 0.7 + 0.55 * n;
  }`
      : ""
  }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  if (vGlow > 0.5) {
    vec3 gc = vGlow < 1.5 ? vec3(1.0, 0.95, 0.8) * 3.0 * uNight
            : (vGlow < 2.5 ? vec3(1.0, 0.08, 0.04) * (0.3 + 1.5 * uNight)
            : vec3(1.0, 0.72, 0.4) * 4.0 * uNight);
    totalEmissiveRadiance += gc;
  }`,
      );
  };
  m.customProgramCacheKey = () => `pv-prop-${opts.leaf ? 1 : 0}-${opts.cull ? 1 : 0}`;
  return m;
}

/** Soft sodium-yellow pools of light under street lamps (night only). */
export function makeLightPoolMaterial(u: SharedUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uNight: u.uNight, uColor: { value: new Color(1.0, 0.68, 0.32) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float uNight;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.2) * uNight * 0.55;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
