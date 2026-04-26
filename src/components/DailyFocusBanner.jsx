// Phase 5: cross-deal daily coaching paragraph at the top of the dashboard.
// Klo synthesizes the seller's whole active pipeline into one short read of
// where to spend the day. Cached server-side; this component triggers
// regeneration on demand via the refresh button.

import { useEffect, useState } from 'react'
import { fetchDailyFocus } from '../services/dailyFocus.js'

export default function DailyFocusBanner() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errored, setErrored] = useState(false)

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

  return (
    <div className="bg-klo-bg border border-klo/20 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center gap-2 mb-2 text-[11px]">
        <span className="text-klo font-semibold">◆ Klo · today's focus</span>
        <span className="text-navy/40">·</span>
        <span className="text-navy/50">{formatWhen(data.generated_at)}</span>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="ml-auto text-klo hover:underline disabled:opacity-50 px-1.5 py-0.5"
        >
          {refreshing ? 'refreshing…' : 'refresh'}
        </button>
      </div>
      <p className="text-[15px] leading-relaxed text-navy whitespace-pre-line">
        {data.focus_text}
      </p>
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
