import { useMemo } from 'react'

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

function scoreStakeholder(stakeholder) {
  const status = STATUS[stakeholder?.engagement] || STATUS.unknown
  const influence = inferInfluence(stakeholder)
  const urgency = normalizeUrgency(stakeholder?.next_action?.urgency)
  const urgencyScore = urgency === 'high' ? 5 : urgency === 'medium' ? 3 : 1
  return influence * 3 + urgencyScore * 2 + status.urgency
}

function urgencyMeta(stakeholder) {
  const urgency = normalizeUrgency(stakeholder?.next_action?.urgency)
  if (urgency === 'high') {
    return {
      label: 'High urgency',
      chip: 'bg-red-50 text-red-700 border-red-200',
      hint: 'Must engage this week',
    }
  }
  if (urgency === 'medium') {
    return {
      label: 'Medium urgency',
      chip: 'bg-amber-50 text-amber-700 border-amber-200',
      hint: 'Engage soon',
    }
  }
  return {
    label: 'Low urgency',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hint: 'On track',
  }
}

function formatLastTouchpoint(stakeholder) {
  if (stakeholder?.last_touchpoint) return stakeholder.last_touchpoint
  if (stakeholder?.last_contact_at) return `Last touched ${stakeholder.last_contact_at}`
  return 'No recent touchpoint captured'
}

function nextAsk(stakeholder) {
  return stakeholder?.next_action?.action || stakeholder?.next_ask || 'Confirm next step and owner'
}

function guidanceText(stakeholder) {
  if (stakeholder?.guidance) return stakeholder.guidance
  const role = `${stakeholder?.role || ''}`.toLowerCase()
  if (/(cfo|finance|procurement|purchasing|controller)/.test(role)) return 'Needed for budget signoff'
  if (/(security|it|infosec|risk|compliance)/.test(role)) return 'Can unblock security review'
  if (/(legal|counsel)/.test(role)) return 'Can unblock contract and terms review'
  if (/(cto|cio|architecture|architect|engineering)/.test(role)) return 'Can validate technical fit and rollout risk'
  return 'Critical to multi-threading this deal internally'
}

function StakeholderRow({ stakeholder }) {
  const status = STATUS[stakeholder?.engagement] || STATUS.unknown
  const urgency = urgencyMeta(stakeholder)

  return (
    <li className="py-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy truncate" title={stakeholder?.name || 'Unnamed'}>
            {stakeholder?.name || 'Unnamed'}
          </p>
          <p className="text-xs text-navy/60 truncate" title={stakeholder?.role || '—'}>
            {stakeholder?.role || '—'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${status.chip}`}>
            {status.label}
          </span>
          <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${urgency.chip}`}>
            {urgency.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="bg-navy/[0.03] rounded-lg px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-navy/50">Last touchpoint</p>
          <p className="text-xs text-navy mt-0.5">{formatLastTouchpoint(stakeholder)}</p>
        </div>
        <div className="bg-navy/[0.03] rounded-lg px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-navy/50">Next ask</p>
          <p className="text-xs text-navy mt-0.5">{nextAsk(stakeholder)}</p>
        </div>
        <div className="bg-navy/[0.03] rounded-lg px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-navy/50">Priority</p>
          <p className="text-xs text-navy mt-0.5">{urgency.hint}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-navy/70">
          Buyer guidance: <span className="font-medium text-navy">{guidanceText(stakeholder)}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="text-[11px] border border-navy/15 text-navy/70 rounded-full px-2.5 py-1 hover:bg-navy/[0.03]"
            aria-label={`Nudge ${stakeholder?.name || 'stakeholder'}`}
            title="Placeholder quick action"
          >
            Nudge
          </button>
          <button
            type="button"
            className="text-[11px] border border-navy/15 text-navy/70 rounded-full px-2.5 py-1 hover:bg-navy/[0.03]"
            aria-label={`Remind ${stakeholder?.name || 'stakeholder'}`}
            title="Placeholder quick action"
          >
            Remind
          </button>
          <button
            type="button"
            className="text-[11px] border border-navy/15 text-navy/70 rounded-full px-2.5 py-1 hover:bg-navy/[0.03]"
            aria-label={`Escalate ${stakeholder?.name || 'stakeholder'}`}
            title="Placeholder quick action"
          >
            Escalate
          </button>
        </div>
      </div>
    </li>
  )
}

function MustEngage({ people }) {
  if (!people.length) return null
  return (
    <div className="mb-3.5 rounded-xl border border-red-200 bg-red-50/60 p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Must engage this week</p>
      <ul className="mt-2 space-y-1.5">
        {people.map((person, idx) => (
          <li key={`${person?.name ?? 'must'}-${idx}`} className="text-sm text-navy">
            <span className="font-semibold text-navy">{person?.name || 'Unnamed'}</span>{' '}
            <span className="text-navy/60">({person?.role || '—'})</span> — {nextAsk(person)}
          </li>
        ))}
      </ul>
    </div>
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
  const topFive = ranked.slice(0, 5)
  const mustEngage = ranked.filter((s) => normalizeUrgency(s?.next_action?.urgency) === 'high').slice(0, 2)

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-navy/55">{emptyCopy}</p>
        ) : (
          <>
            <MustEngage people={mustEngage} />
            <ul className="divide-y divide-navy/10">
              {topFive.map((s, idx) => (
                <StakeholderRow key={`${s?.name ?? 'x'}-${idx}`} stakeholder={s} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
