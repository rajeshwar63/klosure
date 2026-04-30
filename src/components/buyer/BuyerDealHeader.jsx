// Phase 8 — buyer dashboard header. Action-first framing with urgency, quick
// readiness indicators, and immediate CTA actions.

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../../lib/format.js'

function diffDays(targetISO) {
  if (!targetISO) return null
  const target = new Date(targetISO)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((target - now) / 86400000)
}

function formatGoLive(dateISO) {
  if (!dateISO) return null
  const d = new Date(dateISO)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function firstSentence(text) {
  if (!text || typeof text !== 'string') return null
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  const match = cleaned.match(/.+?[.!?](?:\s|$)/)
  return (match ? match[0] : cleaned).trim()
}

function inferReadiness(label, tasks, blockers) {
  const terms = {
    approvals: ['approval', 'approve', 'budget', 'procurement', 'sign-off', 'signoff'],
    legal: ['legal', 'msa', 'dpa', 'contract', 'redline'],
    security: ['security', 'infosec', 'soc 2', 'soc2', 'questionnaire', 'pen test', 'pentest'],
  }

  const words = terms[label] || []
  const hitIn = (text) => {
    const lower = String(text || '').toLowerCase()
    return words.some((w) => lower.includes(w))
  }

  const blocked = blockers.some((b) => hitIn(b?.text))
  if (blocked) return { tone: 'risk', label: 'Blocked' }

  const pending = tasks.some((t) => hitIn(t?.task) && t?.status !== 'done')
  if (pending) return { tone: 'progress', label: 'In progress' }

  const done = tasks.some((t) => hitIn(t?.task) && t?.status === 'done')
  if (done) return { tone: 'good', label: 'Ready' }

  return { tone: 'neutral', label: 'No signal' }
}

const READINESS_TONE = {
  risk: 'bg-red-50 text-red-700 border-red-200',
  progress: 'bg-amber-50 text-amber-700 border-amber-200',
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
}

export default function BuyerDealHeader({ deal }) {
  const ks = deal?.klo_state ?? {}
  const buyerView = ks.buyer_view ?? null
  const valueAmount = ks.deal_value?.amount ?? deal?.value ?? null
  const goLive = ks.deadline?.date ?? deal?.deadline ?? null
  const blockers = ks.blockers ?? []

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!goLive) return undefined
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [goLive])

  const daysLeft = diffDays(goLive)
  const goLiveLabel = formatGoLive(goLive)
  const title = deal?.title || 'Deal'

  const nextBestAction = useMemo(() => {
    const briefLine = firstSentence(buyerView?.klo_brief_for_buyer)
    if (briefLine) return briefLine
    const firstPlaybook = buyerView?.playbook?.[0]
    if (firstPlaybook?.action) return firstPlaybook.action
    return 'Confirm your next internal decision step and owner today.'
  }, [buyerView])

  const urgencyLabel = (() => {
    if (daysLeft === null) return 'Set a go-live date to align internal teams.'
    const hasUnresolvedBlockers = blockers.length > 0
    if (hasUnresolvedBlockers) {
      if (daysLeft < 0) return `Go-live risk overdue by ${Math.abs(daysLeft)} days`
      if (daysLeft === 0) return 'Go-live risk is today — unresolved blockers remain'
      return `Go-live risk in ${daysLeft} days`
    }
    if (daysLeft < 0) return `Go-live passed ${Math.abs(daysLeft)} days ago`
    if (daysLeft === 0) return 'Go-live is today'
    return `${daysLeft} days to go-live`
  })()

  const taskPool = [...(ks.pending_on_buyer ?? []), ...(ks.pending_on_seller ?? [])]
  const readiness = [
    { key: 'approvals', label: 'Approvals', state: inferReadiness('approvals', taskPool, blockers) },
    { key: 'legal', label: 'Legal', state: inferReadiness('legal', taskPool, blockers) },
    { key: 'security', label: 'Security', state: inferReadiness('security', taskPool, blockers) },
  ]

  // Mark `now` as used so eslint doesn't warn — the value drives re-renders.
  void now

  return (
    <div className="border-b border-navy/10 bg-white">
      <div className="max-w-[1080px] mx-auto px-6 py-5 space-y-3">
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-navy/45">{title}</p>
          <h1 className="text-lg md:text-xl font-semibold text-navy tracking-tight">
            Next best action: {nextBestAction}
          </h1>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm text-navy/65 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            {valueAmount != null && <span>{formatCurrency(valueAmount)}</span>}
            {valueAmount != null && goLiveLabel && <span className="text-navy/30">·</span>}
            {goLiveLabel ? <span>Go-live {goLiveLabel}</span> : <span>No go-live date set</span>}
            <span className="text-navy/30">·</span>
            <span className="text-navy/70">{urgencyLabel}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
              const shareTitle = `Klosure deal room: ${title}`
              const shareText = `Sharing the Klosure deal room for ${title}. Latest status, blockers, and next steps are kept up to date here:`
              if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                try {
                  await navigator.share({ title: shareTitle, text: shareText, url: shareUrl })
                  return
                } catch {
                  // fall through to mailto fallback
                }
              }
              const subject = encodeURIComponent(shareTitle)
              const body = encodeURIComponent(`${shareText}\n\n${shareUrl}`)
              window.location.href = `mailto:?subject=${subject}&body=${body}`
            }}
            className="rounded-md bg-navy text-white text-sm font-medium px-3 py-2 hover:bg-navy/90 w-full md:w-auto md:min-w-[200px] md:flex-shrink-0"
          >
            Share with Internal Team
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {readiness.map((item) => (
              <div
                key={item.key}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${READINESS_TONE[item.state.tone]}`}
              >
                <span className="font-medium">{item.label}</span>
                <span className="opacity-80">{item.state.label}</span>
              </div>
            ))}
          </div>
          <a
            href="https://klosure.ai"
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline text-[11px] uppercase tracking-wider text-navy/30 hover:text-navy/60"
          >
            Powered by Klosure
          </a>
        </div>
      </div>
    </div>
  )
}
