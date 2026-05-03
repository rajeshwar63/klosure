// Meetings list for a deal. Lists every meeting that's been synced (upcoming +
// past), grouped by upcoming/past, with an expandable detail per row that
// shows participants and the transcript. Used as a card inside SellerOverview
// via `embedded`.
//
// Status icon legend:
//   📅  scheduled but Klo not in (or no transcript yet)
//   🎙  Klo in / recorded / transcript ready
//   🚫  cancelled
//
// Deal moments themselves are captured by Klo from the transcript and posted
// to the dealroom feed — this view does not collect them from the seller.

import { useEffect, useMemo, useState } from 'react'
import {
  loadAllMeetingsForDeal,
  subscribeAllMeetingsForDeal,
} from '../services/dealMeetings.js'

const ATTENDED_STATES = new Set(['joined', 'recording', 'media_processing', 'ready'])

function statusIcon(state) {
  if (state === 'cancelled') return '🚫'
  if (ATTENDED_STATES.has(state)) return '🎙'
  return '📅'
}

function statusLabel(state, error) {
  switch (state) {
    case 'scheduled':
      return 'Klo will join'
    case 'joined':
      return 'Klo is in the call'
    case 'recording':
      return 'Recording'
    case 'media_processing':
      return 'Transcribing'
    case 'ready':
      return 'Transcript ready'
    case 'failed':
      return 'Notetaker failed'
    case 'skipped_quota':
      return 'Quota full · Klo not joining'
    case 'cancelled':
      return 'Cancelled'
    case 'not_dispatched':
      if (error === 'no_recognized_provider') return 'No Zoom/Meet/Teams link'
      if (error === 'in_past') return 'Past meeting'
      return 'Klo not joining'
    default:
      return state ?? '—'
  }
}

function formatWhen(iso, durationMinutes) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
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
  const dateStr = sameDay
    ? `Today, ${time}`
    : `${d.toLocaleDateString(undefined, sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}, ${time}`
  return durationMinutes ? `${dateStr} · ${durationMinutes} min` : dateStr
}

function partyShort(participants) {
  if (!Array.isArray(participants) || participants.length === 0) return '—'
  const names = participants.map((p) => p.name || p.email).filter(Boolean)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

export default function DealCalendarTab({ dealId, embedded = false }) {
  const [meetings, setMeetings] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!dealId) return
    let cancelled = false
    const refresh = async () => {
      const data = await loadAllMeetingsForDeal(dealId)
      if (!cancelled) {
        setMeetings(data)
        setLoaded(true)
      }
    }
    refresh()
    const unsubscribe = subscribeAllMeetingsForDeal(dealId, refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [dealId])

  const { upcoming, past } = useMemo(() => {
    const nowMs = Date.now()
    const up = []
    const dn = []
    for (const m of meetings) {
      const startsMs = new Date(m.starts_at).getTime()
      const isUpcoming =
        m.notetaker_state !== 'cancelled' && startsMs >= nowMs - 60 * 60 * 1000
      ;(isUpcoming ? up : dn).push(m)
    }
    // Upcoming sorted ascending (next first); past sorted descending (most recent first).
    up.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    return { upcoming: up, past: dn }
  }, [meetings])

  const skeletonShellClass = embedded
    ? 'px-5 py-5'
    : 'max-w-3xl mx-auto px-4 md:px-6 py-8'
  const emptyShellClass = embedded
    ? 'px-5 py-8 text-center'
    : 'max-w-3xl mx-auto px-4 md:px-6 py-12 text-center'
  const listShellClass = embedded
    ? 'px-5 py-5'
    : 'max-w-3xl mx-auto px-4 md:px-6 py-6'

  if (!loaded) {
    return (
      <div className={skeletonShellClass}>
        <div className="h-20 rounded-xl bg-navy/5 animate-pulse" />
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <div className={emptyShellClass}>
        <p className="text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
          No meetings on this deal yet.
        </p>
        <p className="text-[13px] mt-2" style={{ color: 'var(--klo-text-mute)' }}>
          When you schedule a Zoom/Meet/Teams call with one of this deal's
          stakeholders, it'll show up here. Klo joins by default — don't admit
          her if you'd rather she sit it out.
        </p>
      </div>
    )
  }

  return (
    <div className={listShellClass}>
      {upcoming.length > 0 && (
        <Section
          title="Upcoming"
          meetings={upcoming}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          isLast={past.length === 0}
        />
      )}
      {past.length > 0 && (
        <Section
          title="Past"
          meetings={past}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          isLast
        />
      )}
    </div>
  )
}

function Section({ title, meetings, expandedId, setExpandedId, isLast }) {
  return (
    <section className={isLast ? '' : 'mb-6'}>
      <h3
        className="kl-mono text-[11px] uppercase font-medium mb-2 px-1"
        style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
      >
        {title}
      </h3>
      <ul
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--klo-bg-elev)',
          border: '1px solid var(--klo-line)',
        }}
      >
        {meetings.map((m, idx) => (
          <li
            key={m.id}
            style={{
              borderTop:
                idx === 0 ? 'none' : '1px solid var(--klo-line)',
            }}
          >
            <MeetingRow
              meeting={m}
              expanded={expandedId === m.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === m.id ? null : m.id))
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function MeetingRow({ meeting, expanded, onToggle }) {
  const cancelled = meeting.notetaker_state === 'cancelled'
  const title = (meeting.title ?? '').trim() || 'Meeting'
  const when = formatWhen(meeting.starts_at, meeting.duration_minutes)
  const party = partyShort(meeting.participants)
  const status = statusLabel(meeting.notetaker_state, meeting.processing_error)

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 hover:bg-black/[0.02] flex items-start gap-3"
        aria-expanded={expanded}
      >
        <span aria-hidden className="text-[16px] leading-none mt-0.5">
          {statusIcon(meeting.notetaker_state)}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] truncate"
            style={{
              color: 'var(--klo-text)',
              textDecoration: cancelled ? 'line-through' : 'none',
              fontWeight: 500,
            }}
          >
            {title}
          </div>
          <div
            className="text-[12px] mt-0.5 truncate"
            style={{ color: 'var(--klo-text-dim)' }}
          >
            {when} · {party}
          </div>
        </div>
        <span
          className="kl-mono text-[11px] shrink-0 mt-1"
          style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.04em' }}
        >
          {status}
        </span>
      </button>
      {expanded && <MeetingDetail meeting={meeting} />}
    </div>
  )
}

function MeetingDetail({ meeting }) {
  return (
    <div
      className="px-4 pb-4 pt-1"
      style={{ borderTop: '1px solid var(--klo-line)' }}
    >
      <DetailGrid meeting={meeting} />
      {meeting.transcript_text && (
        <details className="mt-3">
          <summary
            className="kl-mono text-[11px] uppercase cursor-pointer"
            style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
          >
            Transcript
          </summary>
          <pre
            className="mt-2 text-[12px] leading-relaxed whitespace-pre-wrap break-words rounded p-3 max-h-[320px] overflow-auto"
            style={{
              color: 'var(--klo-text-dim)',
              background: 'var(--klo-bg)',
              border: '1px solid var(--klo-line)',
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
          >
            {meeting.transcript_text}
          </pre>
        </details>
      )}
    </div>
  )
}

function DetailGrid({ meeting }) {
  const rows = [
    ['Provider', meeting.meeting_provider ? meeting.meeting_provider : '—'],
    [
      'Link',
      meeting.meeting_url ? (
        <a
          href={meeting.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--klo-accent)' }}
          className="underline truncate inline-block max-w-full align-bottom"
        >
          {meeting.meeting_url}
        </a>
      ) : (
        '—'
      ),
    ],
    ['Matched stakeholder', meeting.matched_stakeholder ?? '—'],
    [
      'Participants',
      Array.isArray(meeting.participants) && meeting.participants.length > 0
        ? meeting.participants.map((p) => p.name || p.email).join(', ')
        : '—',
    ],
  ]
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 mt-3 text-[12px]">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt
            className="kl-mono uppercase"
            style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.04em' }}
          >
            {label}
          </dt>
          <dd
            className="break-words min-w-0"
            style={{ color: 'var(--klo-text)' }}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

