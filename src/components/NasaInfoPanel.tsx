import { X } from 'lucide-react';
import { SolarSystemBodySpec } from '../astronomy/bodiesCatalog';
import { StateVector } from '../astronomy/orbitalMath';

interface NasaInfoPanelProps {
  body: SolarSystemBodySpec;
  stateVector: StateVector | null;
  onClose: () => void;
  onFocusBody: () => void;
}

function formatKm(val: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val);
}

function formatVecKm(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e6) {
    return `${(val / 1e6).toFixed(4)} × 10⁶ km`;
  }
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(val)} km`;
}

function formatRot(hours: number): string {
  const abs = Math.abs(hours);
  const suffix = hours < 0 ? ' (Retrograde)' : '';
  if (abs >= 48) {
    return `${(abs / 24).toFixed(2)} days${suffix}`;
  }
  return `${abs.toFixed(2)} hrs${suffix}`;
}

export function NasaInfoPanel({
  body,
  stateVector,
  onClose,
  onFocusBody,
}: NasaInfoPanelProps) {
  return (
    <aside
      aria-label={`${body.name} information panel`}
      data-testid="nasa-info-panel"
      className="fixed left-4 top-16 bottom-24 z-20 w-[min(360px,calc(100vw-4.5rem))] bg-[#0b0f17]/95 border border-white/15 rounded-xl flex flex-col overflow-hidden shadow-2xl"
    >
      <div className="px-4 py-3.5 border-b border-white/12 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#6cb2ff]">
            {body.category} · Horizons ID {body.horizonsId}
          </div>
          <h2 className="font-display text-2xl font-semibold text-white mt-0.5">
            {body.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${body.name} info panel`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto dossier-scroll px-4 py-3.5 space-y-4">
        <p className="text-xs leading-relaxed text-slate-200">{body.summary}</p>

        {/* Physical Properties */}
        <section aria-labelledby="nasa-phys-heading">
          <h3
            id="nasa-phys-heading"
            className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2"
          >
            Physical Measurements
          </h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-white/10 pt-2.5">
            <div>
              <dt className="text-[11px] text-slate-400">Diameter</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {formatKm(body.diameterKm)} km
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Mass</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {body.massKg}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Surface Gravity</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {body.gravityMs2.toFixed(2)} m/s²
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Mean Temperature</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {body.meanTempC > 0 ? `+${body.meanTempC}` : body.meanTempC} °C
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Orbital Period</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {body.orbitalPeriodDays === 0
                  ? 'Reference Origin'
                  : body.orbitalPeriodDays > 730
                    ? `${(body.orbitalPeriodDays / 365.25).toFixed(2)} yrs`
                    : `${body.orbitalPeriodDays.toFixed(2)} days`}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Rotation Period</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {formatRot(body.rotationPeriodHours)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Axial Tilt</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {body.axialTiltDeg.toFixed(2)}°
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">Known Moons</dt>
              <dd className="text-xs font-mono-tabular text-white mt-0.5">
                {body.moonsCount}
              </dd>
            </div>
          </dl>
        </section>

        {/* Live JPL Horizons Vector Data */}
        <section
          aria-labelledby="nasa-vec-heading"
          className="border-t border-white/10 pt-3"
        >
          <h3
            id="nasa-vec-heading"
            className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1"
          >
            JPL Horizons State Vector
          </h3>
          <p className="text-[10px] font-mono-tabular text-slate-500 mb-2">
            ICRF / ECLIPTIC · {body.id === 'moon' ? 'CENTER 500@399 (Earth)' : 'CENTER 500@10 (Sun)'}
          </p>

          {stateVector ? (
            <dl className="space-y-2 text-xs font-mono-tabular">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">
                  {body.id === 'moon' ? 'Distance (Earth)' : 'Heliocentric Dist'}
                </dt>
                <dd className="text-white text-right">
                  {formatKm(stateVector.distanceKm)} km
                  {body.id !== 'sun' && body.id !== 'moon' && (
                    <span className="text-slate-400 ml-1.5">
                      ({stateVector.distanceAU.toFixed(4)} AU)
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Orbital Speed</dt>
                <dd className="text-white">{stateVector.speedKms.toFixed(3)} km/s</dd>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/8">
                <div>
                  <dt className="text-[10px] text-slate-400">X</dt>
                  <dd className="text-[11px] text-slate-100">{formatVecKm(stateVector.x)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">Y</dt>
                  <dd className="text-[11px] text-slate-100">{formatVecKm(stateVector.y)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">Z</dt>
                  <dd className="text-[11px] text-slate-100">{formatVecKm(stateVector.z)}</dd>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <dt className="text-[10px] text-slate-400">VX</dt>
                  <dd className="text-[11px] text-slate-300">{stateVector.vx.toFixed(3)} km/s</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">VY</dt>
                  <dd className="text-[11px] text-slate-300">{stateVector.vy.toFixed(3)} km/s</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">VZ</dt>
                  <dd className="text-[11px] text-slate-300">{stateVector.vz.toFixed(3)} km/s</dd>
                </div>
              </div>
            </dl>
          ) : (
            <div className="text-xs text-slate-400">Awaiting ephemeris vector…</div>
          )}
        </section>
      </div>

      <div className="px-4 py-2.5 border-t border-white/12 bg-[#070a10] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onFocusBody}
          className="px-3 py-1.5 rounded-lg bg-[#2b7fff] hover:bg-[#3b8aff] text-xs font-medium text-white transition-colors"
        >
          Center Camera
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-medium text-slate-200 transition-colors"
        >
          Solar System Home
        </button>
      </div>
    </aside>
  );
}
