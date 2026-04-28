import { useMemo, useState } from 'react'

const STATUS = {
  aligned: {
    label: 'Aligned',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    urgency: 1,
  },
  engaged: {
    label: 'Engaged',
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    urgency: 2,
  },
  quiet: {
    label: 'At Risk',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    urgency: 3,
  },
  blocker: {
    label: 'Blocked',
    chip: 'bg-red-50 text-red-700 border-red-200',
    urgency: 4,
  },
  unknown: {
    label: 'At Risk',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    urgency: 3,
  },
}

const INVOLVEMENT_OPTIONS = ['Signer', 'Champion', 'Influencer', 'Evaluator']
const URGENCY_BADGE = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
}

function initialsFor(name) {
  const source = (name || '?').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function inferInvolvement(stakeholder) {
  const explicit = stakeholder?.involvement
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.filter((x) => INVOLVEMENT_OPTIONS.includes(x)).slice(0, 4)
  }
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit
      .split(',')
      .map((x) => x.trim())
      .filter((x) => INVOLVEMENT_OPTIONS.includes(x))
      .slice(0, 4)
  }

  const haystack = `${stakeholder?.role || ''} ${stakeholder?.klo_note || ''}`.toLowerCase()
  const inferred = []
  if (/(sign|approve|final approv|procurement|legal)/.test(haystack)) inferred.push('Signer')
  if (/(champion|owner|sponsor)/.test(haystack)) inferred.push('Champion')
  if (/(influenc|vp|director|head of|exec|cto|cfo|ceo)/.test(haystack)) inferred.push('Influencer')
  if (/(evaluat|architect|security|it|review)/.test(haystack)) inferred.push('Evaluator')

  if (inferred.length === 0) return ['Influencer']
  return Array.from(new Set(inferred)).slice(0, 4)
}

function inferInfluence(stakeholder) {
  if (typeof stakeholder?.influence === 'number') return stakeholder.influence
  const role = `${stakeholder?.role || ''}`.toLowerCase()
  if (/(chief|ceo|cto|cfo|coo|president|svp|vp|head)/.test(role)) return 5
  if (/(director|lead|manager)/.test(role)) return 4
  if (/(architect|legal|procurement|security)/.test(role)) return 3
  return 2
}

function normalizeUrgency(value) {
  const v = `${value || ''}`.toLowerCase()
  if (v === 'high' || v === 'urgent') return 'high'
  if (v === 'medium') return 'medium'
  return 'low'
}

function formatDueDate(dateIso) {
  if (!dateIso) return 'No due date'
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return 'No due date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
}

function daysUntil(dateIso) {
  if (!dateIso) return null
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

function inferNextAction(stakeholder) {
  const explicit = stakeholder?.next_action
  const action = {
    text: explicit?.text || 'Confirm position and unblock decision path',
    owner: explicit?.owner || 'You',
    due_date: explicit?.due_date || null,
    urgency: normalizeUrgency(explicit?.urgency),
  }
  const dueIn = daysUntil(action.due_date)
  if (dueIn !== null && dueIn <= 2) action.urgency = 'high'
  else if (dueIn !== null && dueIn <= 5 && action.urgency !== 'high') action.urgency = 'medium'
  return action
}

function scoreStakeholder(stakeholder) {
  const status = STATUS[stakeholder?.engagement] || STATUS.unknown
  const influence = inferInfluence(stakeholder)
  const action = inferNextAction(stakeholder)
  const urgencyScore = action.urgency === 'high' ? 5 : action.urgency === 'medium' ? 3 : 1
  return influence * 3 + urgencyScore * 2 + status.urgency
}

function IconButton({ label, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-navy/15 text-navy/70 hover:text-klo hover:border-klo/40 hover:bg-klo/5 transition"
    >
      {children}
    </button>
  )
}

function StakeholderCard({ stakeholder }) {
  const [expanded, setExpanded] = useState(false)
  const status = STATUS[stakeholder?.engagement] || STATUS.unknown
  const involvement = inferInvolvement(stakeholder)
  const nextAction = inferNextAction(stakeholder)
  const urgencyBadge = URGENCY_BADGE[nextAction.urgency] || URGENCY_BADGE.low

  return (
    <article
      className="rounded-xl border border-navy/15 bg-white px-4 py-3 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-navy/30 focus-within:-translate-y-0.5 focus-within:shadow-md focus-within:border-navy/30"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-klo/15 text-klo text-xs font-semibold flex items-center justify-center shrink-0">
            {initialsFor(stakeholder?.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy truncate" title={stakeholder?.name || 'Unnamed'}>
              {stakeholder?.name || 'Unnamed'}
            </p>
            <p
              className={`text-[12px] text-navy/60 leading-snug ${expanded ? '' : 'line-clamp-2'}`}
              title={stakeholder?.role || '—'}
            >
              {stakeholder?.role || '—'}
            </p>
          </div>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full border ${status.chip}`}>
          {status.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {involvement.map((tag) => (
          <span
            key={tag}
            className="text-[11px] px-2 py-0.5 rounded-full bg-navy/5 border border-navy/10 text-navy/70"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="rounded-lg border border-navy/10 bg-[#f8f9fc] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy/55">Next action</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${urgencyBadge}`}>
            {nextAction.urgency}
          </span>
        </div>
        <p className="text-[12px] text-navy/80 line-clamp-2" title={nextAction.text}>{nextAction.text}</p>
        <div className="mt-1 text-[11px] text-navy/55 flex items-center gap-1.5">
          <span className="font-medium">{nextAction.owner}</span>
          <span aria-hidden>•</span>
          <span>Due {formatDueDate(nextAction.due_date)}</span>
        </div>
      </div>

      {stakeholder?.klo_note && (
        <div>
          <p
            className={`text-[12px] text-navy/65 italic leading-snug ${expanded ? '' : 'line-clamp-2'}`}
            title={stakeholder.klo_note}
          >
            {stakeholder.klo_note}
          </p>
          <button
            type="button"
            className="mt-1 text-[11px] text-klo font-medium"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'Expand'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-1">
        <IconButton label="Message stakeholder">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
            <path d="M3.5 5.5h13v7h-8l-3.5 3v-3h-1.5z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </IconButton>
        <IconButton label="Assign task">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
            <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3.5" y="3.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </IconButton>
        <IconButton label="Log note">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
            <path d="M5 4.5h10v11H5z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 8h6M7 11h6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </IconButton>
      </div>
    </article>
  )
}

export default function BuyerStakeholderMap({
  stakeholders,
  title = 'Your team on this deal',
  emptyCopy = 'Klo will identify your internal stakeholders as they appear in your conversations with the vendor.',
}) {
  const items = stakeholders ?? []

  const ranked = useMemo(
    () => [...items].sort((a, b) => scoreStakeholder(b) - scoreStakeholder(a)),
    [items],
  )
  const topThree = ranked.slice(0, 3)
  const remaining = ranked.slice(3)

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-navy/55">{emptyCopy}</p>
        ) : (
          <div className="space-y-4">
            <section>
              <p className="text-[11px] font-semibold tracking-wide text-navy/50 uppercase mb-2">Top priorities</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {topThree.map((s, idx) => (
                  <StakeholderCard key={`${s?.name ?? 'x'}-priority-${idx}`} stakeholder={s} />
                ))}
              </div>
            </section>
            {remaining.length > 0 && (
              <section>
                <p className="text-[11px] font-semibold tracking-wide text-navy/50 uppercase mb-2">Other stakeholders</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {remaining.map((s, idx) => (
                    <StakeholderCard key={`${s?.name ?? 'x'}-other-${idx}`} stakeholder={s} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
