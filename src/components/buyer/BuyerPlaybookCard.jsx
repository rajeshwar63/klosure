// Phase 8 — the action card. 3-5 specific moves for the buyer this week.

const PRIORITY_META = {
  critical: {
    label: 'Critical',
    pill: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
  important: {
    label: 'Important',
    pill: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  nice_to_have: {
    label: 'Nice-to-have',
    pill: 'bg-slate-100 text-slate-700 border border-slate-200',
  },
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function getPriorityTier(item) {
  const explicitPriority = normalizeText(item?.priority || item?.priority_tier || item?.metadata?.priority)
  if (['critical', 'important', 'nice_to_have'].includes(explicitPriority)) return explicitPriority
  if (explicitPriority === 'nice-to-have') return 'nice_to_have'

  const actionText = normalizeText(item?.action)
  const whyText = normalizeText(item?.why_it_matters)
  const combined = `${actionText} ${whyText}`

  if (/\b(urgent|blocker|legal|redline|security|exec|approval|contract)\b/.test(combined)) {
    return 'critical'
  }
  if (/\b(alignment|stakeholder|review|prep|timeline|follow up)\b/.test(combined)) {
    return 'important'
  }
  return 'nice_to_have'
}

function getImpactIfDelayed(item, priority) {
  if (item?.impact_if_delayed) return item.impact_if_delayed
  if (item?.delay_impact) return item.delay_impact

  if (priority === 'critical') {
    return 'Deal timeline can slip and executive confidence may drop.'
  }
  if (priority === 'important') {
    return 'Momentum slows and follow-up work increases.'
  }
  return 'Limited near-term impact; can defer if needed.'
}

function getDueState(deadline) {
  if (!deadline) return null
  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) return null

  const now = new Date()
  const msPerDay = 1000 * 60 * 60 * 24
  const daysUntil = Math.ceil((date - now) / msPerDay)
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil <= 3) return 'Due soon'
  return 'Due'
}

export default function BuyerPlaybookCard({ playbook }) {
  const items = playbook ?? []

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5 flex items-center gap-2">
        <span className="text-klo text-base leading-none" aria-hidden>✦</span>
        <h3 className="text-sm font-semibold text-navy">This week's moves</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-6 text-sm text-navy/55">
          No new moves this week — Klo will add items as the deal evolves.
        </div>
      ) : (
        <ul className="divide-y divide-navy/5">
          {items.map((item, idx) => {
            const priority = getPriorityTier(item)
            const priorityMeta = PRIORITY_META[priority]
            const impactIfDelayed = getImpactIfDelayed(item, priority)
            const dueTag = getDueState(item?.deadline)

            return (
              <li key={`${item?.action || 'action'}-${idx}`} className="px-5 py-4">
                <p className="text-[14px] font-medium text-navy leading-snug">{item?.action}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityMeta.pill}`}>
                    {priorityMeta.label}
                  </span>
                  {dueTag && (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-sky-50 text-sky-700 border border-sky-200">
                      {dueTag}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-navy/60 mt-2 leading-snug">
                  Impact: <span className="text-navy/80">{impactIfDelayed}</span>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
