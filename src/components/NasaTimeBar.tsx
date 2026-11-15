import { Calendar, ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { FormEvent, useState } from 'react';

export interface TimeRateOption {
  index: number;
  label: string;
  rateMultiplier: number; // simulation seconds per real second
}

export const TIME_RATE_SCALE: TimeRateOption[] = [
  { index: -6, label: '-1 YR/S', rateMultiplier: -31_557_600 },
  { index: -5, label: '-1 MO/S', rateMultiplier: -2_592_000 },
  { index: -4, label: '-1 WK/S', rateMultiplier: -604_800 },
  { index: -3, label: '-1 DAY/S', rateMultiplier: -86_400 },
  { index: -2, label: '-1 HR/S', rateMultiplier: -3_600 },
  { index: -1, label: '-1 MIN/S', rateMultiplier: -60 },
  { index: 0, label: 'REAL RATE', rateMultiplier: 1 },
  { index: 1, label: '1 MIN/S', rateMultiplier: 60 },
  { index: 2, label: '1 HR/S', rateMultiplier: 3_600 },
  { index: 3, label: '1 DAY/S', rateMultiplier: 86_400 },
  { index: 4, label: '1 WK/S', rateMultiplier: 604_800 },
  { index: 5, label: '1 MO/S', rateMultiplier: 2_592_000 },
  { index: 6, label: '1 YR/S', rateMultiplier: 31_557_600 },
];

interface NasaTimeBarProps {
  displayTimeMs: number;
  rateIndex: number;
  isPaused: boolean;
  isSyncing: boolean;
  onTogglePause: () => void;
  onChangeRateIndex: (index: number) => void;
  onSelectCustomTime: (utcMs: number) => void;
  onJumpLive: () => void;
}

function formatUtcDateParts(ms: number): { dateStr: string; timeStr: string; isoInput: string } {
  const d = new Date(ms);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const dateStr = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const timeStr = `${hh}:${mm}:${ss} UTC`;

  const yyyy = d.getUTCFullYear();
  const mon = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    dateStr,
    timeStr,
    isoInput: `${yyyy}-${mon}-${day}T${hh}:${mm}`,
  };
}

export function NasaTimeBar({
  displayTimeMs,
  rateIndex,
  isPaused,
  isSyncing,
  onTogglePause,
  onChangeRateIndex,
  onSelectCustomTime,
  onJumpLive,
}: NasaTimeBarProps) {
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [customDateValue, setCustomDateValue] = useState(() => formatUtcDateParts(displayTimeMs).isoInput);

  const currentRate =
    TIME_RATE_SCALE.find((r) => r.index === rateIndex) ?? TIME_RATE_SCALE[6];
  const { dateStr, timeStr, isoInput } = formatUtcDateParts(displayTimeMs);

  const handleOpenPicker = () => {
    setCustomDateValue(isoInput);
    setDateModalOpen((prev) => !prev);
  };

  const handleApplyDate = (e: FormEvent) => {
    e.preventDefault();
    if (!customDateValue) return;
    const parsed = Date.parse(`${customDateValue}:00Z`);
    if (!Number.isNaN(parsed)) {
      onSelectCustomTime(parsed);
      setDateModalOpen(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 max-w-[96vw]">
      {/* Custom Date/Time Picker Popover */}
      {dateModalOpen && (
        <form
          onSubmit={handleApplyDate}
          aria-label="Custom UTC simulation time"
          className="bg-[#0b0f17] border border-white/20 rounded-lg px-4 py-3 shadow-2xl flex flex-wrap items-center gap-3"
        >
          <label className="text-xs text-slate-300 flex items-center gap-2">
            <span>UTC Date &amp; Time</span>
            <input
              type="datetime-local"
              value={customDateValue}
              onChange={(e) => setCustomDateValue(e.target.value)}
              className="bg-[#111827] border border-white/20 rounded px-2.5 py-1 text-xs font-mono-tabular text-white focus:outline-2 focus:outline-[#2b7fff]"
            />
          </label>
          <button
            type="submit"
            className="px-3 py-1 rounded bg-[#2b7fff] hover:bg-[#3b8aff] text-xs font-medium text-white transition-colors"
          >
            Set Time
          </button>
          <button
            type="button"
            onClick={() => setDateModalOpen(false)}
            aria-label="Close custom time picker"
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Main NASA Eyes Time Bar */}
      <nav
        aria-label="Simulation time controls"
        className="bg-[#0b0f17]/95 border border-white/15 rounded-xl px-4 py-2 shadow-2xl flex flex-wrap sm:flex-nowrap items-center gap-4"
      >
        {/* Play / Pause */}
        <button
          type="button"
          onClick={onTogglePause}
          aria-label={isPaused ? 'Play simulation' : 'Pause simulation'}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
        >
          {isPaused ? <Play className="w-3.5 h-3.5 ml-0.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        {/* Rate Slider & Direction Stepper */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeRateIndex(Math.max(-6, rateIndex - 1))}
            aria-label="Reverse or slow simulation rate"
            disabled={rateIndex <= -6}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center w-36 sm:w-44">
            <span
              data-testid="rate-label"
              className="text-[10px] font-mono-tabular tracking-wider text-slate-200 uppercase mb-1"
            >
              {isPaused ? 'PAUSED' : currentRate.label}
            </span>
            <input
              type="range"
              aria-label="Drag time slider thumb"
              min={-6}
              max={6}
              step={1}
              value={rateIndex}
              onChange={(e) => onChangeRateIndex(Number(e.target.value))}
              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#2b7fff]"
            />
          </div>

          <button
            type="button"
            onClick={() => onChangeRateIndex(Math.min(6, rateIndex + 1))}
            aria-label="Forward or speed up simulation rate"
            disabled={rateIndex >= 6}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="hidden sm:block h-6 w-px bg-white/12 shrink-0" aria-hidden="true" />

        {/* UTC Timestamp Display + Custom Date Button */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenPicker}
            aria-label="Input custom time"
            className="text-left px-2 py-1 rounded hover:bg-white/8 transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div>
              <div
                data-testid="sim-date"
                className="text-xs font-medium text-white whitespace-nowrap"
              >
                {dateStr}
              </div>
              <div
                data-testid="sim-time"
                className="text-[11px] font-mono-tabular text-slate-300 whitespace-nowrap"
              >
                {timeStr}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onJumpLive}
            className="px-2.5 py-1 rounded bg-white/10 hover:bg-[#2b7fff] text-[11px] font-medium tracking-wider uppercase text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white"
          >
            Live
          </button>

          {isSyncing && (
            <span className="text-[10px] font-mono-tabular text-amber-300 whitespace-nowrap">
              Syncing JPL…
            </span>
          )}
        </div>
      </nav>
    </div>
  );
}
