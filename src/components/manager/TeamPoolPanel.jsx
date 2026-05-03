// =============================================================================
// TeamPoolPanel — Phase A sprint 10
// =============================================================================
// Renders the team-wide meeting capture consumption + per-rep breakdown on
// the manager dashboard. Hidden for solo (seat_count <= 1) teams.
// =============================================================================

import { useEffect, useState } from 'react'
import { loadTeamPool } from '../../services/teamPool.js'

export default function TeamPoolPanel({ teamId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  // Collapsed by default — managers typically check pool usage once a month.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!teamId) return
    loadTeamPool(teamId).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [teamId])

  if (loading) return <Skeleton />
  if (!data || !data.pool) return null
  if (data.pool.seatCount <= 1) return null

  const { pool, byRep } = data

  const usedHours = Math.round((pool.meetingMinutesUsed / 60) * 10) / 10
  const totalHours = Math.round(pool.meetingMinutesTotal / 60)
  const pct = Math.min(100, Math.round(pool.meetingMinutesPct))
  const monthLabel = monthLabelFor(pool.currentPeriodEnd)
  const resetDate = formatResetDate(pool.currentPeriodEnd)

  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-klo'
  const statusText =
    pct >= 100
      ? 'Capture paused — pool exhausted'
      : pct >= 80
        ? 'Approaching pool limit'
        : 'Within pool'
  const statusColor =
    pct >= 100 ? 'text-red-700' : pct >= 80 ? 'text-amber-700' : 'text-emerald-700'

  return (
    <div
      className="bg-white rounded-2xl"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <span className="text-[12px] font-semibold tracking-wider text-navy/55">
          TEAM POOL · {monthLabel}
        </span>
        <span className="text-navy/30">·</span>
        <span className="text-[12px] text-navy/60 tabular-nums">
          {usedHours}h of {totalHours}h ({pct}%)
        </span>
        <span className={`text-[12px] font-semibold ${statusColor}`}>
          {statusText}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-navy/40">
            {pool.seatCount} seat{pool.seatCount !== 1 && 's'}
          </span>
          <span className="text-klo text-base leading-none">
            {expanded ? '⌃' : '⌄'}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          <div>
            <div className="mt-2 h-2 bg-navy/5 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[12px] text-navy/60">
              <span>Meeting capture</span>
              <span>Resets {resetDate}</span>
            </div>
          </div>

          {byRep.length > 0 && (
            <div className="mt-5 pt-4 border-t border-navy/5">
              <div className="text-[11px] font-semibold tracking-wider text-navy/40 mb-2">
                BY REP
              </div>
              <ul className="space-y-2">
                {byRep.map((r) => (
                  <RepRow
                    key={r.user_id}
                    rep={r}
                    totalMinutes={pool.meetingMinutesTotal / pool.seatCount}
                  />
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 text-[11px] text-navy/40">
            Need more capacity?{' '}
            <a href="mailto:rajeshwar@klosure.ai" className="underline">
              Email us
            </a>
            .
          </div>
        </div>
      )}
    </div>
  )
}

function RepRow({ rep, totalMinutes }) {
  const minutes = rep.meeting_minutes ?? 0
  const hours = Math.round((minutes / 60) * 10) / 10
  const pct =
    totalMinutes > 0 ? Math.min(100, Math.round((minutes / totalMinutes) * 100)) : 0
  const overSeat = pct > 100

  return (
    <li className="flex items-center gap-3 text-[13px]">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="font-medium text-navy truncate">
            {rep.user_name || rep.user_email}
          </span>
          <span className="text-navy/50 text-[12px] tabular-nums whitespace-nowrap">
            {hours}h · {rep.meeting_count} call{rep.meeting_count !== 1 && 's'}
          </span>
        </div>
        <div className="mt-1 h-1.5 bg-navy/5 rounded-full overflow-hidden">
          <div
            className={`h-full ${overSeat ? 'bg-amber-500' : 'bg-klo/60'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </li>
  )
}

function Skeleton() {
  return (
    <div
      className="bg-white rounded-2xl p-5 animate-pulse"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="h-3 bg-navy/10 rounded w-1/3 mb-4" />
      <div className="h-2 bg-navy/10 rounded w-full mb-2" />
      <div className="h-2 bg-navy/10 rounded w-1/2" />
    </div>
  )
}

function monthLabelFor(periodEnd) {
  if (!periodEnd) return ''
  return new Date(periodEnd)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase()
}

function formatResetDate(periodEnd) {
  if (!periodEnd) return ''
  const d = new Date(periodEnd)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
