// Phase 5: cross-deal daily coaching paragraph at the top of the dashboard.
// Klo synthesizes the seller's whole active pipeline into one short read of
// where to spend the day. Cached server-side; this component triggers
// regeneration on demand via the refresh button.
//
// Phase 5.5 step 01: collapses to a one-line headline by default. Auto-expands
// once per day (first dashboard load), then stays collapsed for the rest of
// the day once dismissed or scrolled past. Per-day state lives in
// localStorage under `klosure:focusBanner:lastCollapsedDate`.

import { useEffect, useRef, useState } from 'react'
import { extractHeadline, fetchDailyFocus } from '../services/dailyFocus.js'

const STORAGE_KEY = 'klosure:focusBanner:lastCollapsedDate'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function shouldStartExpanded() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(STORAGE_KEY) !== todayKey()
}

export default function DailyFocusBanner() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errored, setErrored] = useState(false)
  const [expanded, setExpanded] = useState(shouldStartExpanded)
  const bannerRef = useRef(null)

  async function load(force = false) {
    if (!data) setLoading(true)
    if (force) setRefreshing(true)
    try {
      const result = await fetchDailyFocus(force)
      setData(result)
      setErrored(false)
    } catch (err) {
      console.warn('daily focus load failed', err)
      setErrored(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function collapse() {
    setExpanded(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, todayKey())
    } catch {
      // localStorage can throw in private mode; collapsing still works in-memory
    }
  }

  function expand() {
    setExpanded(true)
  }

  function toggle() {
    if (expanded) collapse()
    else expand()
  }

  // Auto-collapse once the banner has scrolled fully out of view, so the user
  // doesn't keep paying for a wall of text they've already seen today.
  useEffect(() => {
    if (!expanded) return undefined
    function onScroll() {
      const node = bannerRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      if (rect.bottom < 0) collapse()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [expanded])

  if (loading && !data) {
    return (
      <div className="bg-klo-bg border border-klo/20 rounded-xl px-4 py-4 mb-4 animate-pulse">
        <div className="h-3 w-24 bg-klo/20 rounded mb-3" />
        <div className="h-3 w-full bg-klo/10 rounded mb-1.5" />
        <div className="h-3 w-5/6 bg-klo/10 rounded mb-1.5" />
        <div className="h-3 w-3/4 bg-klo/10 rounded" />
      </div>
    )
  }

  if (errored) return null
  if (!data || !data.focus_text) return null

  const headline = extractHeadline(data.focus_text)

  return (
    <div
      ref={bannerRef}
      className={`bg-klo-bg border border-klo/20 rounded-xl mb-4 overflow-hidden transition-[max-height] duration-200 ease-out ${
        expanded ? 'max-h-[600px] px-4 py-3' : 'max-h-[56px] px-4 py-2'
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left text-[11px]"
      >
        <span className="text-klo font-semibold whitespace-nowrap">◆ Klo · today's focus</span>
        <span className="text-navy/40">·</span>
        <span className="text-navy/50 whitespace-nowrap">{formatWhen(data.generated_at)}</span>
        <span className="ml-auto text-klo text-base leading-none">{expanded ? '⌃' : '⌄'}</span>
      </button>

      {expanded ? (
        <>
          <p className="text-[15px] leading-relaxed text-navy whitespace-pre-line mt-2">
            {data.focus_text}
          </p>
          <div className="mt-2 flex">
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="ml-auto text-[11px] text-klo hover:underline disabled:opacity-50 px-1.5 py-0.5"
            >
              {refreshing ? 'refreshing…' : 'refresh'}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={expand}
          className="block w-full text-left text-[14px] leading-snug text-navy truncate mt-0.5"
        >
          {headline}
        </button>
      )}
    </div>
  )
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString()
}
