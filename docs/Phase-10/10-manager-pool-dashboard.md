# Sprint 10 — Manager pool dashboard

**Sprint:** 10 of 11
**Estimated:** 1 day
**Goal:** Add a pool-usage section to the existing manager dashboard. Shows team-wide meeting consumption, per-rep breakdown, and the current month's reset date. Wires into the `get_team_pool` and `get_team_usage_by_rep` SQL helpers from sprints 02 and 07.

## Why this matters

This sprint hits the third roadmap acceptance criterion: **"Manager dashboard shows team-level pool usage with per-rep breakdown."**

Without this view, the manager has no idea Klosure is approaching the pool limit until the 80% notification email arrives. With it, the manager can proactively reallocate (e.g. "Sarah is at 14h this month, way over her usual — what's going on?"). It also makes the per-seat pricing make sense visually: "I'm paying for 5 seats, getting 5 × 15h = 75h of meetings, and we're at 60h."

## What ships

1. New component `src/components/manager/TeamPoolPanel.jsx`
2. New service function `loadTeamPool` in `src/services/teamPool.js`
3. Insertion into the existing `ManagerDashboardPage.jsx` (or wherever the manager view lives)

## Layout

```
┌─────────────────────────────────────────────────────┐
│ TEAM POOL · MAY 2026                                 │
│                                                      │
│ Meeting capture                                      │
│ ████████████░░░░░░░░  60 of 75 hours  ·  80%        │
│ Pool resets June 1                                   │
│                                                      │
│ ┌──────────────────────────────────────────────┐    │
│ │ Sarah Khan      ▓▓▓▓▓▓▓▓░░  14h  · 12 calls  │    │
│ │ Ahmed Al-Mansoori ▓▓▓▓▓░░░░░  8h  · 6 calls   │    │
│ │ Priya Patel    ▓▓▓░░░░░░░  5h  · 4 calls     │    │
│ │ Rajeshwar      ▓░░░░░░░░░  2h  · 2 calls     │    │
│ └──────────────────────────────────────────────┘    │
│                                                      │
│ Need more capacity? Email rajeshwar@klosure.ai       │
└─────────────────────────────────────────────────────┘
```

If `seat_count == 1` (solo user), this whole panel is hidden (sprint 7 also fail-opens for solo) — until they add a seat, the pool view is meaningless to them.

## Service function

Path: `src/services/teamPool.js`

```javascript
// =============================================================================
// Team pool service — Phase A sprint 10
// =============================================================================
import { supabase } from '../lib/supabase.js'

export async function loadTeamPool(teamId) {
  if (!teamId) return null

  const { data: poolData, error: poolErr } = await supabase
    .rpc('get_team_pool', { p_team_id: teamId })

  if (poolErr) {
    console.error('get_team_pool failed', poolErr)
    return null
  }
  const pool = (poolData ?? [])[0] ?? null
  if (!pool) return null

  const { data: byRepData, error: repErr } = await supabase
    .rpc('get_team_usage_by_rep', { p_team_id: teamId })

  if (repErr) {
    console.warn('get_team_usage_by_rep failed', repErr)
  }

  return {
    pool: {
      teamId: pool.team_id,
      seatCount: pool.seat_count,
      meetingMinutesTotal: pool.meeting_minutes_total,
      meetingMinutesUsed: pool.meeting_minutes_used,
      meetingMinutesPct: Number(pool.meeting_minutes_pct),
      voiceMinutesTotal: pool.voice_minutes_total,
      voiceMinutesUsed: pool.voice_minutes_used,
      chatMessagesTotal: pool.chat_messages_total,
      chatMessagesUsed: pool.chat_messages_used,
      notified80At: pool.notified_80_at,
      notified100At: pool.notified_100_at,
      currentPeriodEnd: pool.current_period_end,
    },
    byRep: byRepData ?? [],
  }
}
```

## TeamPoolPanel component

Path: `src/components/manager/TeamPoolPanel.jsx`

```jsx
// =============================================================================
// TeamPoolPanel — Phase A sprint 10
// =============================================================================
import { useEffect, useState } from 'react'
import { loadTeamPool } from '../../services/teamPool.js'

export default function TeamPoolPanel({ teamId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teamId) return
    loadTeamPool(teamId).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [teamId])

  if (loading) return <Skeleton />
  if (!data || !data.pool) return null
  // Solo: hide the panel entirely. Pool view doesn't help a 1-seat team.
  if (data.pool.seatCount <= 1) return null

  const { pool, byRep } = data

  const usedHours = Math.round(pool.meetingMinutesUsed / 60 * 10) / 10
  const totalHours = Math.round(pool.meetingMinutesTotal / 60)
  const pct = Math.min(100, Math.round(pool.meetingMinutesPct))
  const monthLabel = monthLabelFor(pool.currentPeriodEnd)
  const resetDate = formatResetDate(pool.currentPeriodEnd)

  // Color-code at 80% / 100%.
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-klo'
  const statusText = pct >= 100
    ? 'Capture paused — pool exhausted'
    : pct >= 80
      ? 'Approaching pool limit'
      : 'Within pool'

  return (
    <div className="bg-white rounded-2xl p-5"
         style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}>
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-[12px] font-semibold tracking-wider text-navy/55">
          TEAM POOL · {monthLabel}
        </span>
        <span className="text-[11px] text-navy/40">
          {pool.seatCount} seat{pool.seatCount !== 1 && 's'}
        </span>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-medium text-navy">Meeting capture</span>
          <span className={`text-[12px] font-semibold ${pct >= 100 ? 'text-red-700' : pct >= 80 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {statusText}
          </span>
        </div>
        <div className="mt-2 h-2 bg-navy/5 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[12px] text-navy/60">
          <span>{usedHours}h of {totalHours}h ({pct}%)</span>
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
              <RepRow key={r.user_id} rep={r} totalMinutes={pool.meetingMinutesTotal / pool.seatCount} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 text-[11px] text-navy/40">
        Need more capacity? <a href="mailto:rajeshwar@klosure.ai" className="underline">Email us</a>.
      </div>
    </div>
  )
}

function RepRow({ rep, totalMinutes }) {
  const minutes = rep.meeting_minutes ?? 0
  const hours = Math.round(minutes / 60 * 10) / 10
  // Per-rep bar is normalised against per-seat allotment, not team total.
  const pct = totalMinutes > 0 ? Math.min(100, Math.round((minutes / totalMinutes) * 100)) : 0
  const overSeat = pct > 100  // theoretical — they used more than their per-seat share

  return (
    <li className="flex items-center gap-3 text-[13px]">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="font-medium text-navy truncate">{rep.user_name || rep.user_email}</span>
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
    <div className="bg-white rounded-2xl p-5 animate-pulse"
         style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}>
      <div className="h-3 bg-navy/10 rounded w-1/3 mb-4" />
      <div className="h-2 bg-navy/10 rounded w-full mb-2" />
      <div className="h-2 bg-navy/10 rounded w-1/2" />
    </div>
  )
}

function monthLabelFor(periodEnd) {
  if (!periodEnd) return ''
  return new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
}

function formatResetDate(periodEnd) {
  if (!periodEnd) return ''
  const d = new Date(periodEnd)
  d.setDate(d.getDate() + 1)  // pool resets the day AFTER period_end
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

## Insertion into manager dashboard

Find the existing manager dashboard. It's in `src/pages/ManagerDashboardPage.jsx` (or similar — search for `loadTeamPipeline` calls). Add the panel near the top, above the pipeline list:

```jsx
import TeamPoolPanel from '../components/manager/TeamPoolPanel.jsx'

// Inside the render, replacing or augmenting the existing layout:

<div className="grid lg:grid-cols-3 gap-4 mb-6">
  <div className="lg:col-span-2">
    {/* existing pipeline-summary content */}
  </div>
  <div>
    <TeamPoolPanel teamId={team?.id} />
  </div>
</div>

<div>
  {/* existing deal list */}
</div>
```

If the dashboard layout doesn't have a side column, put it between the header and the deal list as a full-width row. The component is responsive — it works in any width.

## Real-time-ish refresh

The pool data updates each time a meeting completes (sprint 06 increments the pool). The manager dashboard doesn't subscribe to pool changes in real-time — that's overkill. Refresh the panel:
- On mount (already done by `useEffect`)
- When the manager navigates back to the page (handled by React Router's mount cycle)
- Optionally, a "Refresh" button if a customer asks (don't pre-build it)

## Acceptance

- [ ] `loadTeamPool(teamId)` returns shape `{ pool, byRep }` with correct numbers
- [ ] `TeamPoolPanel` renders for teams with seat_count > 1
- [ ] `TeamPoolPanel` is hidden for solo teams (seat_count = 1)
- [ ] Bar color changes at 80% (amber) and 100% (red)
- [ ] Per-rep rows are sorted by minutes consumed descending
- [ ] A rep with zero meetings still appears (with a 0h bar)
- [ ] Reset date displays correctly (1st of next month)
- [ ] Page loads in <500ms (the two RPCs are simple aggregates)
- [ ] Test with simulated data:
  ```sql
  -- Insert fake usage rows
  insert into meeting_usage (team_id, user_id, duration_minutes)
    select '<team-id>', user_id, 120 from team_members where team_id = '<team-id>';
  -- Update pool counters
  update team_pool set current_meeting_minutes = (
    select sum(duration_minutes) from meeting_usage where team_id = '<team-id>'
  ) where team_id = '<team-id>';
  ```
  Then load the dashboard — counts and bars should reflect the inserted data.

## Pitfalls

- **`get_team_usage_by_rep` returns 0-minute rows for reps who haven't had any meetings**. That's intentional — managers want to see who's NOT using meeting capture too. But the bar will be 0% wide and a 0h text. Acceptable; if it looks weird, render a dash instead of "0h · 0 calls".

- **Voice and chat columns exist in `team_pool` but aren't surfaced** in this sprint. Voice ships in Phase F; chat throttling is deferred. If a customer asks "what's the chat number?" before then, just tell them it's not enforced yet.

- **The `currentPeriodEnd` is the LAST DAY of the month**, e.g. `2026-05-31`. The pool resets at midnight UTC on `2026-06-01`. The "Resets June 1" label adds 1 day to display correctly.

- **If `pool.meetingMinutesPct` is `null` from the SQL function** (edge case: division by zero when seat_count is 0), the `Number(null)` becomes 0. Confirm the `case when seat_count = 0 then 0` branch in `get_team_pool` does the right thing.

- **Manager who is also a rep**: the `byRep` list includes managers because they're in `team_members`. Correct — managers also schedule meetings sometimes.

## What this sprint does NOT do

- Per-deal breakdown ("which deals consumed the most meeting time?") — Phase B
- Historical trend ("we used 50h last month, 60h this month") — Phase B
- Capacity recommendations ("you should add 2 more seats") — Phase D
- Self-service capacity adjustment — Phase B (currently it's an email-the-founder flow)

→ Next: `11-acceptance-walkthrough.md`
