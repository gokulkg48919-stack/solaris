export interface PlanetaryMoonSpec {
  id: string;
  name: string;
  horizonsId?: string;
  radiusVisual: number;
  orbitVisualRadius: number;
  orbitalPeriodDays: number;
  color: string;
  diameterKm: number;
}

export interface SolarSystemBodySpec {
  id: string;
  horizonsId: string;
  name: string;
  category: 'Star' | 'Terrestrial Planet' | 'Gas Giant' | 'Ice Giant' | 'Natural Satellite';
  parentBodyId?: string;
  orbitColor: string;
  radiusVisual: number;
  diameterKm: number;
  massKg: string;
  gravityMs2: number;
  meanTempC: number;
  orbitalPeriodDays: number;
  rotationPeriodHours: number;
  axialTiltDeg: number;
  moonsCount: number;
  summary: string;
  hasRings?: boolean;
  ringType?: 'saturn' | 'uranus' | 'neptune';
  hasAtmosphere?: boolean;
  atmosphereColor?: string;
  hasClouds?: boolean;
  moons?: PlanetaryMoonSpec[];
}

export const SOLAR_SYSTEM_BODIES: SolarSystemBodySpec[] = [
  {
    id: 'sun',
    horizonsId: '10',
    name: 'Sun',
    category: 'Star',
    orbitColor: '#f59e0b',
    radiusVisual: 5.5,
    diameterKm: 1_392_700,
    massKg: '1.9885 × 10³⁰ kg',
    gravityMs2: 274.0,
    meanTempC: 5505,
    orbitalPeriodDays: 0,
    rotationPeriodHours: 609.12,
    axialTiltDeg: 7.25,
    moonsCount: 0,
    summary:
      'G2V main-sequence star containing 99.86% of the Solar System’s mass, anchoring planetary orbits at the ICRF heliocentric origin.',
  },
  {
    id: 'mercury',
    horizonsId: '199',
    name: 'Mercury',
    category: 'Terrestrial Planet',
    orbitColor: '#9ca3af',
    radiusVisual: 0.62,
    diameterKm: 4_879,
    massKg: '3.301 × 10²³ kg',
    gravityMs2: 3.7,
    meanTempC: 167,
    orbitalPeriodDays: 87.97,
    rotationPeriodHours: 1407.6,
    axialTiltDeg: 0.03,
    moonsCount: 0,
    summary:
      'Innermost rocky planet with a cratered silicate crust and large metallic core, completing one orbit every 88 Earth days.',
  },
  {
    id: 'venus',
    horizonsId: '299',
    name: 'Venus',
    category: 'Terrestrial Planet',
    orbitColor: '#e5b869',
    radiusVisual: 0.96,
    diameterKm: 12_104,
    massKg: '4.867 × 10²⁴ kg',
    gravityMs2: 8.87,
    meanTempC: 464,
    orbitalPeriodDays: 224.7,
    rotationPeriodHours: -5832.5,
    axialTiltDeg: 177.36,
    moonsCount: 0,
    hasAtmosphere: true,
    atmosphereColor: '#f3c168',
    summary:
      'Second planet from the Sun, wrapped in dense sulfuric acid clouds and a supercritical CO₂ greenhouse atmosphere.',
  },
  {
    id: 'earth',
    horizonsId: '399',
    name: 'Earth',
    category: 'Terrestrial Planet',
    orbitColor: '#3b82f6',
    radiusVisual: 1.05,
    diameterKm: 12_742,
    massKg: '5.972 × 10²⁴ kg',
    gravityMs2: 9.81,
    meanTempC: 15,
    orbitalPeriodDays: 365.256,
    rotationPeriodHours: 23.934,
    axialTiltDeg: 23.44,
    moonsCount: 1,
    hasAtmosphere: true,
    atmosphereColor: '#56a8ff',
    hasClouds: true,
    summary:
      'Ocean-bearing terrestrial planet with active plate tectonics, a nitrogen-oxygen atmosphere, and one large natural satellite.',
    moons: [
      {
        id: 'moon',
        name: 'Moon',
        horizonsId: '301',
        radiusVisual: 0.28,
        orbitVisualRadius: 2.6,
        orbitalPeriodDays: 27.32,
        color: '#cbd5e1',
        diameterKm: 3_474.8,
      },
    ],
  },
  {
    id: 'mars',
    horizonsId: '499',
    name: 'Mars',
    category: 'Terrestrial Planet',
    orbitColor: '#d96b43',
    radiusVisual: 0.74,
    diameterKm: 6_779,
    massKg: '6.417 × 10²³ kg',
    gravityMs2: 3.72,
    meanTempC: -65,
    orbitalPeriodDays: 686.98,
    rotationPeriodHours: 24.623,
    axialTiltDeg: 25.19,
    moonsCount: 2,
    hasAtmosphere: true,
    atmosphereColor: '#e07a54',
    summary:
      'Fourth terrestrial planet characterized by iron-oxide regolith, shield volcanoes, polar ice caps, and two small moons.',
    moons: [
      {
        id: 'phobos',
        name: 'Phobos',
        radiusVisual: 0.11,
        orbitVisualRadius: 1.45,
        orbitalPeriodDays: 0.319,
        color: '#a89f96',
        diameterKm: 22.5,
      },
      {
        id: 'deimos',
        name: 'Deimos',
        radiusVisual: 0.08,
        orbitVisualRadius: 1.9,
        orbitalPeriodDays: 1.263,
        color: '#9c9288',
        diameterKm: 12.4,
      },
    ],
  },
  {
    id: 'jupiter',
    horizonsId: '599',
    name: 'Jupiter',
    category: 'Gas Giant',
    orbitColor: '#d49a6a',
    radiusVisual: 2.85,
    diameterKm: 139_820,
    massKg: '1.898 × 10²⁷ kg',
    gravityMs2: 24.79,
    meanTempC: -110,
    orbitalPeriodDays: 4_332.59,
    rotationPeriodHours: 9.925,
    axialTiltDeg: 3.13,
    moonsCount: 95,
    hasAtmosphere: true,
    atmosphereColor: '#deb084',
    summary:
      'Largest planet in the Solar System, banded by counter-flowing ammonia clouds, the Great Red Spot, and the Galilean satellites.',
    moons: [
      { id: 'io', name: 'Io', radiusVisual: 0.2, orbitVisualRadius: 4.1, orbitalPeriodDays: 1.769, color: '#eab308', diameterKm: 3_643 },
      { id: 'europa', name: 'Europa', radiusVisual: 0.18, orbitVisualRadius: 4.9, orbitalPeriodDays: 3.551, color: '#e2e8f0', diameterKm: 3_122 },
      { id: 'ganymede', name: 'Ganymede', radiusVisual: 0.27, orbitVisualRadius: 5.9, orbitalPeriodDays: 7.155, color: '#94a3b8', diameterKm: 5_268 },
      { id: 'callisto', name: 'Callisto', radiusVisual: 0.24, orbitVisualRadius: 7.0, orbitalPeriodDays: 16.689, color: '#78716c', diameterKm: 4_821 },
    ],
  },
  {
    id: 'saturn',
    horizonsId: '699',
    name: 'Saturn',
    category: 'Gas Giant',
    orbitColor: '#e2c588',
    radiusVisual: 2.4,
    diameterKm: 116_460,
    massKg: '5.683 × 10²⁶ kg',
    gravityMs2: 10.44,
    meanTempC: -140,
    orbitalPeriodDays: 10_759.22,
    rotationPeriodHours: 10.656,
    axialTiltDeg: 26.73,
    moonsCount: 146,
    hasRings: true,
    ringType: 'saturn',
    hasAtmosphere: true,
    atmosphereColor: '#e6cf98',
    summary:
      'Gas giant encircled by an expansive system of water-ice rings divided by the Cassini Division, orbited by Titan and Enceladus.',
    moons: [
      { id: 'enceladus', name: 'Enceladus', radiusVisual: 0.12, orbitVisualRadius: 6.4, orbitalPeriodDays: 1.37, color: '#f1f5f9', diameterKm: 504 },
      { id: 'titan', name: 'Titan', radiusVisual: 0.27, orbitVisualRadius: 7.5, orbitalPeriodDays: 15.945, color: '#f59e0b', diameterKm: 5_150 },
    ],
  },
  {
    id: 'uranus',
    horizonsId: '799',
    name: 'Uranus',
    category: 'Ice Giant',
    orbitColor: '#67e8f9',
    radiusVisual: 1.62,
    diameterKm: 50_724,
    massKg: '8.681 × 10²⁵ kg',
    gravityMs2: 8.69,
    meanTempC: -195,
    orbitalPeriodDays: 30_688.5,
    rotationPeriodHours: -17.24,
    axialTiltDeg: 97.77,
    moonsCount: 28,
    hasRings: true,
    ringType: 'uranus',
    hasAtmosphere: true,
    atmosphereColor: '#7dd3fc',
    summary:
      'Pale cyan ice giant tilted 97.77° onto its orbital plane, surrounded by narrow vertical rings and 28 known moons.',
    moons: [
      { id: 'titania', name: 'Titania', radiusVisual: 0.14, orbitVisualRadius: 3.6, orbitalPeriodDays: 8.706, color: '#cbd5e1', diameterKm: 1_577 },
    ],
  },
  {
    id: 'neptune',
    horizonsId: '899',
    name: 'Neptune',
    category: 'Ice Giant',
    orbitColor: '#3b82f6',
    radiusVisual: 1.56,
    diameterKm: 49_244,
    massKg: '1.024 × 10²⁶ kg',
    gravityMs2: 11.15,
    meanTempC: -200,
    orbitalPeriodDays: 60_195.0,
    rotationPeriodHours: 16.11,
    axialTiltDeg: 28.32,
    moonsCount: 16,
    hasRings: true,
    ringType: 'neptune',
    hasAtmosphere: true,
    atmosphereColor: '#4f8df6',
    summary:
      'Outermost major planet of the Solar System, swept by supersonic methane winds and orbited retrograde by nitrogen-geyser moon Triton.',
    moons: [
      { id: 'triton', name: 'Triton', radiusVisual: 0.19, orbitVisualRadius: 3.5, orbitalPeriodDays: -5.877, color: '#cbd5e1', diameterKm: 2_707 },
    ],
  },
];

export const MOON_BODY_SPEC: SolarSystemBodySpec = {
  id: 'moon',
  horizonsId: '301',
  name: 'Moon',
  category: 'Natural Satellite',
  parentBodyId: 'earth',
  orbitColor: '#94a3b8',
  radiusVisual: 0.28,
  diameterKm: 3_474.8,
  massKg: '7.342 × 10²² kg',
  gravityMs2: 1.62,
  meanTempC: -23,
  orbitalPeriodDays: 27.322,
  rotationPeriodHours: 655.72,
  axialTiltDeg: 6.68,
  moonsCount: 0,
  summary:
    'Earth’s sole natural satellite, tracked independently via JPL Horizons target ID 301 relative to Earth (500@399).',
};

export const ALL_INSPECTABLE_BODIES: SolarSystemBodySpec[] = [
  ...SOLAR_SYSTEM_BODIES,
  MOON_BODY_SPEC,
];

export function getBodySpecById(id: string): SolarSystemBodySpec | undefined {
  return ALL_INSPECTABLE_BODIES.find((b) => b.id === id);
}
