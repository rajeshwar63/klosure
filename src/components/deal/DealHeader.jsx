// Phase 6 step 08 + Phase 9 step 08 — dark header at the top of the deal
// page. Title + health dot + optional "Stuck · Nw" chip + Share. Win/Lost
// stay top because they're status changes; Archive/Delete moved to a
// danger-zone footer at the bottom of the deal page.
// Subtitle line: company · stage · value · deadline.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDeadline } from '../../lib/format.js'
import { formatNextMeeting, isMeetingPast } from '../../services/meetingFormat.js'
import { LOSS_REASONS } from '../../services/archive.js'

const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed',
}

const HEALTH_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

function CalendarIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function NextMeetingChip({ meeting }) {
  if (!meeting?.date) return null
  if (isMeetingPast(meeting)) return null
  const display = formatNextMeeting(meeting)
  if (!display) return null
  const tentative = meeting.confidence === 'tentative'
  const style = tentative
    ? { background: '#85B7EB', color: '#042C53' }
    : { background: '#185FA5', color: '#FFFFFF' }
  return (
    <span
      className="px-3 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
      style={style}
      title={
        tentative
          ? 'Tentative — not yet confirmed by both sides'
          : 'Confirmed'
      }
    >
      <CalendarIcon />
      {display}
    </span>
  )
}

function weeksAt(deal) {
  // Treat the last update as the closest signal we have for "how long this
  // deal has been at this state". Phase 7 will replace with a real
  // stage_changed_at timestamp.
  const ts = deal?.updated_at || deal?.created_at
  if (!ts) return 0
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24 * 7))
}

export default function DealHeader({
  deal,
  viewerRole = 'seller',
  canShare = false,
  onShare,
  onWin,
  onLost,
  onReopen,
}) {
  const stuck = weeksAt(deal)
  const showStuck = stuck >= 2 && deal?.health !== 'green'
  const stage = STAGE_LABEL[deal?.klo_state?.stage ?? deal?.stage] ?? '—'
  const value =
    deal?.klo_state?.deal_value?.amount ?? deal?.value ?? null
  const nextMeeting = deal?.klo_state?.next_meeting ?? null
  const isSeller = viewerRole === 'seller'
  const locked = !!deal?.locked

  const [submitting, setSubmitting] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const lostPopoverRef = useRef(null)
  const lostButtonRef = useRef(null)

  useEffect(() => {
    if (!lostOpen) return
    function onMouseDown(e) {
      if (
        lostPopoverRef.current?.contains(e.target) ||
        lostButtonRef.current?.contains(e.target)
      ) {
        return
      }
      setLostOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [lostOpen])

  async function withSubmitting(fn) {
    if (submitting) return
    setSubmitting(true)
    try {
      await fn()
    } finally {
      setSubmitting(false)
    }
  }

  function handleWinClick() {
    setLostOpen(false)
    withSubmitting(async () => {
      await onWin?.()
    })
  }

  function handleLostPick(reason) {
    setLostOpen(false)
    withSubmitting(async () => {
      await onLost?.(reason)
    })
  }

  function handleReopenClick() {
    withSubmitting(async () => {
      await onReopen?.()
    })
  }

  return (
    <header
      className="text-white px-4 md:px-5 py-3 shrink-0"
      style={{ background: '#2C2C2A' }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[deal?.health] ?? 'bg-emerald-500'}`}
          aria-hidden
        />
        <h1 className="text-base font-medium truncate min-w-0">{deal?.title}</h1>

        {showStuck && (
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{ background: '#FAC775', color: '#412402' }}
          >
            ⚠ Stuck · {stuck}w
          </span>
        )}

        <NextMeetingChip meeting={nextMeeting} />

        <div className="ml-auto flex gap-2 shrink-0 items-center flex-wrap">
          {isSeller && !locked && (
            <>
              <button
                type="button"
                onClick={handleWinClick}
                disabled={submitting}
                className="px-3 py-1 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50"
              >
                Win
              </button>
              <div className="relative">
                <button
                  type="button"
                  ref={lostButtonRef}
                  onClick={() => setLostOpen((v) => !v)}
                  disabled={submitting}
                  aria-haspopup="menu"
                  aria-expanded={lostOpen}
                  className="px-3 py-1 rounded-md text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
                >
                  Lost
                </button>
                {lostOpen && (
                  <div
                    ref={lostPopoverRef}
                    role="menu"
                    className="absolute right-0 mt-1 z-20 w-56 bg-white text-navy rounded-lg shadow-xl border border-navy/10 py-1"
                  >
                    <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider font-semibold text-navy/50">
                      Why was it lost?
                    </p>
                    {LOSS_REASONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        role="menuitem"
                        onClick={() => handleLostPick(r.value)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-navy/5"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {isSeller && locked && (
            <button
              type="button"
              onClick={handleReopenClick}
              disabled={submitting}
              className="px-3 py-1 rounded-md text-xs border border-white/30 bg-transparent text-white hover:bg-white/10 disabled:opacity-50"
            >
              Reopen
            </button>
          )}

          {viewerRole === 'seller' && canShare && (
            <button
              type="button"
              onClick={onShare}
              className="px-3 py-1 rounded-md text-xs border border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              Share
            </button>
          )}
          {viewerRole === 'seller' && !canShare && (
            <Link
              to="/billing"
              className="px-3 py-1 rounded-md text-xs border border-white/30 bg-transparent text-white/80 hover:bg-white/10"
              title="Upgrade to share with buyers"
            >
              Share · Pro
            </Link>
          )}
        </div>
      </div>

      <p className="text-xs text-white/60 mt-1 truncate">
        {[
          deal?.buyer_company,
          stage,
          formatCurrency(value),
          deal?.deadline ? `Deadline ${formatDeadline(deal.deadline)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </header>
  )
}
