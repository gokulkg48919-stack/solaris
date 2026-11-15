/**
 * Simplified geographic continental polygons (lon°, lat°) so the procedural
 * Earth texture renders recognizable real continents (Americas, Eurasia, Africa,
 * Australia, Greenland, Antarctica) with zero external image/CORS failures.
 */
type Polygon = Array<[number, number]>;

const CONTINENTS: Polygon[] = [
  // North America
  [
    [-168, 66], [-160, 71], [-136, 70], [-115, 72], [-88, 70], [-78, 62],
    [-64, 60], [-55, 52], [-66, 44], [-75, 36], [-81, 25], [-83, 30],
    [-90, 29], [-97, 26], [-96, 19], [-88, 21], [-83, 10], [-78, 8],
    [-86, 11], [-94, 15], [-105, 20], [-112, 29], [-117, 32], [-124, 41],
    [-125, 49], [-135, 57], [-152, 60], [-164, 55],
  ],
  // Greenland
  [
    [-54, 60], [-58, 70], [-68, 78], [-45, 83], [-20, 81], [-18, 72], [-34, 66], [-44, 60],
  ],
  // South America
  [
    [-78, 10], [-70, 12], [-61, 10], [-50, 1], [-35, -6], [-38, -15],
    [-42, -23], [-52, -33], [-62, -41], [-67, -54], [-74, -53], [-73, -40],
    [-71, -22], [-77, -12], [-81, -5],
  ],
  // Africa
  [
    [-17, 15], [-16, 26], [-6, 36], [10, 37], [15, 32], [32, 31],
    [43, 12], [51, 12], [45, 2], [40, -10], [35, -24], [28, -33],
    [18, -34], [14, -22], [12, -12], [9, 4], [2, 6], [-8, 5], [-15, 11],
  ],
  // Madagascar
  [
    [44, -25], [44, -17], [49, -12], [50, -19], [47, -25],
  ],
  // Eurasia (Europe + Asia)
  [
    [-9, 37], [-9, 43], [-2, 44], [-4, 48], [2, 51], [8, 55], [10, 58],
    [5, 61], [15, 69], [28, 71], [44, 68], [68, 73], [104, 77], [140, 73],
    [176, 67], [170, 60], [160, 54], [142, 54], [135, 44], [128, 35],
    [121, 39], [122, 31], [116, 22], [108, 16], [104, 2], [99, 8],
    [96, 16], [88, 22], [78, 8], [72, 20], [62, 25], [56, 26],
    [49, 29], [59, 22], [45, 13], [35, 29], [35, 36], [26, 40],
    [23, 37], [16, 38], [12, 43], [6, 43], [0, 39], [-5, 36],
  ],
  // United Kingdom & Ireland
  [
    [-6, 50], [-5, 58], [-1, 58], [1, 52],
  ],
  // Japan
  [
    [130, 32], [136, 35], [141, 41], [145, 44], [140, 38], [135, 34],
  ],
  // Indonesia / Borneo / Sumatra / New Guinea
  [
    [96, 5], [105, -5], [114, -8], [106, -6], [98, 2],
  ],
  [
    [109, 1], [118, 6], [118, -3], [111, -3],
  ],
  [
    [132, -2], [145, -6], [149, -10], [138, -8],
  ],
  // Australia
  [
    [114, -22], [122, -17], [131, -12], [136, -12], [142, -11], [149, -20],
    [153, -28], [150, -37], [140, -38], [131, -32], [122, -34], [115, -34],
  ],
  // Antarctica
  [
    [-180, -72], [-120, -73], [-62, -64], [-40, -75], [0, -70],
    [60, -68], [120, -67], [168, -72], [180, -72], [180, -90], [-180, -90],
  ],
];

function pointInPolygon(lon: number, lat: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isEarthLand(lonDeg: number, latDeg: number): boolean {
  for (let i = 0; i < CONTINENTS.length; i++) {
    if (pointInPolygon(lonDeg, latDeg, CONTINENTS[i])) {
      return true;
    }
  }
  return false;
}
