export interface EphemerisSample {
  timestampMs: number;
  jdTdb: number;
  x: number; // km (ICRF Ecliptic)
  y: number; // km
  z: number; // km
  vx: number; // km/s
  vy: number; // km/s
  vz: number; // km/s
}

const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const DATE_LINE_RE =
  /^\s*([\d.]+)\s*=\s*A\.D\.\s+(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2}):([\d.]+)/;
const POS_LINE_RE =
  /X\s*=\s*([+-]?[\d.]+(?:E[+-]?\d+)?)\s+Y\s*=\s*([+-]?[\d.]+(?:E[+-]?\d+)?)\s+Z\s*=\s*([+-]?[\d.]+(?:E[+-]?\d+)?)/i;
const VEL_LINE_RE =
  /VX\s*=\s*([+-]?[\d.]+(?:E[+-]?\d+)?)\s+VY\s*=\s*([+-]?[\d.]+(?:E[+-]?\d+)?)\s+VZ\s*=\s*([+-]?[\d.]+(?:E[+-]?\d+)?)/i;

export function parseHorizonsVectors(rawResult: string): EphemerisSample[] {
  const soeIdx = rawResult.indexOf('$$SOE');
  const eoeIdx = rawResult.indexOf('$$EOE');
  if (soeIdx === -1 || eoeIdx === -1 || eoeIdx <= soeIdx) {
    throw new Error('Invalid Horizons output: missing $$SOE/$$EOE markers');
  }

  const block = rawResult.slice(soeIdx + 5, eoeIdx);
  const lines = block.split(/\r?\n/);
  const samples: EphemerisSample[] = [];

  for (let i = 0; i < lines.length; i++) {
    const dateMatch = DATE_LINE_RE.exec(lines[i]);
    if (!dateMatch) continue;

    const jdTdb = Number.parseFloat(dateMatch[1]);
    const year = Number.parseInt(dateMatch[2], 10);
    const monthIdx = MONTH_MAP[dateMatch[3]];
    const day = Number.parseInt(dateMatch[4], 10);
    const hour = Number.parseInt(dateMatch[5], 10);
    const minute = Number.parseInt(dateMatch[6], 10);
    const secFloat = Number.parseFloat(dateMatch[7]);
    const secInt = Math.floor(secFloat);
    const ms = Math.round((secFloat - secInt) * 1000);

    if (monthIdx === undefined) continue;
    const timestampMs = Date.UTC(year, monthIdx, day, hour, minute, secInt, ms);

    const posLine = lines[i + 1] ?? '';
    const velLine = lines[i + 2] ?? '';
    const posMatch = POS_LINE_RE.exec(posLine);
    const velMatch = VEL_LINE_RE.exec(velLine);

    if (!posMatch || !velMatch) continue;

    samples.push({
      timestampMs,
      jdTdb,
      x: Number.parseFloat(posMatch[1]),
      y: Number.parseFloat(posMatch[2]),
      z: Number.parseFloat(posMatch[3]),
      vx: Number.parseFloat(velMatch[1]),
      vy: Number.parseFloat(velMatch[2]),
      vz: Number.parseFloat(velMatch[3]),
    });

    i += 2;
  }

  samples.sort((a, b) => a.timestampMs - b.timestampMs);
  return samples;
}
