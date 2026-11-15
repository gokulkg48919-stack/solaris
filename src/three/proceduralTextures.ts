import * as THREE from 'three';
import { isEarthLand } from './earthContinents';

// Fast deterministic integer 3D hash (avoids slow Math.sin per octave)
function hashInt3(ix: number, iy: number, iz: number, seed: number): number {
  let h =
    Math.imul(ix | 0, 374761393) ^
    Math.imul(iy | 0, 668265263) ^
    Math.imul(iz | 0, 2147483647) ^
    Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function hash1D(i: number, seed: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const fz = smoothstep(z - iz);

  const n000 = hashInt3(ix, iy, iz, seed);
  const n100 = hashInt3(ix + 1, iy, iz, seed);
  const n010 = hashInt3(ix, iy + 1, iz, seed);
  const n110 = hashInt3(ix + 1, iy + 1, iz, seed);
  const n001 = hashInt3(ix, iy, iz + 1, seed);
  const n101 = hashInt3(ix + 1, iy, iz + 1, seed);
  const n011 = hashInt3(ix, iy + 1, iz + 1, seed);
  const n111 = hashInt3(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = lerp(n000, n100, fx);
  const nx10 = lerp(n010, n110, fx);
  const nx01 = lerp(n001, n101, fx);
  const nx11 = lerp(n011, n111, fx);

  return lerp(lerp(nx00, nx10, fy), lerp(nx01, nx11, fy), fz);
}

function fbm3D(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x * frequency, y * frequency, z * frequency, seed + i * 31);
    norm += amplitude;
    frequency *= 2.04;
    amplitude *= 0.5;
  }
  return value / norm;
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function mixRgb(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
}

export interface PlanetTextureBundle {
  map: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
  emissiveMap?: THREE.CanvasTexture;
  cloudsMap?: THREE.CanvasTexture;
  ringMap?: THREE.CanvasTexture;
}

interface Crater {
  x: number;
  y: number;
  z: number;
  radius: number;
  depth: number;
  hasRays: boolean;
}

function generateCraters(count: number, seed: number): Crater[] {
  const craters: Crater[] = [];
  for (let i = 0; i < count; i++) {
    const theta = hash1D(i * 5 + 1, seed) * Math.PI * 2;
    const phi = Math.acos(2 * hash1D(i * 5 + 2, seed) - 1);
    const r = 0.03 + Math.pow(hash1D(i * 5 + 3, seed), 2.3) * 0.22;
    craters.push({
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.cos(phi),
      z: Math.sin(phi) * Math.sin(theta),
      radius: r,
      depth: 0.38 + hash1D(i * 5 + 4, seed) * 0.62,
      hasRays: i < 6 && r > 0.06,
    });
  }
  return craters;
}

function createCanvasTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function buildNormalMapFromHeightfield(
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const out = img.data;

  for (let y = 0; y < height; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(height - 1, y + 1);
    // Account for equirectangular horizontal compression near poles
    const latScale = Math.max(0.22, Math.sin((y / (height - 1)) * Math.PI));

    for (let x = 0; x < width; x++) {
      const xm = (x - 1 + width) % width;
      const xp = (x + 1) % width;

      const hL = heights[y * width + xm];
      const hR = heights[y * width + xp];
      const hU = heights[ym * width + x];
      const hD = heights[yp * width + x];

      const dx = ((hL - hR) * strength) / latScale;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * width + x) * 4;
      out[idx] = clampByte((dx * invLen * 0.5 + 0.5) * 255);
      out[idx + 1] = clampByte((dy * invLen * 0.5 + 0.5) * 255);
      out[idx + 2] = clampByte((dz * invLen * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return createCanvasTexture(canvas, false, maxAnisotropy);
}

export function createPlanetTextures(
  id: string,
  maxAnisotropy: number
): PlanetTextureBundle {
  const isHeroHiRes =
    id === 'earth' || id === 'mars' || id === 'jupiter' || id === 'mercury' || id === 'saturn';
  const width = isHeroHiRes ? 1024 : 768;
  const height = isHeroHiRes ? 512 : 384;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const albedoCtx = albedoCanvas.getContext('2d')!;
  const albedoImg = albedoCtx.createImageData(width, height);
  const aData = albedoImg.data;

  const needsNormal =
    id === 'mercury' ||
    id === 'earth' ||
    id === 'mars' ||
    id === 'moon' ||
    id === 'jupiter' ||
    id === 'venus';
  const heightField = needsNormal ? new Float32Array(width * height) : undefined;

  let roughCanvas: HTMLCanvasElement | undefined;
  let roughImg: ImageData | undefined;
  let rData: Uint8ClampedArray | undefined;
  let roughCtx: CanvasRenderingContext2D | undefined;

  if (id === 'earth' || id === 'mercury' || id === 'mars' || id === 'moon') {
    roughCanvas = document.createElement('canvas');
    roughCanvas.width = width;
    roughCanvas.height = height;
    roughCtx = roughCanvas.getContext('2d')!;
    roughImg = roughCtx.createImageData(width, height);
    rData = roughImg.data;
  }

  let emissiveCanvas: HTMLCanvasElement | undefined;
  let emissiveImg: ImageData | undefined;
  let eData: Uint8ClampedArray | undefined;
  let emissiveCtx: CanvasRenderingContext2D | undefined;

  if (id === 'earth') {
    emissiveCanvas = document.createElement('canvas');
    emissiveCanvas.width = width;
    emissiveCanvas.height = height;
    emissiveCtx = emissiveCanvas.getContext('2d')!;
    emissiveImg = emissiveCtx.createImageData(width, height);
    eData = emissiveImg.data;
  }

  const craters =
    id === 'mercury'
      ? generateCraters(26, 11)
      : id === 'moon'
        ? generateCraters(24, 47)
        : id === 'mars'
          ? generateCraters(14, 31)
          : [];

  const smooth01 = (t: number) => {
    const c = t < 0 ? 0 : t > 1 ? 1 : t;
    return c * c * (3 - 2 * c);
  };

  for (let py = 0; py < height; py++) {
    const v = py / (height - 1);
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const absLat = Math.abs(cosPhi);

    for (let px = 0; px < width; px++) {
      const u = px / width;
      const theta = u * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);
      const pIdx = py * width + px;
      const idx = pIdx * 4;

      let rgb: [number, number, number] = [128, 128, 128];
      let hVal = 0.5;
      let roughVal = 215;
      let emitRgb: [number, number, number] = [0, 0, 0];

      if (id === 'mercury' || id === 'moon') {
        const macro = fbm3D(nx * 2.8, ny * 2.8, nz * 2.8, id === 'mercury' ? 3 : 29, 5);
        const micro = fbm3D(nx * 16, ny * 16, nz * 16, id === 'mercury' ? 9 : 41, 4);
        let craterOffset = 0;
        let rayBright = 0;

        for (let c = 0; c < craters.length; c++) {
          const cr = craters[c];
          const dx = nx - cr.x;
          const dy = ny - cr.y;
          const dz = nz - cr.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          const maxR = cr.hasRays ? cr.radius * 2.8 : cr.radius;
          if (d2 < maxR * maxR) {
            const dist = Math.sqrt(d2) * (0.9 + micro * 0.2);
            if (dist < cr.radius) {
              const normD = dist / cr.radius;
              craterOffset -= Math.cos(normD * Math.PI * 0.5) * 0.24 * cr.depth;
            } else if (cr.hasRays) {
              const rayWave = Math.sin(Math.atan2(dz, dx) * 11 + c * 1.7) * 0.5 + 0.5;
              const fade = 1 - (dist - cr.radius) / (cr.radius * 1.8);
              rayBright += Math.max(0, fade) * rayWave * 0.14;
            }
          }
        }

        const mareFactor =
          id === 'moon' ? Math.max(0, Math.min(1, (0.48 - macro) * 3.2)) : 0;

        hVal = Math.max(
          0,
          Math.min(1, macro * 0.65 + micro * 0.22 + craterOffset * (1 - mareFactor * 0.5) + 0.14)
        );
        const darkTone: [number, number, number] =
          id === 'mercury' ? [74, 68, 63] : [64, 68, 76];
        const midTone: [number, number, number] =
          id === 'mercury' ? [142, 134, 126] : [156, 160, 168];
        const brightTone: [number, number, number] =
          id === 'mercury' ? [204, 196, 186] : [220, 224, 228];

        rgb =
          hVal < 0.5
            ? mixRgb(darkTone, midTone, hVal * 2)
            : mixRgb(midTone, brightTone, (hVal - 0.5) * 2);
        if (rayBright > 0) {
          rgb = mixRgb(rgb, brightTone, Math.min(0.55, rayBright));
        }
        roughVal = clampByte(220 - mareFactor * 26 + (0.5 - hVal) * 24);
      } else if (id === 'venus') {
        const swirl = fbm3D(nx * 2.5, ny * 5.2, nz * 2.5, 17, 5);
        const chevron = ny * 11.5 + Math.abs(ny) * 2.4 + swirl * 5.4;
        const bands = Math.sin(chevron) * 0.5 + 0.5;
        const fine = fbm3D(nx * 8.5 + swirl, ny * 12, nz * 8.5, 23, 4);
        const t = bands * 0.56 + fine * 0.44;
        const deepAmber: [number, number, number] = [164, 108, 50];
        const goldenCream: [number, number, number] = [232, 192, 126];
        const paleHaze: [number, number, number] = [248, 228, 184];
        rgb =
          t < 0.5
            ? mixRgb(deepAmber, goldenCream, t * 2)
            : mixRgb(goldenCream, paleHaze, (t - 0.5) * 2);
        hVal = 0.45 + t * 0.14;
      } else if (id === 'earth') {
        const lonDeg = u * 360 - 180;
        const latDeg = 90 - v * 180;
        const coastWarpLon = (fbm3D(nx * 6.5, ny * 6.5, nz * 6.5, 5, 4) - 0.5) * 8.5;
        const coastWarpLat = (fbm3D(nx * 6.5 + 3.1, ny * 6.5, nz * 6.5 - 1.7, 13, 4) - 0.5) * 6.5;
        const wLon = lonDeg + coastWarpLon;
        const wLat = latDeg + coastWarpLat;
        // 5-tap sub-pixel coastline smoothing (eliminates jagged borders)
        const landAlpha =
          ((isEarthLand(wLon, wLat) ? 2 : 0) +
            (isEarthLand(wLon + 0.55, wLat) ? 1 : 0) +
            (isEarthLand(wLon - 0.55, wLat) ? 1 : 0) +
            (isEarthLand(wLon, wLat + 0.45) ? 1 : 0) +
            (isEarthLand(wLon, wLat - 0.45) ? 1 : 0)) /
          6;

        const detail = fbm3D(nx * 15, ny * 15, nz * 15, 44, 4);
        const elevation = fbm3D(nx * 4.5, ny * 4.5, nz * 4.5, 12, 5);

        // Ocean color with smooth continental shelf
        const nearLand =
          isEarthLand(wLon + 3.2, wLat) ||
          isEarthLand(wLon - 3.2, wLat) ||
          isEarthLand(wLon, wLat + 2.5) ||
          isEarthLand(wLon, wLat - 2.5);
        const depth = detail * 0.55 + elevation * 0.45;
        const abyssal: [number, number, number] = [8, 28, 76];
        const midSea: [number, number, number] = [16, 62, 132];
        const shelf: [number, number, number] = [34, 132, 180];
        let oceanRgb =
          depth < 0.55
            ? mixRgb(abyssal, midSea, depth / 0.55)
            : mixRgb(midSea, shelf, (depth - 0.55) / 0.45);
        if (nearLand) {
          oceanRgb = mixRgb(oceanRgb, [46, 152, 192], 0.42);
        }

        // Land biome color
        const landH = Math.max(0, Math.min(1, elevation * 0.7 + detail * 0.3));
        const aridity = fbm3D(nx * 4.0 + 4, ny * 4.0, nz * 4.0 - 2, 81, 3);
        const forest: [number, number, number] = [30, 88, 44];
        const savanna: [number, number, number] = [102, 130, 62];
        const desert: [number, number, number] = [194, 160, 106];
        const alpine: [number, number, number] = [126, 120, 110];
        const snowPeak: [number, number, number] = [234, 240, 248];

        let landRgb = mixRgb(forest, savanna, aridity);
        if (Math.abs(latDeg) > 13 && Math.abs(latDeg) < 35 && aridity > 0.44) {
          landRgb = mixRgb(landRgb, desert, Math.min(1, (aridity - 0.44) * 2.5));
        }
        if (landH > 0.53) {
          landRgb = mixRgb(landRgb, alpine, (landH - 0.53) / 0.28);
        }
        if (landH > 0.78) {
          landRgb = mixRgb(landRgb, snowPeak, smooth01((landH - 0.78) / 0.14) * 0.85);
        }

        rgb = mixRgb(oceanRgb, landRgb, landAlpha);
        hVal = lerp(0.35, 0.48 + landH * 0.52, landAlpha);
        roughVal = clampByte(lerp(42, 228, landAlpha));

        // Feathered polar sea-ice & snowline (no hard white circle)
        const polarIceAlpha = smooth01((absLat - (0.875 - detail * 0.07)) / 0.075);
        if (polarIceAlpha > 0.005) {
          rgb = mixRgb(rgb, [236, 242, 248], polarIceAlpha);
          hVal = lerp(hVal, 0.62 + detail * 0.08, polarIceAlpha);
          roughVal = clampByte(lerp(roughVal, 175, polarIceAlpha));
        }

        // Realistic coastal/temperate night-side city light clusters & metropolitan ribbons
        if (landAlpha > 0.35 && Math.abs(latDeg) < 60 && landH < 0.68 && polarIceAlpha < 0.35) {
          const urbanCluster = fbm3D(nx * 11, ny * 11, nz * 11, 211, 3);
          const microLights = fbm3D(nx * 44, ny * 44, nz * 44, 307, 2);
          const corridor = 1 - Math.min(1, Math.abs(fbm3D(nx * 18, ny * 18, nz * 18, 419, 2) - 0.5) * 18);
          if (urbanCluster > 0.515 && (microLights > 0.49 || corridor > 0.58)) {
            const coreGlow = Math.max(0, (urbanCluster - 0.515) * 4.4) * Math.max(0, (microLights - 0.48) * 3.8);
            const roadGlow = Math.max(0, (urbanCluster - 0.515) * 3.2) * corridor * 0.65;
            const intensity = Math.min(1, coreGlow + roadGlow);
            emitRgb = [
              clampByte(255 * intensity),
              clampByte(196 * intensity),
              clampByte(108 * intensity),
            ];
          }
        }
      } else if (id === 'mars') {
        const terrain = fbm3D(nx * 3.2, ny * 3.2, nz * 3.2, 21, 5);
        const dust = fbm3D(nx * 14, ny * 14, nz * 14, 63, 4);
        let h = terrain * 0.72 + dust * 0.28;

        // Valles Marineris equatorial canyon scar
        if (Math.abs(ny) < 0.16 && nx > 0.2 && nx < 0.85 && nz > -0.3 && nz < 0.3) {
          h -= 0.28 * (1 - Math.abs(ny) / 0.16);
        }

        // Olympus Mons shield volcano dome
        const dOly = Math.hypot(nx - 0.75, ny - 0.31, nz - 0.58);
        if (dOly < 0.15) {
          h += (1 - dOly / 0.15) * 0.26;
        }

        for (let c = 0; c < craters.length; c++) {
          const cr = craters[c];
          const dx = nx - cr.x;
          const dy = ny - cr.y;
          const dz = nz - cr.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < cr.radius * cr.radius) {
            const normD = Math.sqrt(d2) / cr.radius;
            h -= Math.cos(normD * Math.PI * 0.5) * 0.14;
          }
        }

        hVal = Math.max(0, Math.min(1, h));
        const darkBasalt: [number, number, number] = [94, 44, 30];
        const rustPlains: [number, number, number] = [188, 86, 48];
        const brightOchre: [number, number, number] = [226, 138, 84];
        rgb =
          hVal < 0.48
            ? mixRgb(darkBasalt, rustPlains, hVal / 0.48)
            : mixRgb(rustPlains, brightOchre, (hVal - 0.48) / 0.52);
        roughVal = clampByte(220 + (0.5 - hVal) * 28);

        // Smooth feathered Mars polar frost cap
        const marsIce = smooth01((absLat - (0.875 - dust * 0.065)) / 0.065);
        if (marsIce > 0.005) {
          rgb = mixRgb(rgb, [238, 232, 226], marsIce);
          hVal = lerp(hVal, 0.76, marsIce);
          roughVal = clampByte(lerp(roughVal, 175, marsIce));
        }
      } else if (id === 'jupiter') {
        const turb = fbm3D(nx * 3.8, ny * 9.5, nz * 3.8, 33, 5);
        const fine = fbm3D(nx * 14 + turb * 1.9, ny * 24, nz * 14, 71, 4);
        const bandCoord = ny * 15.5 + (turb - 0.5) * 2.8;
        const band = Math.sin(bandCoord * Math.PI) * 0.5 + 0.5;
        const subBand = Math.cos(ny * 36.0 + fine * 2.4) * 0.5 + 0.5;

        const creamZone: [number, number, number] = [242, 226, 202];
        const ochreBelt: [number, number, number] = [202, 140, 92];
        const umberBelt: [number, number, number] = [132, 76, 48];
        const festoonBlue: [number, number, number] = [116, 128, 148];

        rgb = mixRgb(umberBelt, creamZone, band * 0.68 + subBand * 0.32);
        rgb = mixRgb(rgb, ochreBelt, fine * 0.44);

        // Bluish-grey equatorial festoons along ~8° N
        if (Math.abs(ny - 0.14) < 0.08) {
          const plume = Math.sin(u * Math.PI * 16 + fine * 2.5) * 0.5 + 0.5;
          const eqMask = (1 - Math.abs(ny - 0.14) / 0.08) * Math.pow(plume, 2.2);
          rgb = mixRgb(rgb, festoonBlue, eqMask * 0.45);
        }

        hVal = 0.46 + band * 0.08 + fine * 0.04;

        // Great Red Spot (primary anticyclone with pale collar & turbulent wake)
        const spotLat = (ny + 0.33) / 0.105;
        const spotLon = ((u - 0.24 + 1.5) % 1 - 0.5) / 0.084;
        const spotDist = Math.sqrt(spotLat * spotLat + spotLon * spotLon);
        if (spotDist < 1.28) {
          const swirlFactor = Math.max(0, 1 - spotDist / 1.28);
          const stormCore: [number, number, number] = [192, 66, 42];
          const stormRim: [number, number, number] = [232, 140, 92];
          const collarCol: [number, number, number] = [244, 232, 212];
          const spiral = Math.sin(spotDist * 9.5 + fine * 4.5) * 0.5 + 0.5;
          const stormCol =
            spotDist > 0.90
              ? mixRgb(stormRim, collarCol, (spotDist - 0.90) / 0.38)
              : mixRgb(stormRim, stormCore, spiral);
          rgb = mixRgb(rgb, stormCol, Math.pow(swirlFactor, 0.72) * 0.95);
          hVal += swirlFactor * 0.09;
        }

        // White anticyclonic storm ovals at southern temperate latitudes
        for (let s = 0; s < 3; s++) {
          const oLat = (ny + 0.48 - s * 0.03) / 0.042;
          const oLon = ((u - (0.14 + s * 0.31) + 1.5) % 1 - 0.5) / 0.036;
          const oDist = Math.sqrt(oLat * oLat + oLon * oLon);
          if (oDist < 1.0) {
            rgb = mixRgb(rgb, [246, 240, 232], (1 - oDist * oDist) * 0.82);
          }
        }
      } else if (id === 'saturn') {
        const turb = fbm3D(nx * 2.8, ny * 7.2, nz * 2.8, 51, 4);
        const band = Math.sin((ny * 13.0 + (turb - 0.5) * 0.9) * Math.PI) * 0.5 + 0.5;
        const subBand = Math.cos(ny * 26.0 + turb * 1.4) * 0.5 + 0.5;
        // Subtle Cassini-inspired North Polar Hexagonal jet boundary
        const hexRadius = 0.875 + 0.018 * Math.cos(theta * 6.0);
        const polarDark = Math.max(0, (absLat - (ny > 0 ? hexRadius : 0.78)) / 0.22);
        const paleGold: [number, number, number] = [238, 218, 172];
        const warmTan: [number, number, number] = [196, 168, 118];
        const polarSlate: [number, number, number] = [118, 132, 128];
        rgb = mixRgb(warmTan, paleGold, band * 0.75 + subBand * 0.25);
        rgb = mixRgb(rgb, polarSlate, Math.min(1, polarDark * 0.74));
      } else if (id === 'uranus') {
        const haze = fbm3D(nx * 2.2, ny * 4.8, nz * 2.2, 91, 3);
        const band = Math.sin(ny * 9.0 + haze * 0.7) * 0.5 + 0.5;
        const polarHood = smooth01((absLat - 0.65) / 0.35);
        const deepCyan: [number, number, number] = [104, 198, 212];
        const paleIce: [number, number, number] = [184, 240, 246];
        rgb = mixRgb(deepCyan, paleIce, band * 0.55 + polarHood * 0.42);
      } else if (id === 'neptune') {
        const turb = fbm3D(nx * 3.2, ny * 7.0, nz * 3.2, 105, 4);
        const band = Math.sin(ny * 10.0 + turb * 1.5) * 0.5 + 0.5;
        const deepCobalt: [number, number, number] = [30, 66, 174];
        const brightAzure: [number, number, number] = [68, 126, 234];
        rgb = mixRgb(deepCobalt, brightAzure, band * 0.75 + turb * 0.25);

        const cirrus = fbm3D(nx * 6.5, ny * 20.0, nz * 6.5, 117, 3);
        if (cirrus > 0.71) {
          rgb = mixRgb(rgb, [220, 238, 255], (cirrus - 0.71) * 3.2);
        }

        const dLat = (ny + 0.24) / 0.1;
        const dLon = (u - 0.62) / 0.075;
        const dDist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dDist < 1.0) {
          rgb = mixRgb(rgb, [14, 28, 94], (1 - dDist) * 0.78);
        }
      }

      aData[idx] = clampByte(rgb[0]);
      aData[idx + 1] = clampByte(rgb[1]);
      aData[idx + 2] = clampByte(rgb[2]);
      aData[idx + 3] = 255;

      if (heightField) {
        heightField[pIdx] = hVal;
      }
      if (rData) {
        rData[idx] = roughVal;
        rData[idx + 1] = roughVal;
        rData[idx + 2] = roughVal;
        rData[idx + 3] = 255;
      }
      if (eData) {
        eData[idx] = emitRgb[0];
        eData[idx + 1] = emitRgb[1];
        eData[idx + 2] = emitRgb[2];
        eData[idx + 3] = 255;
      }
    }
  }

  albedoCtx.putImageData(albedoImg, 0, 0);
  const bundle: PlanetTextureBundle = {
    map: createCanvasTexture(albedoCanvas, true, maxAnisotropy),
  };

  if (heightField) {
    const normalStrength =
      id === 'mercury' || id === 'moon'
        ? 4.2
        : id === 'mars'
          ? 3.8
          : id === 'earth'
            ? 2.8
            : 1.1;
    bundle.normalMap = buildNormalMapFromHeightfield(
      heightField,
      width,
      height,
      normalStrength,
      maxAnisotropy
    );
  }

  if (roughCanvas && roughCtx && roughImg) {
    roughCtx.putImageData(roughImg, 0, 0);
    bundle.roughnessMap = createCanvasTexture(roughCanvas, false, maxAnisotropy);
  }

  if (emissiveCanvas && emissiveCtx && emissiveImg) {
    emissiveCtx.putImageData(emissiveImg, 0, 0);
    bundle.emissiveMap = createCanvasTexture(emissiveCanvas, true, maxAnisotropy);
  }

  if (id === 'earth') {
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = width;
    cloudCanvas.height = height;
    const cloudCtx = cloudCanvas.getContext('2d')!;
    const cloudImg = cloudCtx.createImageData(width, height);
    const cData = cloudImg.data;

    for (let py = 0; py < height; py++) {
      const phi = (py / (height - 1)) * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      for (let px = 0; px < width; px++) {
        const theta = (px / width) * Math.PI * 2;
        const nx = sinPhi * Math.cos(theta);
        const ny = cosPhi;
        const nz = sinPhi * Math.sin(theta);
        const idx = (py * width + px) * 4;

        // Swirl domain warp for cyclonic cloud bands
        const warp = fbm3D(nx * 2.8, ny * 3.4, nz * 2.8, 131, 3);
        const swirl = fbm3D(
          nx * 4.4 + (warp - 0.5) * 1.4,
          ny * 5.6,
          nz * 4.4 - (warp - 0.5) * 1.4,
          99,
          5
        );
        const density = Math.max(0, (swirl - 0.48) * 2.65);
        cData[idx] = 248;
        cData[idx + 1] = 252;
        cData[idx + 2] = 255;
        cData[idx + 3] = clampByte(Math.min(1, density) * 232);
      }
    }
    cloudCtx.putImageData(cloudImg, 0, 0);
    bundle.cloudsMap = createCanvasTexture(cloudCanvas, true, maxAnisotropy);
  }

  if (id === 'saturn' || id === 'uranus' || id === 'neptune') {
    bundle.ringMap = createPlanetaryRingTexture(id, maxAnisotropy);
  }

  return bundle;
}

function createPlanetaryRingTexture(
  ringType: 'saturn' | 'uranus' | 'neptune',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const width = 1024;
  const height = 16;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const data = img.data;

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    let r = 220;
    let g = 200;
    let b = 165;
    let alpha = 0;

    if (ringType === 'saturn') {
      const ripple =
        Math.sin(t * 140) * 0.14 +
        Math.sin(t * 310 + 1.2) * 0.08 +
        Math.cos(t * 520) * 0.05;

      if (t > 0.04 && t < 0.22) {
        alpha = (0.14 + ripple * 0.25) * Math.sin(((t - 0.04) / 0.18) * Math.PI);
        r = 168;
        g = 152;
        b = 128;
      } else if (t >= 0.22 && t < 0.56) {
        alpha = 0.74 + ripple * 0.65;
        r = 238 + ripple * 18;
        g = 218 + ripple * 16;
        b = 180 + ripple * 14;
      } else if (t >= 0.56 && t < 0.635) {
        alpha = 0.04;
      } else if (t >= 0.635 && t < 0.89) {
        if (t > 0.812 && t < 0.826) {
          alpha = 0.05;
        } else {
          alpha = 0.56 + ripple * 0.45;
          r = 218 + ripple * 14;
          g = 200 + ripple * 12;
          b = 170 + ripple * 10;
        }
      } else if (t > 0.93 && t < 0.96) {
        alpha = 0.36 * Math.sin(((t - 0.93) / 0.03) * Math.PI);
        r = 228;
        g = 210;
        b = 180;
      }
    } else if (ringType === 'uranus') {
      const band1 = Math.exp(-Math.pow((t - 0.32) / 0.018, 2));
      const band2 = Math.exp(-Math.pow((t - 0.55) / 0.014, 2));
      const band3 = Math.exp(-Math.pow((t - 0.78) / 0.025, 2));
      alpha = (band1 * 0.42 + band2 * 0.35 + band3 * 0.52) * 0.75;
      r = 152;
      g = 210;
      b = 224;
    } else {
      const band1 = Math.exp(-Math.pow((t - 0.45) / 0.03, 2));
      const band2 = Math.exp(-Math.pow((t - 0.76) / 0.02, 2));
      alpha = (band1 * 0.25 + band2 * 0.32) * 0.65;
      r = 120;
      g = 164;
      b = 232;
    }

    const clampedA = clampByte(Math.max(0, Math.min(1, alpha)) * 255);
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = clampByte(r);
      data[idx + 1] = clampByte(g);
      data[idx + 2] = clampByte(b);
      data[idx + 3] = clampedA;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createRadialRingGeometry(
  innerRadius: number,
  outerRadius: number,
  thetaSegments = 144
): THREE.RingGeometry {
  const geom = new THREE.RingGeometry(innerRadius, outerRadius, thetaSegments, 1);
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  const v3 = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const radius = v3.length();
    const u = (radius - innerRadius) / (outerRadius - innerRadius);
    const angle = (Math.atan2(v3.y, v3.x) + Math.PI) / (Math.PI * 2);
    uv.setXY(i, u, angle);
  }
  uv.needsUpdate = true;
  return geom;
}

export function createAtmosphereMaterial(
  colorHex: string,
  intensity = 0.78
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: intensity },
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: `
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform vec3 uSunPosition;
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 sunDir = normalize(uSunPosition - vWorldPos);
        // BackSide outer shell hugs tightly to blend seamlessly from surface Fresnel scatter
        float ndotv = dot(vNormalWorld, viewDir);
        float rim = pow(clamp(0.68 - ndotv, 0.0, 1.0), 4.0);
        float horizonFade = smoothstep(-0.78, -0.04, ndotv);
        float daySide = smoothstep(-0.26, 0.52, dot(vNormalWorld, sunDir));
        float alpha = rim * horizonFade * uIntensity * (0.10 + 0.90 * daySide);
        gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.85));
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export function createSunPhotosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRedGiant: { value: 0 },
      uFlash: { value: 0 },
      uRemnant: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uRedGiant;
      uniform float uFlash;
      uniform float uRemnant;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPos;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.06 + vec3(1.7, 9.2, 4.1);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vPosition);
        float t = uTime * mix(0.18, 0.32, uRedGiant);
        float macroScale = mix(5.6, 3.0, uRedGiant);
        float n1 = fbm(dir * macroScale + vec3(t, -t * 0.6, t * 0.4));
        float n2 = fbm(dir * mix(16.0, 10.5, uRedGiant) + vec3(-t * 0.8, t * 0.5, n1 * 2.2));
        float granScaleA = mix(42.0, 22.0, uRedGiant);
        float granScaleB = mix(76.0, 44.0, uRedGiant);
        float granA = abs(noise(dir * granScaleA + vec3(t * 1.1, -t * 0.7, 0.0)) - 0.5) * 2.0;
        float granB = abs(noise(dir * granScaleB - vec3(0.0, t * 0.9, t * 0.6)) - 0.5) * 2.0;
        float cells = 1.0 - clamp(granA * 0.62 + granB * 0.38, 0.0, 1.0);
        float plasma = clamp(n1 * 0.46 + n2 * 0.34 + cells * 0.24, 0.0, 1.0);

        float umbra = smoothstep(0.24, 0.14, n1);
        float penumbra = smoothstep(0.32, 0.21, n1) * (1.0 - umbra);
        float plage = smoothstep(0.74, 0.90, n1);

        vec3 coreWhite = mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.62, 0.18), uRedGiant);
        vec3 goldenPlasma = mix(vec3(1.0, 0.66, 0.16), vec3(0.96, 0.24, 0.03), uRedGiant);
        vec3 fieryOrange = mix(vec3(0.90, 0.29, 0.04), vec3(0.46, 0.03, 0.005), uRedGiant);
        vec3 sunspot = mix(vec3(0.24, 0.04, 0.01), vec3(0.16, 0.01, 0.002), uRedGiant);

        vec3 col = mix(fieryOrange, goldenPlasma, smoothstep(0.26, 0.62, plasma));
        col = mix(col, coreWhite, smoothstep(0.64, 0.92, plasma));
        col = mix(col, mix(vec3(1.0, 0.92, 0.72), vec3(1.0, 0.50, 0.12), uRedGiant), plage * 0.35);
        col = mix(col, vec3(0.62, 0.22, 0.05), penumbra * 0.55);
        col = mix(col, sunspot, umbra * 0.82);

        // Pre-explosion fracture flash & super-hot White Dwarf remnant
        float cracks = smoothstep(0.42, 0.68, plasma);
        col = mix(col, vec3(1.0, 0.95, 0.86) * 2.2, uFlash * (0.45 + 0.55 * cracks));
        vec3 whiteDwarf = mix(vec3(0.55, 0.84, 1.0), vec3(0.96, 0.99, 1.0), plasma);
        col = mix(col, whiteDwarf * 1.9, uRemnant);

        vec3 viewDir = normalize(vViewPos);
        float ndotv = max(0.0, dot(normalize(vNormal), viewDir));
        float limb = pow(ndotv, mix(0.42, 0.68, uRedGiant));
        col *= (0.50 + 0.70 * limb);

        gl_FragColor = vec4(col * mix(1.15, 1.28, uRedGiant), 1.0);
      }
    `,
  });
}

export function createSunCoronaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRedGiant: { value: 0 },
      uFlash: { value: 0 },
      uRemnant: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uRedGiant;
      uniform float uFlash;
      uniform float uRemnant;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float inward = clamp(-dot(vNormal, viewDir), 0.0, 1.0);
        float intensity = pow(inward, mix(3.6, 2.5, uRedGiant));
        float shimmer = 0.92 + 0.08 * sin(uTime * 1.4);
        vec3 outerGlow = mix(vec3(0.95, 0.34, 0.04), vec3(0.85, 0.06, 0.01), uRedGiant);
        vec3 innerGlow = mix(vec3(1.0, 0.78, 0.32), vec3(1.0, 0.38, 0.06), uRedGiant);
        vec3 glowCol = mix(outerGlow, innerGlow, pow(inward, 1.5));
        glowCol = mix(glowCol, vec3(1.0, 0.94, 0.85), uFlash * 0.7);
        glowCol = mix(glowCol, vec3(0.55, 0.88, 1.0), uRemnant);
        gl_FragColor = vec4(glowCol, intensity * mix(0.78, 0.92, uRedGiant) * shimmer);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export function createExplosionShockwaveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBlast: { value: 0 },
      uAlpha: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uBlast;
      varying vec3 vDir;
      varying vec3 vNormalV;
      varying vec3 vViewPos;

      float h3v(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float n3v(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(h3v(i + vec3(0,0,0)), h3v(i + vec3(1,0,0)), f.x),
              mix(h3v(i + vec3(0,1,0)), h3v(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(h3v(i + vec3(0,0,1)), h3v(i + vec3(1,0,1)), f.x),
              mix(h3v(i + vec3(0,1,1)), h3v(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        vec3 dir = normalize(position);
        vDir = dir;
        // Billowing Rayleigh-Taylor breakout bubbles along polar axis
        float billow = n3v(dir * 3.8 + vec3(uTime * 0.25, -uBlast * 2.4, uTime * 0.18));
        float asym = 1.0 + 0.32 * max(0.0, dir.y) + 0.16 * billow;
        vec3 displaced = position * asym;
        vNormalV = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBlast;
      uniform float uAlpha;
      varying vec3 vDir;
      varying vec3 vNormalV;
      varying vec3 vViewPos;

      float h3(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float n3(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(h3(i + vec3(0,0,0)), h3(i + vec3(1,0,0)), f.x),
              mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x),
              mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * n3(p);
          p = p * 2.14 + vec3(2.3, 5.1, 1.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 viewDir = normalize(vViewPos);
        float ndotv = abs(dot(normalize(vNormalV), viewDir));
        float shellRim = pow(1.0 - ndotv, 1.35) * 0.72 + 0.28;
        float filA = fbm(vDir * 5.2 + vec3(uTime * 0.22, -uTime * 0.26, uBlast * 2.4));
        float filB = fbm(vDir * 11.0 - vec3(uTime * 0.16, uTime * 0.20, filA * 1.5));
        float shock = smoothstep(0.22, 0.80, filA * 0.65 + filB * 0.35);

        vec3 whiteHot = vec3(1.0, 0.96, 0.84);
        vec3 moltenOrange = vec3(1.0, 0.44, 0.08);
        vec3 deepCrimson = vec3(0.68, 0.06, 0.02);

        vec3 col = mix(deepCrimson, moltenOrange, shock);
        col = mix(col, whiteHot, smoothstep(0.58, 0.92, filA) * (1.0 - uBlast * 0.55));
        col = mix(whiteHot * 1.5, col, smoothstep(0.0, 0.16, uBlast));

        float polarBoost = 0.55 + 0.45 * abs(vDir.y);
        float a = shellRim * (0.28 + 0.85 * shock) * polarBoost * uAlpha;
        gl_FragColor = vec4(col * 1.7, clamp(a, 0.0, 0.94));
      }
    `,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export function createSupernovaDiskMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBlast: { value: 0 },
      uAlpha: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBlast;
      uniform float uAlpha;
      varying vec2 vUv;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
          mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm2(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p = p * 2.08 + vec2(4.2, 1.9);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float r = length(centered);
        if (r > 1.0) discard;

        float angle = atan(centered.y, centered.x);
        float swirl = fbm2(centered * 4.5 + vec2(cos(angle) * 0.6 - uTime * 0.08, sin(angle) * 0.6 + uBlast * 1.4));
        float fineDust = fbm2(centered * 10.5 - vec2(uTime * 0.06, -uTime * 0.05));
        float density = smoothstep(0.18, 0.85, swirl * 0.68 + fineDust * 0.32);

        // Soft feathered circumstellar torus/disk profile glowing hottest near the central breakout
        float outerMask = smoothstep(1.0, 0.42, r);
        float innerGlow = exp(-r * 3.8);
        float midCloud = smoothstep(0.05, 0.30, r) * outerMask;

        vec3 crimsonOuter = vec3(0.56, 0.04, 0.015);
        vec3 fieryAmber = vec3(0.98, 0.34, 0.04);
        vec3 breakoutWhite = vec3(1.0, 0.90, 0.68);

        vec3 col = mix(crimsonOuter, fieryAmber, clamp(density * 0.72 + innerGlow * 1.15, 0.0, 1.0));
        col = mix(col, breakoutWhite, clamp(innerGlow * (1.25 - uBlast * 0.45), 0.0, 1.0));

        float alpha = (midCloud * (0.48 + 0.52 * density) + innerGlow * 0.85) * outerMask * uAlpha;
        gl_FragColor = vec4(col * 1.45, clamp(alpha, 0.0, 0.94));
      }
    `,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export function createSupernovaJetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBlast: { value: 0 },
      uAlpha: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uBlast;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewPos;

      float h3j(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float n3j(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(h3j(i + vec3(0,0,0)), h3j(i + vec3(1,0,0)), f.x),
              mix(h3j(i + vec3(0,1,0)), h3j(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(h3j(i + vec3(0,0,1)), h3j(i + vec3(1,0,1)), f.x),
              mix(h3j(i + vec3(0,1,1)), h3j(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        vec3 dir = normalize(position);
        float turb = n3j(dir * 3.6 + vec3(0.0, -uTime * 0.55 - uBlast * 3.2, uTime * 0.25));
        // Billowing olive/mushroom lobe breakout profile
        vec3 displaced = position + dir * (turb * 0.36);
        vPos = dir;
        vNormalV = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBlast;
      uniform float uAlpha;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewPos;

      float h3f(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float n3f(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(h3f(i + vec3(0,0,0)), h3f(i + vec3(1,0,0)), f.x),
              mix(h3f(i + vec3(0,1,0)), h3f(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(h3f(i + vec3(0,0,1)), h3f(i + vec3(1,0,1)), f.x),
              mix(h3f(i + vec3(0,1,1)), h3f(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }
      float fbm3(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * n3f(p);
          p = p * 2.1 + vec3(1.7, 3.9, 2.5);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        float facing = abs(dot(normalize(vNormalV), normalize(vViewPos)));
        float billow = fbm3(vPos * 4.2 + vec3(uTime * 0.25, -uTime * 0.45, uBlast * 3.0));
        float hotSpots = smoothstep(0.28, 0.82, billow);

        vec3 whiteIncandescent = vec3(1.0, 0.98, 0.88);
        vec3 fieryOrange = vec3(1.0, 0.44, 0.06);
        vec3 deepRed = vec3(0.76, 0.08, 0.02);

        vec3 col = mix(deepRed, fieryOrange, hotSpots);
        col = mix(col, whiteIncandescent, smoothstep(0.45, 0.88, hotSpots * 0.7 + facing * 0.45));

        float softEdge = pow(facing, 1.15);
        float alpha = softEdge * (0.38 + 0.72 * hotSpots) * uAlpha;
        gl_FragColor = vec4(col * 1.9, clamp(alpha, 0.0, 0.96));
      }
    `,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

export interface ExplosionEjectaHandle {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  dispose: () => void;
}

export function createExplosionEjectaSystem(count = 2400): ExplosionEjectaHandle {
  const dirs = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  const palette = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#fff2cc'),
    new THREE.Color('#ffaa44'),
    new THREE.Color('#ff5514'),
    new THREE.Color('#d92408'),
  ];

  for (let i = 0; i < count; i++) {
    const theta = hash1D(i * 7 + 1, 91) * Math.PI * 2;
    // Slightly favor equatorial disk + polar breakout axis for fiery debris distribution
    const u = hash1D(i * 7 + 2, 91);
    const phi = i % 3 === 0
      ? Math.PI * 0.5 + (u - 0.5) * 0.35
      : Math.acos(2 * u - 1);
    const r = 6 + hash1D(i * 7 + 3, 91) * 14;
    dirs[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    dirs[i * 3 + 1] = Math.cos(phi) * r;
    dirs[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;

    speeds[i] = 1.0 + Math.pow(hash1D(i * 7 + 4, 91), 0.7) * 3.0;
    sizes[i] = 2.2 + Math.pow(hash1D(i * 7 + 5, 91), 1.8) * 6.8;

    const col = palette[Math.floor(hash1D(i * 7 + 6, 91) * palette.length)];
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(dirs, 3));
  geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBlast: { value: 0 },
      uAlpha: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSpeed;
      attribute float aSize;
      uniform float uBlast;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec3 pos = position * (1.0 + uBlast * 13.5 * aSpeed);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uPixelRatio * (340.0 / max(18.0, -mv.z)), 1.5, 16.0);
      }
    `,
    fragmentShader: `
      uniform float uAlpha;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float glow = exp(-d * d * 13.0);
        gl_FragColor = vec4(vColor * 1.5, glow * uAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geom, material);
  points.frustumCulled = false;

  return {
    points,
    material,
    dispose() {
      geom.dispose();
      material.dispose();
    },
  };
}

export function createSupernovaBurstTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;

  // Blinding warm white-gold breakout core flare
  const rad = ctx.createRadialGradient(half, half, 4, half, half, half);
  rad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  rad.addColorStop(0.14, 'rgba(255, 232, 180, 0.94)');
  rad.addColorStop(0.36, 'rgba(255, 128, 36, 0.45)');
  rad.addColorStop(0.66, 'rgba(185, 28, 8, 0.12)');
  rad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSunHaloTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 12, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255, 245, 210, 0.92)');
  grad.addColorStop(0.22, 'rgba(255, 186, 74, 0.55)');
  grad.addColorStop(0.5, 'rgba(245, 112, 24, 0.16)');
  grad.addColorStop(0.8, 'rgba(180, 56, 12, 0.03)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
