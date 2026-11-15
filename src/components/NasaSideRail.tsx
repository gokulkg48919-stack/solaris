import {
  Home,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Sun,
  SunDim,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
import { LightingMode, SceneLayerVisibility } from './SolarSystemCanvas';

interface NasaSideRailProps {
  showInfoPanel: boolean;
  hasSelection: boolean;
  layers: SceneLayerVisibility;
  lightingMode: LightingMode;
  isFullscreen: boolean;
  onToggleInfoPanel: () => void;
  onToggleLayer: (key: keyof SceneLayerVisibility) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleLighting: () => void;
  onResetHome: () => void;
  onToggleFullscreen: () => void;
}

export function NasaSideRail({
  showInfoPanel,
  hasSelection,
  layers,
  lightingMode,
  isFullscreen,
  onToggleInfoPanel,
  onToggleLayer,
  onZoomIn,
  onZoomOut,
  onToggleLighting,
  onResetHome,
  onToggleFullscreen,
}: NasaSideRailProps) {
  const [layersOpen, setLayersOpen] = useState(false);

  const layerItems: Array<{ key: keyof SceneLayerVisibility; label: string }> = [
    { key: 'orbits', label: 'Orbital Paths' },
    { key: 'labels', label: 'Object Labels' },
    { key: 'moons', label: 'Planetary Moons' },
    { key: 'asteroidBelt', label: 'Asteroid Belt' },
    { key: 'starfield', label: 'Starfield' },
  ];

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2">
      {/* Layers Popover */}
      {layersOpen && (
        <div
          role="dialog"
          aria-label="Scene layers"
          className="bg-[#0b0f17]/95 border border-white/15 rounded-xl p-3 shadow-2xl w-44"
        >
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2">
            Layers
          </div>
          <div className="space-y-1.5">
            {layerItems.map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-0.5 hover:text-white"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={layers[item.key]}
                  onChange={() => onToggleLayer(item.key)}
                  className="accent-[#2b7fff] w-3.5 h-3.5 cursor-pointer"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Vertical Action Rail */}
      <aside
        aria-label="Viewport controls"
        className="bg-[#0b0f17]/95 border border-white/15 rounded-xl p-1.5 flex flex-col items-center gap-1 shadow-2xl"
      >
        <button
          type="button"
          onClick={onToggleInfoPanel}
          aria-label="Show info panel"
          aria-pressed={showInfoPanel && hasSelection}
          title="Toggle Info Panel"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff] ${
            showInfoPanel && hasSelection
              ? 'bg-[#2b7fff] text-white'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Info className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setLayersOpen((prev) => !prev)}
          aria-label="Toggle layers"
          aria-expanded={layersOpen}
          title="Layers"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff] ${
            layersOpen
              ? 'bg-[#2b7fff] text-white'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        <div className="w-5 h-px bg-white/12 my-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom In"
          className="w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom Out"
          className="w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-5 h-px bg-white/12 my-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={onToggleLighting}
          aria-label="Toggle light modes"
          aria-pressed={lightingMode === 'illuminated'}
          title={lightingMode === 'natural' ? 'Lighting: Natural Sunlight' : 'Lighting: Illuminated'}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff] ${
            lightingMode === 'illuminated'
              ? 'bg-[#2b7fff] text-white'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          {lightingMode === 'natural' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <SunDim className="w-4 h-4" />
          )}
        </button>

        <button
          type="button"
          onClick={onResetHome}
          aria-label="Reset camera to solar system home"
          title="Solar System Home"
          className="w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
        >
          <Home className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label="Toggle fullscreen"
          title="Toggle Fullscreen"
          className="w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </aside>
    </div>
  );
}
