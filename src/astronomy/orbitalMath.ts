import { EphemerisSample } from './horizonsParser';

export const AU_IN_KM = 149_597_870.7;
export const MU_SUN_KM3_S2 = 1.32712440018e11;

export interface StateVector {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  distanceKm: number;
  distanceAU: number;
  speedKms: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Cubic Hermite interpolation between two ephemeris samples using exact
 * position (km) and velocity (km/s) vectors from JPL Horizons VEC_TABLE=2.
 */
export function interpolateStateVector(
  samples: EphemerisSample[],
  targetTimeMs: number
): StateVector | null {
  if (samples.length === 0) return null;
  if (samples.length === 1) {
    return sampleToState(samples[0]);
  }

  if (targetTimeMs <= samples[0].timestampMs) {
    return sampleToState(samples[0]);
  }
  const last = samples[samples.length - 1];
  if (targetTimeMs >= last.timestampMs) {
    return sampleToState(last);
  }

  // Binary search for bracketing interval [lo, lo + 1]
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].timestampMs <= targetTimeMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const s0 = samples[lo];
  const s1 = samples[lo + 1];
  const dtSec = (s1.timestampMs - s0.timestampMs) / 1000;
  if (dtSec <= 0) return sampleToState(s0);

  const t = (targetTimeMs - s0.timestampMs) / (s1.timestampMs - s0.timestampMs);
  const t2 = t * t;
  const t3 = t2 * t;

  // Hermite position basis
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const x = h00 * s0.x + h10 * dtSec * s0.vx + h01 * s1.x + h11 * dtSec * s1.vx;
  const y = h00 * s0.y + h10 * dtSec * s0.vy + h01 * s1.y + h11 * dtSec * s1.vy;
  const z = h00 * s0.z + h10 * dtSec * s0.vz + h01 * s1.z + h11 * dtSec * s1.vz;

  // Hermite velocity basis (derivative wrt t, divided by dtSec)
  const dh00 = (6 * t2 - 6 * t) / dtSec;
  const dh10 = 3 * t2 - 4 * t + 1;
  const dh01 = (-6 * t2 + 6 * t) / dtSec;
  const dh11 = 3 * t2 - 2 * t;

  const vx = dh00 * s0.x + dh10 * s0.vx + dh01 * s1.x + dh11 * s1.vx;
  const vy = dh00 * s0.y + dh10 * s0.vy + dh01 * s1.y + dh11 * s1.vy;
  const vz = dh00 * s0.z + dh10 * s0.vz + dh01 * s1.z + dh11 * s1.vz;

  const distanceKm = Math.hypot(x, y, z);
  const speedKms = Math.hypot(vx, vy, vz);

  return {
    x,
    y,
    z,
    vx,
    vy,
    vz,
    distanceKm,
    distanceAU: distanceKm / AU_IN_KM,
    speedKms,
  };
}

function sampleToState(s: EphemerisSample): StateVector {
  const distanceKm = Math.hypot(s.x, s.y, s.z);
  return {
    x: s.x,
    y: s.y,
    z: s.z,
    vx: s.vx,
    vy: s.vy,
    vz: s.vz,
    distanceKm,
    distanceAU: distanceKm / AU_IN_KM,
    speedKms: Math.hypot(s.vx, s.vy, s.vz),
  };
}

/**
 * Documented astronomical rendering transformation:
 * Preserves the exact ICRF Ecliptic unit direction vector (X, Y, Z) -> Three.js (X, Z, -Y)
 * while compressing radial AU distances via a monotonic power-law so inner terrestrial worlds
 * and outer ice giants remain simultaneously navigable in WebGL without losing relative order.
 *
 * R_scene(AU) = 16 + 34 * (AU ^ 0.52)
 */
export function kmToSceneRadius(distanceKm: number): number {
  if (distanceKm <= 1000) return 0;
  const au = distanceKm / AU_IN_KM;
  return 16 + 34 * Math.pow(au, 0.52);
}

/**
 * Converts ICRF Ecliptic coordinates (km) to Three.js right-handed Y-up scene coordinates:
 * X_three = X_ecl, Y_three = Z_ecl (North Ecliptic Pole up), Z_three = -Y_ecl (counter-clockwise prograde).
 */
export function eclipticKmToThreePosition(xKm: number, yKm: number, zKm: number): Vec3 {
  const rKm = Math.hypot(xKm, yKm, zKm);
  if (rKm < 1000) {
    return { x: 0, y: 0, z: 0 };
  }
  const sceneR = kmToSceneRadius(rKm);
  const scale = sceneR / rKm;
  return {
    x: xKm * scale,
    y: zKm * scale,
    z: -yKm * scale,
  };
}

/**
 * Converts a geocentric vector (Moon relative to Earth in km) into Three.js direction
 * scaled around Earth's visual sphere so the Moon orbits cleanly outside Earth's surface.
 */
export function moonGeocentricToThreeOffset(
  xKm: number,
  yKm: number,
  zKm: number,
  orbitVisualRadius = 3.2
): Vec3 {
  const rKm = Math.hypot(xKm, yKm, zKm);
  if (rKm < 1) return { x: orbitVisualRadius, y: 0, z: 0 };
  const s = orbitVisualRadius / rKm;
  return {
    x: xKm * s,
    y: zKm * s,
    z: -yKm * s,
  };
}

/**
 * Reconstructs the osculating Keplerian orbit ellipse in Three.js scene space
 * directly from a real JPL Horizons state vector (position km, velocity km/s).
 * Guarantees the rendered orbit line passes through the planet's live position.
 */
export function computeOsculatingOrbitPoints(
  state: Pick<StateVector, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz'>,
  segments = 192
): Vec3[] {
  const rx = state.x;
  const ry = state.y;
  const rz = state.z;
  const vx = state.vx;
  const vy = state.vy;
  const vz = state.vz;

  const rMag = Math.hypot(rx, ry, rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  if (rMag < 1000 || v2 === 0) return [];

  // Angular momentum h = r x v
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const hMag = Math.hypot(hx, hy, hz);
  if (hMag === 0) return [];

  // Eccentricity vector e = (v x h) / mu - r / |r|
  const vxhX = vy * hz - vz * hy;
  const vxhY = vz * hx - vx * hz;
  const vxhZ = vx * hy - vy * hx;

  const ex = vxhX / MU_SUN_KM3_S2 - rx / rMag;
  const ey = vxhY / MU_SUN_KM3_S2 - ry / rMag;
  const ez = vxhZ / MU_SUN_KM3_S2 - rz / rMag;
  const e = Math.hypot(ex, ey, ez);

  // Specific mechanical energy & semi-latus rectum p = h^2 / mu
  const p = (hMag * hMag) / MU_SUN_KM3_S2;

  // Construct orbital plane basis (P toward periapsis, Q perpendicular in orbit plane)
  let px: number;
  let py: number;
  let pz: number;
  if (e > 1e-6) {
    px = ex / e;
    py = ey / e;
    pz = ez / e;
  } else {
    px = rx / rMag;
    py = ry / rMag;
    pz = rz / rMag;
  }

  // hHat = h / |h|
  const hHatX = hx / hMag;
  const hHatY = hy / hMag;
  const hHatZ = hz / hMag;

  // Q = hHat x P
  const qx = hHatY * pz - hHatZ * py;
  const qy = hHatZ * px - hHatX * pz;
  const qz = hHatX * py - hHatY * px;

  const effectiveE = Math.min(e, 0.95);
  const points: Vec3[] = [];

  for (let i = 0; i <= segments; i++) {
    const nu = (i / segments) * Math.PI * 2;
    const cosNu = Math.cos(nu);
    const sinNu = Math.sin(nu);
    const rOrb = p / (1 + effectiveE * cosNu);

    const eclX = rOrb * (cosNu * px + sinNu * qx);
    const eclY = rOrb * (cosNu * py + sinNu * qy);
    const eclZ = rOrb * (cosNu * pz + sinNu * qz);

    points.push(eclipticKmToThreePosition(eclX, eclY, eclZ));
  }

  return points;
}
