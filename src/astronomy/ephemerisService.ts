import { EphemerisSample, parseHorizonsVectors } from './horizonsParser';

export interface SystemEphemerisData {
  source: string;
  windowStartMs: number;
  windowEndMs: number;
  moonWindowStartMs: number;
  moonWindowEndMs: number;
  samplesByHorizonsId: Record<string, EphemerisSample[]>;
}

interface SystemApiPayload {
  source: string;
  windowStartMs: number;
  windowEndMs: number;
  moonWindowStartMs: number;
  moonWindowEndMs: number;
  bodies: Record<
    string,
    {
      result: string;
      centerId: string;
      stepSize: string;
    }
  >;
  error?: string;
}

const clientWindowCache = new Map<string, SystemEphemerisData>();

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

export async function fetchSystemEphemeris(
  centerTimeMs: number,
  signal?: AbortSignal
): Promise<SystemEphemerisData> {
  const key = dayKey(centerTimeMs);
  const cached = clientWindowCache.get(key);
  if (cached) {
    return cached;
  }

  const iso = new Date(centerTimeMs).toISOString();
  const res = await fetch(`/api/horizons/system?time=${encodeURIComponent(iso)}`, {
    signal,
  });

  const payload = (await res.json()) as SystemApiPayload;
  if (!res.ok) {
    throw new Error(payload.error || `JPL Horizons API request failed (HTTP ${res.status})`);
  }

  const samplesByHorizonsId: Record<string, EphemerisSample[]> = {};
  for (const [horizonsId, entry] of Object.entries(payload.bodies)) {
    samplesByHorizonsId[horizonsId] = parseHorizonsVectors(entry.result);
  }

  const parsed: SystemEphemerisData = {
    source: payload.source,
    windowStartMs: payload.windowStartMs,
    windowEndMs: payload.windowEndMs,
    moonWindowStartMs: payload.moonWindowStartMs,
    moonWindowEndMs: payload.moonWindowEndMs,
    samplesByHorizonsId,
  };

  if (clientWindowCache.size > 16) {
    const oldest = clientWindowCache.keys().next().value;
    if (oldest) clientWindowCache.delete(oldest);
  }
  clientWindowCache.set(key, parsed);
  return parsed;
}

export function isTimeNearWindowEdge(data: SystemEphemerisData, timeMs: number): boolean {
  const marginMs = 5 * 86400 * 1000;
  return (
    timeMs < data.windowStartMs + marginMs || timeMs > data.windowEndMs - marginMs
  );
}
