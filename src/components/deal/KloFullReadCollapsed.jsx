// Phase 6 step 10 — collapsed bar that expands into Klo's rationale + every
// confidence factor (not just the top 3 the side panel shows). Seller-only.

import { useState } from 'react'

export default function KloFullReadCollapsed({ klo_state, viewerRole }) {
  const [open, setOpen] = useState(false)
  const c = klo_state?.confidence
  if (!c || viewerRole !== 'seller') return null

  return (
    <div
      className="bg-white rounded-md mb-4 overflow-hidden"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex justify-between items-center text-left hover:bg-navy/5"
      >
        <span className="text-[10px] uppercase font-semibold tracking-wider text-navy/55">
          + KLO'S FULL READ
        </span>
        <span className="text-navy/40 text-base leading-none">
          {open ? '⌃' : '⌄'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {c.rationale && (
            <p className="text-sm text-navy/75 leading-relaxed mb-3 whitespace-pre-line">
              {c.rationale}
            </p>
          )}
          {Array.isArray(c.factors_to_raise) && c.factors_to_raise.length > 0 && (
            <>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-navy/45 mb-1.5">
                ALL FACTORS
              </div>
              <div className="flex flex-col gap-1">
                {c.factors_to_raise.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1 rounded-md"
                    style={{ background: '#EAF3DE' }}
                  >
                    <span
                      className="text-xs font-semibold shrink-0"
                      style={{ color: '#3B6D11' }}
                    >
                      +{f.impact}%
                    </span>
                    <span className="text-xs leading-snug" style={{ color: '#173404' }}>
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
