import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HORIZONS_API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';

interface CachedResponse {
  payload: unknown;
  expiresAt: number;
}

const ephemerisCache = new Map<string, CachedResponse>();
const inflightRequests = new Map<string, Promise<unknown>>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

// Global sequential queue to respect JPL Horizons concurrency limit (prevents HTTP 503)
let horizonsQueue: Promise<void> = Promise.resolve();
function enqueueHorizonsRequest<T>(task: () => Promise<T>): Promise<T> {
  const next = horizonsQueue.then(async () => {
    const res = await task();
    await new Promise((resolve) => setTimeout(resolve, 140));
    return res;
  });
  horizonsQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

const ALLOWED_TARGETS = new Set([
  '10',
  '199',
  '299',
  '399',
  '301',
  '499',
  '599',
  '699',
  '799',
  '899',
]);

function formatHorizonsUtc(isoString: string): string | null {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

async function fetchFromHorizons(
  targetId: string,
  startTime: string,
  stopTime: string,
  stepSize: string,
  centerId: string
): Promise<unknown> {
  const cacheKey = `${targetId}|${centerId}|${startTime}|${stopTime}|${stepSize}`;
  const cached = ephemerisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const existingInflight = inflightRequests.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const requestPromise = enqueueHorizonsRequest(async () => {
    const recheck = ephemerisCache.get(cacheKey);
    if (recheck && recheck.expiresAt > Date.now()) {
      return recheck.payload;
    }

    const params = new URLSearchParams({
      format: 'json',
      COMMAND: `'${targetId}'`,
      OBJ_DATA: "'NO'",
      MAKE_EPHEM: "'YES'",
      EPHEM_TYPE: "'VECTORS'",
      CENTER: `'${centerId}'`,
      REF_SYSTEM: "'ICRF'",
      REF_PLANE: "'ECLIPTIC'",
      OUT_UNITS: "'KM-S'",
      VEC_TABLE: "'2'",
      START_TIME: `'${startTime}'`,
      STOP_TIME: `'${stopTime}'`,
      STEP_SIZE: `'${stepSize}'`,
    });

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(`${HORIZONS_API_URL}?${params.toString()}`, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'SolarSystemObservatory/1.0',
          },
        });

        if (response.status === 503 || response.status === 429) {
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
            continue;
          }
          throw new Error(`JPL Horizons returned HTTP ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(`JPL Horizons returned HTTP ${response.status}`);
        }

        const json = (await response.json()) as { result?: string; error?: string };
        if (json.error) {
          throw new Error(`JPL Horizons error: ${json.error}`);
        }
        if (!json.result || !json.result.includes('$$SOE')) {
          throw new Error('JPL Horizons response missing $$SOE ephemeris table');
        }

        const payload = {
          targetId,
          centerId,
          startTime,
          stopTime,
          stepSize,
          result: json.result,
          fetchedAt: new Date().toISOString(),
        };

        if (ephemerisCache.size > 200) {
          const firstKey = ephemerisCache.keys().next().value;
          if (firstKey) ephemerisCache.delete(firstKey);
        }
        ephemerisCache.set(cacheKey, {
          payload,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return payload;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('JPL Horizons request exhausted retries');
  }).finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, cacheEntries: ephemerisCache.size });
  });

  app.get('/api/horizons/vectors', async (req, res) => {
    const targetId = String(req.query.target ?? '').trim();
    const centerId = String(req.query.center ?? '500@10').trim();
    const startRaw = String(req.query.start ?? '').trim();
    const stopRaw = String(req.query.stop ?? '').trim();
    const stepRaw = String(req.query.step ?? '1d').trim();

    if (!ALLOWED_TARGETS.has(targetId)) {
      res.status(400).json({ error: `Unsupported Horizons target ID: ${targetId}` });
      return;
    }
    if (!/^(500@10|500@399)$/.test(centerId)) {
      res.status(400).json({ error: `Unsupported Horizons center ID: ${centerId}` });
      return;
    }
    if (!/^\d+[mhd]$/.test(stepRaw)) {
      res.status(400).json({ error: `Invalid step size: ${stepRaw}` });
      return;
    }

    const startTime = formatHorizonsUtc(startRaw);
    const stopTime = formatHorizonsUtc(stopRaw);
    if (!startTime || !stopTime) {
      res.status(400).json({ error: 'Invalid ISO start or stop timestamp' });
      return;
    }

    try {
      const data = await fetchFromHorizons(targetId, startTime, stopTime, stepRaw, centerId);
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query JPL Horizons API';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/horizons/system', async (req, res) => {
    const timeRaw = String(req.query.time ?? new Date().toISOString()).trim();
    const centerDate = new Date(timeRaw);
    if (Number.isNaN(centerDate.getTime())) {
      res.status(400).json({ error: 'Invalid ISO time parameter' });
      return;
    }

    // Snap window center to nearest UTC midnight to maximize cache hit reuse
    const snappedMs = Date.UTC(
      centerDate.getUTCFullYear(),
      centerDate.getUTCMonth(),
      centerDate.getUTCDate(),
      0,
      0,
      0
    );

    const planetStart = formatHorizonsUtc(new Date(snappedMs - 45 * 86400 * 1000).toISOString())!;
    const planetStop = formatHorizonsUtc(new Date(snappedMs + 45 * 86400 * 1000).toISOString())!;
    const moonStart = formatHorizonsUtc(new Date(snappedMs - 20 * 86400 * 1000).toISOString())!;
    const moonStop = formatHorizonsUtc(new Date(snappedMs + 20 * 86400 * 1000).toISOString())!;

    const jobs: Array<{ targetId: string; centerId: string; start: string; stop: string; step: string }> = [
      { targetId: '10', centerId: '500@10', start: planetStart, stop: planetStop, step: '5d' },
      { targetId: '199', centerId: '500@10', start: planetStart, stop: planetStop, step: '1d' },
      { targetId: '299', centerId: '500@10', start: planetStart, stop: planetStop, step: '1d' },
      { targetId: '399', centerId: '500@10', start: planetStart, stop: planetStop, step: '1d' },
      { targetId: '499', centerId: '500@10', start: planetStart, stop: planetStop, step: '1d' },
      { targetId: '599', centerId: '500@10', start: planetStart, stop: planetStop, step: '2d' },
      { targetId: '699', centerId: '500@10', start: planetStart, stop: planetStop, step: '2d' },
      { targetId: '799', centerId: '500@10', start: planetStart, stop: planetStop, step: '2d' },
      { targetId: '899', centerId: '500@10', start: planetStart, stop: planetStop, step: '2d' },
      { targetId: '301', centerId: '500@399', start: moonStart, stop: moonStop, step: '12h' },
    ];

    try {
      const results: Record<string, { result: string; centerId: string; stepSize: string }> = {};
      for (const job of jobs) {
        const payload = (await fetchFromHorizons(
          job.targetId,
          job.start,
          job.stop,
          job.step,
          job.centerId
        )) as { result: string; centerId: string; stepSize: string };
        results[job.targetId] = {
          result: payload.result,
          centerId: payload.centerId,
          stepSize: payload.stepSize,
        };
      }

      res.json({
        source: 'NASA/JPL Horizons API (DE441)',
        windowStartMs: snappedMs - 45 * 86400 * 1000,
        windowEndMs: snappedMs + 45 * 86400 * 1000,
        moonWindowStartMs: snappedMs - 20 * 86400 * 1000,
        moonWindowEndMs: snappedMs + 20 * 86400 * 1000,
        bodies: results,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch solar system ephemeris';
      res.status(502).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NASA Eyes Solar System server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
