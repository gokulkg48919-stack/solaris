import * as THREE from 'three';

const GLSL_NOISE_COMMON = /* glsl */ `
float psHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 psHash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453123);
}

float psNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(psHash3(i + vec3(0.0,0.0,0.0)), psHash3(i + vec3(1.0,0.0,0.0)), f.x),
        mix(psHash3(i + vec3(0.0,1.0,0.0)), psHash3(i + vec3(1.0,1.0,0.0)), f.x), f.y),
    mix(mix(psHash3(i + vec3(0.0,0.0,1.0)), psHash3(i + vec3(1.0,0.0,1.0)), f.x),
        mix(psHash3(i + vec3(0.0,1.0,1.0)), psHash3(i + vec3(1.0,1.0,1.0)), f.x), f.y),
    f.z
  );
}

float psFbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * psNoise3(p);
    p = p * 2.07 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return v;
}

float psRidged(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(psNoise3(p) * 2.0 - 1.0);
    v += a * n * n;
    p = p * 2.13 + vec3(3.1, 5.7, 2.3);
    a *= 0.5;
  }
  return v;
}

// Irregular clustered 3D Worley impact crater field (skips cells & varies radii to avoid uniform grids)
vec2 psCraterLayer(vec3 p, float scale, float sparsity) {
  vec3 sp = p * scale;
  vec3 ip = floor(sp);
  vec3 fp = fract(sp);
  float minD = 1.8;
  float cellSeed = 0.0;
  float sizeSeed = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 n = vec3(float(x), float(y), float(z));
        vec3 rnd = psHash33(ip + n);
        if (rnd.z < sparsity) continue;
        vec3 diff = n + (0.12 + 0.76 * rnd) - fp;
        float d = length(diff);
        if (d < minD) {
          minD = d;
          cellSeed = rnd.x;
          sizeSeed = rnd.y;
        }
      }
    }
  }
  if (minD > 1.5) return vec2(0.0);
  float rad = 0.11 + 0.36 * (sizeSeed * sizeSeed);
  float u = minD / rad;
  if (u > 1.28) return vec2(0.0);
  float bowl = -smoothstep(0.84, 0.0, u) * 0.68;
  float rim = exp(-pow((u - 0.88) / 0.14, 2.0)) * 0.40;
  float peak = sizeSeed > 0.72 ? exp(-u * u * 26.0) * 0.22 : 0.0;
  return vec2((bowl + rim + peak) * (0.4 + 0.6 * cellSeed), rim);
}
`;

interface PlanetShaderConfig {
  mode: number;
  atmoColor: THREE.Color;
  atmoStrength: number;
  warmSunset: number;
}

function getPlanetShaderConfig(bodyId: string): PlanetShaderConfig {
  switch (bodyId) {
    case 'mercury':
    case 'moon':
      return {
        mode: 1,
        atmoColor: new THREE.Color('#000000'),
        atmoStrength: 0.0,
        warmSunset: 0.0,
      };
    case 'mars':
      return {
        mode: 2,
        atmoColor: new THREE.Color('#e28658'),
        atmoStrength: 0.36,
        warmSunset: 0.35,
      };
    case 'earth':
      return {
        mode: 3,
        atmoColor: new THREE.Color('#4ca2ff'),
        atmoStrength: 0.56,
        warmSunset: 0.55,
      };
    case 'venus':
      return {
        mode: 4,
        atmoColor: new THREE.Color('#f4ca78'),
        atmoStrength: 0.44,
        warmSunset: 0.25,
      };
    case 'jupiter':
      return {
        mode: 5,
        atmoColor: new THREE.Color('#e8c494'),
        atmoStrength: 0.26,
        warmSunset: 0.15,
      };
    case 'saturn':
      return {
        mode: 6,
        atmoColor: new THREE.Color('#ead5a4'),
        atmoStrength: 0.26,
        warmSunset: 0.15,
      };
    case 'uranus':
      return {
        mode: 7,
        atmoColor: new THREE.Color('#8ee6f2'),
        atmoStrength: 0.38,
        warmSunset: 0.0,
      };
    case 'neptune':
      return {
        mode: 7,
        atmoColor: new THREE.Color('#4a86ff'),
        atmoStrength: 0.46,
        warmSunset: 0.0,
      };
    default:
      return {
        mode: 0,
        atmoColor: new THREE.Color('#000000'),
        atmoStrength: 0.0,
        warmSunset: 0.0,
      };
  }
}

export function applyPlanetMicroDetailShader(
  mat: THREE.MeshStandardMaterial,
  bodyId: string
): void {
  const cfg = getPlanetShaderConfig(bodyId);
  if (cfg.mode === 0) return;

  mat.customProgramCacheKey = () => `planet-micro-detail-${bodyId}-v3`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlanetMode = { value: cfg.mode };
    shader.uniforms.uIsEarth = { value: bodyId === 'earth' ? 1.0 : 0.0 };
    shader.uniforms.uAtmoColor = { value: cfg.atmoColor };
    shader.uniforms.uAtmoStrength = { value: cfg.atmoStrength };
    shader.uniforms.uWarmSunset = { value: cfg.warmSunset };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjDir;
        varying vec3 vObjT;
        varying vec3 vObjB;
        varying vec3 vViewT;
        varying vec3 vViewB;
        varying vec3 vViewN;
        varying vec3 vPlanetWorldPos;
        varying vec3 vPlanetWorldNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vObjDir = normalize(position);
        vec3 upRef = abs(objectNormal.y) > 0.985 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vObjT = normalize(cross(upRef, objectNormal));
        vObjB = normalize(cross(objectNormal, vObjT));
        vViewT = normalize(normalMatrix * vObjT);
        vViewB = normalize(normalMatrix * vObjB);
        vViewN = normalize(normalMatrix * objectNormal);
        vPlanetWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vPlanetWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uPlanetMode;
        uniform float uIsEarth;
        uniform vec3 uAtmoColor;
        uniform float uAtmoStrength;
        uniform float uWarmSunset;
        varying vec3 vObjDir;
        varying vec3 vObjT;
        varying vec3 vObjB;
        varying vec3 vViewT;
        varying vec3 vViewB;
        varying vec3 vViewN;
        varying vec3 vPlanetWorldPos;
        varying vec3 vPlanetWorldNormal;
        ${GLSL_NOISE_COMMON}

        vec2 psPlanetMicro(vec3 d) {
          if (uPlanetMode < 1.5) {
            // Mercury / Moon: regionally clustered irregular crater basins + ridged regolith
            float region = psFbm(d * 2.1);
            float sparse = mix(0.45, 0.14, smoothstep(0.38, 0.64, region));
            vec2 c1 = psCraterLayer(d, 7.2, sparse);
            vec2 c2 = psCraterLayer(d + vec3(4.1, -2.3, 1.9), 18.0, sparse * 0.85);
            vec2 c3 = psCraterLayer(d + vec3(-7.2, 5.4, 3.1), 42.0, 0.34);
            float ridge = psRidged(d * 11.0) * 0.24;
            float grit = psFbm(d * 34.0) * 0.10;
            float h = c1.x * 0.46 + c2.x * 0.22 + c3.x * 0.11 + ridge + grit;
            float rim = max(c1.y * 0.85, c2.y * 0.55);
            return vec2(h, rim);
          } else if (uPlanetMode < 2.5) {
            // Mars: eroded canyon strata, wind-scoured dunes & sparse irregular craters
            float basinMask = smoothstep(0.42, 0.62, psFbm(d * 2.4 + vec3(1.5)));
            vec2 c1 = psCraterLayer(d, 7.8, mix(0.62, 0.34, basinMask));
            vec2 c2 = psCraterLayer(d + vec3(2.8, 6.1, -3.4), 22.0, mix(0.68, 0.42, basinMask));
            float canyon = psRidged(d * 13.5 + vec3(psFbm(d * 5.0) * 0.45)) * 0.34;
            float dunes = psFbm(vec3(d.x * 38.0, d.y * 24.0, d.z * 38.0)) * 0.18;
            float h = c1.x * 0.28 + c2.x * 0.15 + canyon + dunes;
            return vec2(h, c1.y * 0.35);
          } else if (uPlanetMode < 3.5) {
            // Earth: tectonic mountain chains + gentle ocean surface
            float mtn = psRidged(d * 18.0) * 0.52 + psFbm(d * 42.0) * 0.24;
            return vec2(mtn, 0.0);
          } else if (uPlanetMode < 4.5) {
            // Venus: sulfuric super-rotation chevrons & cloud waves
            float shear = psFbm(d * 4.5);
            float w = psFbm(vec3(d.x * 7.5 + shear * 1.4, d.y * 14.0, d.z * 7.5 - shear * 1.1));
            return vec2(w * 0.34, 0.0);
          } else if (uPlanetMode < 5.5) {
            // Jupiter: Kelvin-Helmholtz turbulent jet eddies & festoons
            float jet = sin(d.y * 28.0);
            float warp = psFbm(vec3(d.x * 7.0 + jet * 0.35, d.y * 18.0, d.z * 7.0));
            float curl = psFbm(vec3(d.x * 16.0 + warp * 2.8, d.y * 34.0, d.z * 16.0 - warp * 2.4));
            float fine = psFbm(vec3(d.x * 36.0 + curl * 1.6, d.y * 62.0, d.z * 36.0));
            return vec2(curl * 0.55 + fine * 0.45, curl);
          } else if (uPlanetMode < 6.5) {
            // Saturn: silky atmospheric ripples & faint eddies
            float ed = psFbm(vec3(d.x * 12.0, d.y * 30.0, d.z * 12.0));
            return vec2(ed * 0.22, 0.0);
          } else {
            // Uranus / Neptune: high-altitude methane cirrus filaments
            float shear = psFbm(d * 6.0);
            float w = psFbm(vec3(d.x * 14.0 + shear * 1.2, d.y * 28.0, d.z * 14.0));
            return vec2(w * 0.26, w);
          }
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 psMicro = psPlanetMicro(vObjDir);
        if (uPlanetMode < 1.5) {
          float shadeMod = 0.89 + clamp(psMicro.x + 0.28, 0.0, 0.85) * 0.22;
          diffuseColor.rgb *= shadeMod;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.82, 0.79), clamp(psMicro.y * 0.22, 0.0, 0.18));
        } else if (uPlanetMode < 2.5) {
          float windStreak = psFbm(vec3(vObjDir.x * 10.0, vObjDir.y * 5.0, vObjDir.z * 10.0));
          float dustMod = 0.87 + clamp(psMicro.x + 0.18, 0.0, 0.9) * 0.24;
          diffuseColor.rgb *= dustMod * (0.92 + windStreak * 0.16);
        } else if (uPlanetMode < 3.5) {
          float microDetail = psFbm(vObjDir * 32.0);
          diffuseColor.rgb *= (0.90 + microDetail * 0.20);
          // Cloud shadow mottling over Earth continents & oceans
          float cldWarp = psFbm(vObjDir * 4.5);
          float cldMask = smoothstep(0.54, 0.77, psFbm(vObjDir * 9.0 + vec3(cldWarp * 0.9)));
          diffuseColor.rgb *= (1.0 - cldMask * 0.18);
        } else if (uPlanetMode < 4.5) {
          diffuseColor.rgb *= (0.92 + psMicro.x * 0.45);
        } else if (uPlanetMode < 5.5) {
          // Crisp Juno-style filament contrast & storm eddies
          float eddyDark = smoothstep(0.32, 0.72, psMicro.x);
          vec3 creamFil = vec3(0.95, 0.88, 0.78);
          vec3 rustFil = vec3(0.58, 0.34, 0.20);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.86, mix(rustFil, creamFil, eddyDark), 0.26);
        } else if (uPlanetMode < 6.5) {
          diffuseColor.rgb *= (0.95 + psMicro.x * 0.25);
        } else {
          float streak = smoothstep(0.60, 0.78, psMicro.y);
          diffuseColor.rgb = mix(diffuseColor.rgb * (0.94 + psMicro.x * 0.22), vec3(0.82, 0.92, 1.0), streak * 0.18);
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float psEps = 0.0026;
        float h0 = psMicro.x;
        float hT = psPlanetMicro(normalize(vObjDir + vObjT * psEps)).x;
        float hB = psPlanetMicro(normalize(vObjDir + vObjB * psEps)).x;
        float bumpAmp = uPlanetMode < 1.5
          ? 0.42
          : uPlanetMode < 2.5
            ? 0.44
            : uPlanetMode < 3.5
              ? mix(0.025, 0.46, smoothstep(0.35, 0.75, roughnessFactor))
              : uPlanetMode < 5.5
                ? 0.035
                : 0.02;
        float dT = (hT - h0) * bumpAmp * 18.0;
        float dB = (hB - h0) * bumpAmp * 18.0;
        normal = normalize(normal - dT * normalize(vViewT) - dB * normalize(vViewB));`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uIsEarth > 0.5) {
          float sunFacing = dot(normalize(vPlanetWorldNormal), normalize(-vPlanetWorldPos));
          float nightMask = smoothstep(0.04, -0.16, sunFacing);
          float citySpark = smoothstep(0.28, 0.65, psFbm(vObjDir * 85.0));
          totalEmissiveRadiance *= nightMask * (0.85 + 1.35 * citySpark);
        }`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        if (uAtmoStrength > 0.01) {
          vec3 vDir = normalize(vViewPosition);
          float ndv = clamp(dot(normalize(vViewN), vDir), 0.0, 1.0);
          float fres = pow(1.0 - ndv, 3.0);
          float sunDot = dot(normalize(vPlanetWorldNormal), normalize(-vPlanetWorldPos));
          float sunLit = smoothstep(-0.22, 0.55, sunDot);
          float twilight = exp(-pow((sunDot + 0.03) / 0.13, 2.0)) * uWarmSunset;
          vec3 limbTint = mix(uAtmoColor, vec3(1.0, 0.52, 0.24), clamp(twilight, 0.0, 0.75));
          gl_FragColor.rgb += limbTint * fres * uAtmoStrength * (0.08 + 0.92 * sunLit);
        }`
      );
  };
}

export function applyEarthCloudDetailShader(mat: THREE.MeshStandardMaterial): void {
  mat.customProgramCacheKey = () => 'earth-cloud-micro-v3';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCloudDir;
        varying vec3 vCloudWorldPos;
        varying vec3 vCloudWorldNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCloudDir = normalize(position);
        vCloudWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vCloudWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCloudDir;
        varying vec3 vCloudWorldPos;
        varying vec3 vCloudWorldNormal;
        ${GLSL_NOISE_COMMON}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float warp = psFbm(vCloudDir * 5.2);
        float wisp = psFbm(vCloudDir * 14.0 + vec3(warp * 1.4, -warp * 0.8, warp * 1.1));
        float fineWisp = psFbm(vCloudDir * 36.0 + vec3(wisp));
        float cloudCut = smoothstep(0.28, 0.72, wisp * 0.65 + fineWisp * 0.35);
        diffuseColor.a *= (0.45 + 0.85 * cloudCut);
        // Subtle warm twilight tint along Earth's cloud terminator
        float cldSun = dot(normalize(vCloudWorldNormal), normalize(-vCloudWorldPos));
        float cldTwilight = exp(-pow((cldSun + 0.02) / 0.11, 2.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.76, 0.58), cldTwilight * 0.45);`
      );
  };
}

export function applySaturnRingShadowShader(
  mat: THREE.MeshStandardMaterial,
  uniforms: {
    uSaturnPos: { value: THREE.Vector3 };
    uSaturnRadius: { value: number };
  }
): void {
  mat.customProgramCacheKey = () => 'saturn-ring-shadow-v3';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSaturnPos = uniforms.uSaturnPos;
    shader.uniforms.uSaturnRadius = uniforms.uSaturnRadius;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRingWorldPos;
        varying vec2 vRingUv;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRingWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRingUv = uv;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSaturnPos;
        uniform float uSaturnRadius;
        varying vec3 vRingWorldPos;
        varying vec2 vRingUv;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Fine sub-ringlet icy microstructure
        float fineRing = 0.93 + 0.07 * sin(vRingUv.x * 420.0) * cos(vRingUv.x * 190.0);
        diffuseColor.rgb *= fineRing;`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        vec3 oc = vRingWorldPos - uSaturnPos;
        vec3 toSun = normalize(-vRingWorldPos);
        float b = dot(oc, toSun);
        if (b < 0.0) {
          float distToRay = length(oc - toSun * b);
          float shadowFactor = smoothstep(uSaturnRadius * 0.90, uSaturnRadius * 1.03, distToRay);
          gl_FragColor.rgb *= mix(0.06, 1.0, shadowFactor);
        }`
      );
  };
}
