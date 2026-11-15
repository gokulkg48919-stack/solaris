import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { ALL_INSPECTABLE_BODIES } from '../astronomy/bodiesCatalog';

interface NasaObjectMenuProps {
  selectedId: string | null;
  onSelectBody: (id: string) => void;
  onResetHome: () => void;
}

export function NasaObjectMenu({
  selectedId,
  onSelectBody,
  onResetHome,
}: NasaObjectMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-30 px-4 py-3 flex items-center justify-between pointer-events-none">
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Menu"
          aria-expanded={open}
          className="px-3 py-1.5 rounded-lg bg-[#0b0f17]/95 border border-white/15 text-xs font-medium text-white hover:bg-white/12 flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-[#2b7fff]"
        >
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>Menu</span>
        </button>
      </div>

      {/* Body Directory Menu */}
      {open && (
        <nav
          aria-label="Solar system objects menu"
          className="fixed left-4 top-14 z-30 w-64 bg-[#0b0f17]/95 border border-white/15 rounded-xl p-2 shadow-2xl pointer-events-auto"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400">
            Solar System Objects
          </div>
          <ul className="space-y-0.5 max-h-[65vh] overflow-y-auto dossier-scroll">
            {ALL_INSPECTABLE_BODIES.map((body) => {
              const active = selectedId === body.id;
              return (
                <li key={body.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBody(body.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      active
                        ? 'bg-[#2b7fff] text-white font-medium'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: body.orbitColor }}
                        aria-hidden="true"
                      />
                      <span>{body.name}</span>
                    </span>
                    <span className="text-[10px] font-mono-tabular opacity-70">
                      {body.horizonsId}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                onResetHome();
                setOpen(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/10 text-left transition-colors"
            >
              Solar System Overview
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
