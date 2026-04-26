// Phase 6 step 10 — cream banner at the top of the Overview tab. One or two
// sentences of context summarized by Klo (klo_state.summary), with a
// Show more / Show less toggle if the summary is long.

import { useState } from 'react'

const PREVIEW_LIMIT = 200

export default function DealContextStrip({ klo_state }) {
  const summary = klo_state?.summary
  const [expanded, setExpanded] = useState(false)
  if (!summary) return null

  const isLong = summary.length > PREVIEW_LIMIT
  const display = expanded || !isLong
    ? summary
    : `${summary.slice(0, PREVIEW_LIMIT - 3)}…`

  return (
    <div
      className="rounded-md p-3 mb-4 flex gap-2.5 items-start"
      style={{ background: '#FAEEDA' }}
    >
      <span className="text-xs font-semibold shrink-0" style={{ color: '#854F0B' }}>
        +
      </span>
      <div
        className="flex-1 min-w-0 text-xs leading-relaxed"
        style={{ color: '#633806' }}
      >
        {display}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-1 underline"
            style={{ color: '#854F0B' }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  )
}
