import { Flame, Home } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBodySpecById } from './astronomy/bodiesCatalog';
import {
  fetchSystemEphemeris,
  isTimeNearWindowEdge,
  SystemEphemerisData,
} from './astronomy/ephemerisService';
import { interpolateStateVector } from './astronomy/orbitalMath';
import { NasaInfoPanel } from './components/NasaInfoPanel';
import { NasaObjectMenu } from './components/NasaObjectMenu';
import { NasaSideRail } from './components/NasaSideRail';
import { NasaTimeBar, TIME_RATE_SCALE } from './components/NasaTimeBar';
import {
  CameraActionSignal,
  LightingMode,
  SceneLayerVisibility,
  SolarSystemCanvas,
} from './components/SolarSystemCanvas';

const DEFAULT_EPOCH_MS = Date.parse('2026-11-14T14:28:46.375Z');

function parseInitialParams(): { initialTimeMs: number; initialRateIdx: number } {
  try {
    const hashQuery = window.location.hash.includes('?')
      ? window.location.hash.split('?')[1]
      : '';
    const params = new URLSearchParams(hashQuery || window.location.search);
    const timeParam = params.get('time');
    const parsedTime = timeParam ? Date.parse(timeParam) : NaN;
    const initialTimeMs = Number.isNaN(parsedTime) ? DEFAULT_EPOCH_MS : parsedTime;

    const rateParam = Number(params.get('rate'));
    let initialRateIdx = 0; // REAL RATE (1x)
    if (!Number.isNaN(rateParam) && rateParam !== 0) {
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (const opt of TIME_RATE_SCALE) {
        const diff = Math.abs(opt.rateMultiplier - rateParam);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = opt.index;
        }
      }
      initialRateIdx = bestIdx;
    }

    return { initialTimeMs, initialRateIdx };
  } catch {
    return { initialTimeMs: DEFAULT_EPOCH_MS, initialRateIdx: 0 };
  }
}

export default function App() {
  const [{ initialTimeMs, initialRateIdx }] = useState(() => parseInitialParams());

  const simTimeMsRef = useRef<number>(initialTimeMs);
  const [displayTimeMs, setDisplayTimeMs] = useState<number>(initialTimeMs);
  const [rateIndex, setRateIndex] = useState<number>(initialRateIdx);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [ephemeris, setEphemeris] = useState<SystemEphemerisData | null>(null);
  const [ephemStatus, setEphemStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ephemError, setEphemError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState<boolean>(true);
  const [lightingMode, setLightingMode] = useState<LightingMode>('natural');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'present' | 'redGiant'>('present');
  const redGiantStartMsRef = useRef<number>(0);
  const [redGiantElapsedSec, setRedGiantElapsedSec] = useState<number>(0);

  const [layers, setLayers] = useState<SceneLayerVisibility>({
    orbits: true,
    labels: true,
    asteroidBelt: true,
    moons: true,
    starfield: true,
  });

  const [cameraSignal, setCameraSignal] = useState<CameraActionSignal>({
    type: 'reset',
    nonce: 0,
  });

  const activeFetchRef = useRef<AbortController | null>(null);
  const lastRequestedCenterRef = useRef<number | null>(null);

  const loadEphemerisWindow = useCallback(async (centerTimeMs: number, isInitial: boolean) => {
    // Avoid redundant fetches for the same UTC day
    if (
      lastRequestedCenterRef.current !== null &&
      Math.abs(centerTimeMs - lastRequestedCenterRef.current) < 86400 * 1000 * 3
    ) {
      return;
    }
    lastRequestedCenterRef.current = centerTimeMs;

    activeFetchRef.current?.abort();
    const controller = new AbortController();
    activeFetchRef.current = controller;

    if (isInitial) {
      setEphemStatus('loading');
      setEphemError(null);
    } else {
      setIsSyncing(true);
    }

    try {
      const data = await fetchSystemEphemeris(centerTimeMs, controller.signal);
      if (controller.signal.aborted) return;
      setEphemeris(data);
      setEphemStatus('ready');
      setEphemError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Unable to reach JPL Horizons API';
      if (isInitial) {
        setEphemStatus('error');
        setEphemError(msg);
      } else {
        setEphemError(msg);
      }
      lastRequestedCenterRef.current = null;
    } finally {
      if (!controller.signal.aborted) {
        setIsSyncing(false);
      }
    }
  }, []);

  // Initial ephemeris load
  useEffect(() => {
    loadEphemerisWindow(initialTimeMs, true);
    return () => {
      activeFetchRef.current?.abort();
    };
  }, [initialTimeMs, loadEphemerisWindow]);

  // Astronomical time progression loop (updates ref smoothly, throttles React UI clock to 5Hz)
  const rateMultiplier = useMemo(() => {
    const found = TIME_RATE_SCALE.find((r) => r.index === rateIndex);
    return found ? found.rateMultiplier : 1;
  }, [rateIndex]);

  useEffect(() => {
    let rafId = 0;
    let lastNow = performance.now();
    let lastUiSync = 0;

    const tick = (now: number) => {
      const dtSec = Math.min((now - lastNow) / 1000, 0.1);
      lastNow = now;

      if (!isPaused) {
        simTimeMsRef.current += dtSec * rateMultiplier * 1000;
      }

      if (now - lastUiSync >= 200) {
        lastUiSync = now;
        const currentMs = simTimeMsRef.current;
        setDisplayTimeMs(currentMs);

        if (ephemeris && isTimeNearWindowEdge(ephemeris, currentMs)) {
          loadEphemerisWindow(currentMs, false);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPaused, rateMultiplier, ephemeris, loadEphemerisWindow]);

  // Fullscreen state listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // 5-second countdown & expansion phase ticker while in +5 billion years mode
  useEffect(() => {
    if (viewMode !== 'redGiant') return;
    const id = window.setInterval(() => {
      setRedGiantElapsedSec(Math.max(0, (performance.now() - redGiantStartMsRef.current) / 1000));
    }, 200);
    return () => window.clearInterval(id);
  }, [viewMode]);

  const handleSelectBody = useCallback((id: string) => {
    setSelectedId(id);
    setShowInfoPanel(true);
    setCameraSignal((prev) => ({
      type: 'focus',
      bodyId: id,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleResetHome = useCallback(() => {
    setSelectedId(null);
    setCameraSignal((prev) => ({
      type: 'reset',
      bodyId: null,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleEnterRedGiant = useCallback(() => {
    redGiantStartMsRef.current = performance.now();
    setRedGiantElapsedSec(0);
    setViewMode('redGiant');
    setSelectedId(null);
    setCameraSignal((prev) => ({
      type: 'reset',
      bodyId: null,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleReturnMainHome = useCallback(() => {
    setViewMode('present');
    setRedGiantElapsedSec(0);
    setSelectedId(null);
    setCameraSignal((prev) => ({
      type: 'reset',
      bodyId: null,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleBodyEngulfed = useCallback((engulfedId: string) => {
    setSelectedId((curr) => {
      if (curr === engulfedId) {
        setCameraSignal((prev) => ({
          type: 'reset',
          bodyId: null,
          nonce: prev.nonce + 1,
        }));
        return null;
      }
      return curr;
    });
  }, []);

  const handleSelectCustomTime = useCallback(
    (utcMs: number) => {
      simTimeMsRef.current = utcMs;
      setDisplayTimeMs(utcMs);
      if (!ephemeris || utcMs < ephemeris.windowStartMs || utcMs > ephemeris.windowEndMs) {
        lastRequestedCenterRef.current = null;
        loadEphemerisWindow(utcMs, ephemeris === null);
      }
    },
    [ephemeris, loadEphemerisWindow]
  );

  const handleJumpLive = useCallback(() => {
    const nowMs = Date.now();
    setIsPaused(false);
    setRateIndex(0); // REAL RATE
    handleSelectCustomTime(nowMs);
  }, [handleSelectCustomTime]);

  const handleToggleLayer = useCallback((key: keyof SceneLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const selectedSpec = useMemo(
    () => (selectedId ? getBodySpecById(selectedId) ?? null : null),
    [selectedId]
  );

  const selectedStateVector = useMemo(() => {
    if (!selectedSpec || !ephemeris) return null;
    const samples = ephemeris.samplesByHorizonsId[selectedSpec.horizonsId];
    if (!samples) return null;
    return interpolateStateVector(samples, displayTimeMs);
  }, [selectedSpec, ephemeris, displayTimeMs]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#020409] select-none">
      {/* 3D WebGL Solar System Canvas (React Three Fiber + Drei) */}
      <SolarSystemCanvas
        ephemeris={ephemeris}
        simTimeMsRef={simTimeMsRef}
        selectedId={selectedId}
        layers={layers}
        lightingMode={lightingMode}
        cameraSignal={cameraSignal}
        redGiantActive={viewMode === 'redGiant'}
        redGiantStartMsRef={redGiantStartMsRef}
        onBodyEngulfed={handleBodyEngulfed}
        onSelectBody={handleSelectBody}
        onContextLost={setContextLost}
      />

      {/* Top Header & Menu */}
      <NasaObjectMenu
        selectedId={selectedId}
        onSelectBody={handleSelectBody}
        onResetHome={handleResetHome}
      />

      {/* Right Vertical Action Rail */}
      <NasaSideRail
        showInfoPanel={showInfoPanel}
        hasSelection={Boolean(selectedSpec)}
        layers={layers}
        lightingMode={lightingMode}
        isFullscreen={isFullscreen}
        onToggleInfoPanel={() => {
          if (!selectedSpec) {
            handleSelectBody('earth');
          } else {
            setShowInfoPanel((prev) => !prev);
          }
        }}
        onToggleLayer={handleToggleLayer}
        onZoomIn={() =>
          setCameraSignal((prev) => ({ type: 'zoomIn', nonce: prev.nonce + 1 }))
        }
        onZoomOut={() =>
          setCameraSignal((prev) => ({ type: 'zoomOut', nonce: prev.nonce + 1 }))
        }
        onToggleLighting={() =>
          setLightingMode((prev) => (prev === 'natural' ? 'illuminated' : 'natural'))
        }
        onResetHome={handleResetHome}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* Selected Object Info Panel */}
      {selectedSpec && showInfoPanel && (
        <NasaInfoPanel
          body={selectedSpec}
          stateVector={selectedStateVector}
          onClose={handleResetHome}
          onFocusBody={() =>
            setCameraSignal((prev) => ({
              type: 'focus',
              bodyId: selectedSpec.id,
              nonce: prev.nonce + 1,
            }))
          }
        />
      )}

      {/* Bottom NASA Time Control Bar (Main Page) */}
      {viewMode === 'present' && (
        <NasaTimeBar
          displayTimeMs={displayTimeMs}
          rateIndex={rateIndex}
          isPaused={isPaused}
          isSyncing={isSyncing}
          onTogglePause={() => setIsPaused((prev) => !prev)}
          onChangeRateIndex={(idx) => {
            setIsPaused(false);
            setRateIndex(idx);
          }}
          onSelectCustomTime={handleSelectCustomTime}
          onJumpLive={handleJumpLive}
        />
      )}

      {/* Bottom-Right Mode Switcher: "5 billion years after" <-> "Home" */}
      {viewMode === 'present' ? (
        <button
          type="button"
          onClick={handleEnterRedGiant}
          className="fixed bottom-20 sm:bottom-4 right-4 z-20 bg-[#0b0f17]/95 border border-amber-400/40 hover:border-amber-300/80 hover:bg-[#141926] text-amber-100 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2 text-xs font-medium tracking-wider uppercase transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <Flame className="w-4 h-4 text-amber-400 shrink-0" />
          <span>5 billion years after</span>
        </button>
      ) : (
        <>
          {/* Compact Supernova Explosion Narrative Card (Bottom-Left, zero viewport occlusion) */}
          <aside
            data-testid="supernova-narrative"
            className="fixed bottom-4 left-4 z-20 max-w-md bg-[#0b0f17]/95 border border-white/15 rounded-xl px-4 py-3 shadow-2xl"
          >
            {(() => {
              const cycleSec = redGiantElapsedSec % 30.0;
              const phaseLabel =
                cycleSec < 5
                  ? `01 · Core Fuel Exhausted (${Math.max(1, Math.ceil(5 - cycleSec))}s)`
                  : cycleSec < 21.5
                    ? '02 · Supergiant Swell & Engulfment'
                    : cycleSec < 22.1
                      ? '03 · Gravity Wins · Instant Core Collapse'
                      : '04 · Supernova Rebound · Outshining Galaxies';
              const progressPct = Math.min(100, (cycleSec / 30.0) * 100);
              return (
                <>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-display text-xs font-semibold tracking-wider uppercase text-amber-200">
                      Supernova Explosion
                    </span>
                    <span className="text-[10px] font-mono-tabular tracking-wider uppercase text-cyan-300">
                      {phaseLabel}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    When a massive star runs out of fuel, gravity wins instantly. The core
                    collapses in a fraction of a second and rebounds in a cataclysmic explosion
                    known as a supernova, outshining entire galaxies.
                  </p>
                  <div className="mt-2.5 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-cyan-400 transition-all duration-200"
                      style={{ width: `${progressPct.toFixed(1)}%` }}
                    />
                  </div>
                </>
              );
            })()}
          </aside>

          {/* Bottom-Right Phase Badge & Home Return Button */}
          <div className="fixed bottom-4 right-4 z-20 flex flex-col items-end gap-2">
            <div
              data-testid="red-giant-status"
              className="bg-[#0b0f17]/95 border border-orange-500/35 rounded-lg px-3 py-1.5 text-[11px] font-mono-tabular tracking-wider uppercase text-orange-200 shadow-xl"
            >
              {(() => {
                const cycleSec = redGiantElapsedSec % 30.0;
                if (cycleSec < 5) {
                  return `Core exhaustion in ${Math.max(1, Math.ceil(5 - cycleSec))}s`;
                }
                if (cycleSec < 21.5) {
                  return '+5.0 Gyr · Swelling & Eating Planets';
                }
                if (cycleSec < 22.1) {
                  return 'Gravity Wins · Core Collapse (0.6s)';
                }
                return 'Supernova Explosion · Outshining Galaxies';
              })()}
            </div>
            <button
              type="button"
              onClick={handleReturnMainHome}
              className="bg-[#0b0f17]/95 border border-white/25 hover:border-[#2b7fff] hover:bg-[#2b7fff] text-white rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2 text-xs font-medium tracking-wider uppercase transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Home</span>
            </button>
          </div>
        </>
      )}

      {/* Initial JPL Horizons Loading Overlay */}
      {ephemStatus === 'loading' && !ephemeris && (
        <div
          role="status"
          className="fixed inset-0 z-40 bg-[#020409]/85 flex flex-col items-center justify-center p-6 text-center pointer-events-auto"
        >
          <div className="font-display text-lg font-semibold tracking-wider uppercase text-white">
            Loading NASA/JPL Horizons Ephemeris
          </div>
          <p className="text-xs font-mono-tabular text-slate-400 mt-2">
            Querying ICRF Ecliptic DE441 vectors (Targets 10, 199–899, 301)…
          </p>
        </div>
      )}

      {/* Honest API Error Overlay (Never displays fake coordinates on failure) */}
      {ephemStatus === 'error' && !ephemeris && (
        <div
          role="alert"
          className="fixed inset-0 z-40 bg-[#020409]/92 flex flex-col items-center justify-center p-6 text-center pointer-events-auto"
        >
          <h2 className="font-display text-lg font-semibold text-white">
            JPL Horizons Ephemeris Unavailable
          </h2>
          <p className="text-xs text-slate-300 mt-2 max-w-md">
            {ephemError ?? 'Unable to retrieve real astronomical state vectors from NASA/JPL Horizons.'}
          </p>
          <button
            type="button"
            onClick={() => {
              lastRequestedCenterRef.current = null;
              loadEphemerisWindow(simTimeMsRef.current, true);
            }}
            className="mt-4 px-4 py-2 rounded-lg bg-[#2b7fff] hover:bg-[#3b8aff] text-xs font-medium text-white transition-colors"
          >
            Retry Horizons Query
          </button>
        </div>
      )}

      {/* Non-blocking sync warning if window extension failed mid-session */}
      {ephemError && ephemeris && (
        <div
          role="status"
          className="fixed top-14 right-4 z-30 bg-[#0b0f17]/95 border border-rose-500/40 rounded-lg px-3 py-2 text-xs text-rose-200 flex items-center gap-3"
        >
          <span>Horizons sync error: {ephemError}</span>
          <button
            type="button"
            onClick={() => {
              lastRequestedCenterRef.current = null;
              loadEphemerisWindow(simTimeMsRef.current, false);
            }}
            className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* WebGL Context Lost Overlay */}
      {contextLost && (
        <div
          role="alert"
          className="fixed inset-0 z-50 bg-[#020409]/95 flex flex-col items-center justify-center p-6 text-center"
        >
          <h2 className="font-display text-lg font-semibold text-white">
            WebGL Context Interrupted
          </h2>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-[#2b7fff] text-white text-xs font-medium"
          >
            Reload Simulation
          </button>
        </div>
      )}
    </main>
  );
}
