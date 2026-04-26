// Phase 6 step 11 — blockers panel. Reuses the existing × removal flow from
// Phase 4.5. Always visible (no collapse on desktop), but kept toggleable
// for mobile where vertical space is precious.

import { useState } from 'react'
import RemoveButton from '../RemoveButton.jsx'

const SEVERITY_BG = {
  red: 'var(--color-health-red)',
  amber: 'var(--color-health-amber)',
  green: 'var(--color-health-green)',
}

function formatSince(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function BlockerRow({ blocker, viewerRole, dealId }) {
  return (
    <div className="flex gap-2 items-start group">
      <span
        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
        style={{ background: SEVERITY_BG[blocker.severity] || SEVERITY_BG.amber }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-snug text-navy/85">{blocker.text}</div>
        {blocker.since && (
          <div className="text-[12px] text-navy/45 mt-0.5">
            since {formatSince(blocker.since)}
          </div>
        )}
      </div>
      {viewerRole === 'seller' && (
        <RemoveButton
          dealId={dealId}
          kind="blockers"
          match={{ text: blocker.text }}
          label={blocker.text}
          addedAt={blocker.added_at}
        />
      )}
    </div>
  )
}

export default function BlockersPanel({ klo_state, viewerRole, dealId }) {
  const blockers = klo_state?.blockers ?? []
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className="bg-white rounded-xl p-4 md:p-5"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="flex justify-between items-baseline mb-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[12px] font-semibold tracking-wider text-navy/55 flex items-center gap-1.5 hover:text-navy"
        >
          <span aria-hidden>{expanded ? '⌃' : '⌄'}</span>
          BLOCKERS · {blockers.length}
        </button>
        {viewerRole === 'seller' && (
          <button
            type="button"
            disabled
            title="Coming soon"
            className="text-[10px] text-klo opacity-40 cursor-not-allowed"
          >
            + Add
          </button>
        )}
      </div>

      {expanded &&
        (blockers.length === 0 ? (
          <div className="text-xs text-navy/45 py-1">
            No blockers — keep it that way.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {blockers.map((b, i) => (
              <BlockerRow
                key={`${b.text || i}-${i}`}
                blocker={b}
                viewerRole={viewerRole}
                dealId={dealId}
              />
            ))}
          </div>
        ))}
    </div>
  )
}
