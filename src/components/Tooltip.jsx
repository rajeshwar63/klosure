import { useState, useRef, useEffect } from 'react'

// Phase 4.5: hover (desktop) or long-press (mobile, ~500ms) to show provenance.
// Lightweight, no portal, no library. The bubble is absolutely positioned and
// renders above the host with a small arrow. If `content` is falsy, this
// component is transparent — it just renders children. That keeps every call
// site clean: if there's no source_message_id, the tooltip silently skips.
export default function Tooltip({ children, content, className = '' }) {
  const [open, setOpen] = useState(false)
  const longPressTimer = useRef(null)

  useEffect(() => {
    return () => clearTimeout(longPressTimer.current)
  }, [])

  if (!content) return <>{children}</>

  const onTouchStart = () => {
    longPressTimer.current = setTimeout(() => setOpen(true), 500)
  }
  const onTouchEnd = () => {
    clearTimeout(longPressTimer.current)
    // Keep the bubble open briefly after lift so users can read it; tap
    // anywhere else to dismiss (handled by document click below).
  }

  return (
    <span
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClick={() => setOpen((v) => !v)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-[260px] max-w-[80vw] rounded-lg bg-white text-navy text-[12px] leading-snug shadow-lg border border-navy/10 px-3 py-2 text-left pointer-events-none"
        >
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 rotate-45 bg-white border-r border-b border-navy/10" />
        </span>
      )}
    </span>
  )
}
