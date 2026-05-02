// Phase A — upcoming-meeting awareness band.
//
// A single quiet line under the DealHeader that surfaces the next upcoming
// meeting tied to this deal. Shows whether Klo will be in the call (🎙) or
// not (📅) — meetings without a recognized provider or where the team's
// quota is full are still surfaced so the user has full near-term agenda
// awareness. The band renders nothing when there's nothing upcoming.

import { useEffect, useState } from 'react'
import {
  loadActiveMeetingsForDeal,
  subscribeMeetingEventsForDeal,
} from '../../services/upcomingMeetings.js'

export default function KloMeetingBand({ dealId }) {
  const [meetings, setMeetings] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!dealId) return
    let cancelled = false
    const refresh = async () => {
      const data = await loadActiveMeetingsForDeal(dealId)
      if (!cancelled) {
        setMeetings(data)
        setLoaded(true)
      }
    }
    refresh()
    const unsubscribe = subscribeMeetingEventsForDeal(dealId, refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [dealId])

  if (!loaded || meetings.length === 0) return null

  const next = meetings[0]
  const extra = meetings.length - 1
  const kloAttending = isKloAttending(next.notetaker_state)

  return (
    <div
      className="px-4 md:px-6 py-2 text-[13px] flex items-center gap-2"
      style={{
        background: 'var(--klo-accent-soft)',
        borderBottom: '1px solid var(--klo-line)',
        color: 'var(--klo-text-dim)',
      }}
      role="status"
    >
      <span aria-hidden className="text-[14px] leading-none">
        {kloAttending ? '🎙' : '📅'}
      </span>
      <span className="truncate">{describeMeeting(next)}</span>
      {extra > 0 && (
        <span className="kl-mono text-[11px] ml-auto shrink-0 text-navy/40">
          + {extra} more
        </span>
      )}
    </div>
  )
}

function isKloAttending(state) {
  return (
    state === 'scheduled' ||
    state === 'joined' ||
    state === 'recording' ||
    state === 'media_processing'
  )
}

function describeMeeting(m) {
  const title = (m.title ?? '').trim() || 'a meeting'
  const when = formatWhen(m.starts_at)
  switch (m.notetaker_state) {
    case 'scheduled':
      return `Klo will join "${title}" — ${when}`
    case 'joined':
      return `Klo is in the call — "${title}"`
    case 'recording':
      return `Klo is recording "${title}" — Klo will post takeaways shortly`
    case 'media_processing':
      return `Transcribing the call "${title}" — Klo will post takeaways shortly`
    case 'skipped_quota':
      return `"${title}" — ${when} (quota full — Klo can't join)`
    case 'not_dispatched':
      return `"${title}" — ${when}`
    default:
      return `"${title}" — ${when}`
  }
}

function formatWhen(iso) {
  if (!iso) return 'soon'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'soon'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  if (sameDay) return `today, ${time}`
  const dateOpts = sameYear
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  const date = d.toLocaleDateString(undefined, dateOpts)
  return `${date}, ${time}`
}
