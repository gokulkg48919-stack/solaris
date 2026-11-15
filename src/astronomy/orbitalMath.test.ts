import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHorizonsVectors } from './horizonsParser';
import {
  AU_IN_KM,
  computeOsculatingOrbitPoints,
  eclipticKmToThreePosition,
  interpolateStateVector,
  kmToSceneRadius,
} from './orbitalMath';

const SAMPLE_HORIZONS_TEXT = `
*******************************************************************************
Target body name: Earth (399)                     {source: DE441}
*******************************************************************************
$$SOE
2461359.083333333 = A.D. 2026-Nov-14 14:00:00.0000 TDB
 X = 9.145505688274294E+07 Y = 1.163783116194199E+08 Z =-7.506641027674079E+03
 VX=-2.391646894461633E+01 VY= 1.829006211386973E+01 VZ=-1.873044920291278E-03
2461359.333333333 = A.D. 2026-Nov-14 20:00:00.0000 TDB
 X = 9.093759204725181E+07 Y = 1.167722580018729E+08 Z =-7.547368101470172E+03
 VX=-2.399686262556195E+01 VY= 1.818639563436781E+01 VZ=-1.897575070750612E-03
2461359.583333333 = A.D. 2026-Nov-15 02:00:00.0000 TDB
 X = 9.041839584005700E+07 Y = 1.171639613676978E+08 Z =-7.588598467223346E+03
 VX=-2.407678092773406E+01 VY= 1.808237594286180E+01 VZ=-1.919632600784205E-03
$$EOE
`;

test('parseHorizonsVectors extracts exact X,Y,Z and VX,VY,VZ samples', () => {
  const samples = parseHorizonsVectors(SAMPLE_HORIZONS_TEXT);
  assert.equal(samples.length, 3);
  assert.equal(samples[0].timestampMs, Date.UTC(2026, 10, 14, 14, 0, 0));
  assert.ok(Math.abs(samples[0].x - 9.145505688274294e7) < 1e-4);
  assert.ok(Math.abs(samples[0].vy - 18.29006211386973) < 1e-8);
});

test('interpolateStateVector accurately reproduces midpoint Horizons sample via cubic Hermite', () => {
  const samples = parseHorizonsVectors(SAMPLE_HORIZONS_TEXT);
  const endpointsOnly = [samples[0], samples[2]];
  const actualMid = samples[1];

  const interp = interpolateStateVector(endpointsOnly, actualMid.timestampMs);
  assert.ok(interp);

  // Over a 12-hour arc, Hermite interpolation using velocity vectors should match DE441 midpoint within < 5 km
  const posErrKm = Math.hypot(
    interp.x - actualMid.x,
    interp.y - actualMid.y,
    interp.z - actualMid.z
  );
  assert.ok(posErrKm < 5, `Expected Hermite position error < 5 km, got ${posErrKm} km`);
  assert.ok(interp.distanceAU > 0.98 && interp.distanceAU < 1.02);
  assert.ok(interp.speedKms > 29 && interp.speedKms < 31);
});

test('eclipticKmToThreePosition preserves right-handed counter-clockwise prograde frame & monotonic scaling', () => {
  const mercuryR = kmToSceneRadius(0.39 * AU_IN_KM);
  const earthR = kmToSceneRadius(1.0 * AU_IN_KM);
  const neptuneR = kmToSceneRadius(30.05 * AU_IN_KM);

  assert.ok(mercuryR < earthR && earthR < neptuneR);

  // +X ecliptic maps to +X Three.js, +Y ecliptic maps to -Z Three.js, +Z ecliptic maps to +Y Three.js
  const p = eclipticKmToThreePosition(0, AU_IN_KM, 0);
  assert.ok(Math.abs(p.x) < 1e-6);
  assert.ok(Math.abs(p.y) < 1e-6);
  assert.ok(p.z < -40);
});

test('computeOsculatingOrbitPoints produces closed ellipse passing through current planet position', () => {
  const samples = parseHorizonsVectors(SAMPLE_HORIZONS_TEXT);
  const state = interpolateStateVector(samples, samples[0].timestampMs)!;
  const planetPos = eclipticKmToThreePosition(state.x, state.y, state.z);
  const orbitPts = computeOsculatingOrbitPoints(state, 180);

  assert.equal(orbitPts.length, 181);
  // Minimum distance from any vertex of the osculating orbit to the planet's live position should be near 0
  let minDist = Infinity;
  for (const pt of orbitPts) {
    const d = Math.hypot(pt.x - planetPos.x, pt.y - planetPos.y, pt.z - planetPos.z);
    if (d < minDist) minDist = d;
  }
  assert.ok(minDist < 1.5, `Expected orbit curve to pass near live planet position, minDist=${minDist}`);
});
