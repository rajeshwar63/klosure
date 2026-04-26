// Phase 5.5 step 06: generic wrapper that gives every Overview section a
// uniform collapsed/expanded behavior. The header row shows the section title,
// an optional count, and — when collapsed — a one-line headline summarizing
// what's inside so the user knows whether expanding is worth the tap.
//
// Stylistically the wrapper is transparent — section components keep their
// own card styling, and the header is a single pill-styled row that sits
// above the content.
//
// Behavior:
//   - Hidden entirely when count is 0 and no emptyMessage is provided
//   - Shows emptyMessage in place of children when expanded and count is 0
//   - Supports both uncontrolled (defaultExpanded) and controlled
//     (expanded + onToggle) modes — step 07 wires up the controlled mode for
//     per-deal localStorage persistence.

import { useState } from 'react'

export default function CollapsibleSection({
  title,
  count,
  headline,
  defaultExpanded = false,
  expanded,
  onToggle,
  emptyMessage,
  children,
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isControlled = expanded !== undefined
  const isExpanded = isControlled ? expanded : internalExpanded

  function toggle() {
    const next = !isExpanded
    if (isControlled) onToggle?.(next)
    else setInternalExpanded(next)
  }

  if (count === 0 && !emptyMessage) return null

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-navy/10 rounded-xl text-left hover:border-navy/20 transition-colors"
      >
        <span className="text-[10px] uppercase tracking-wider font-semibold text-navy/60 shrink-0">
          {title}
          {count != null ? ` (${count})` : ''}
        </span>
        {!isExpanded && headline && (
          <span className="text-[12px] text-navy/50 truncate min-w-0">
            · {headline}
          </span>
        )}
        <span className="ml-auto text-navy/40 text-base leading-none shrink-0">
          {isExpanded ? '⌃' : '⌄'}
        </span>
      </button>
      {isExpanded && (
        count === 0 && emptyMessage ? (
          <p className="bg-white border border-navy/10 rounded-xl px-4 py-3 text-[13px] text-navy/60">
            {emptyMessage}
          </p>
        ) : (
          children
        )
      )}
    </div>
  )
}
