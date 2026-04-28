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

function StakeholderRow({ stakeholder }) {
  return (
    <li className="py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy truncate" title={stakeholder?.name || 'Unnamed'}>
          {stakeholder?.name || 'Unnamed'}
        </p>
        <p className="text-xs text-navy/60 truncate" title={stakeholder?.role || '—'}>
          {stakeholder?.role || '—'}
        </p>
      </div>
    </li>
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

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-navy/55">{emptyCopy}</p>
        ) : (
          <ul className="divide-y divide-navy/10">
            {topFive.map((s, idx) => (
              <StakeholderRow key={`${s?.name ?? 'x'}-${idx}`} stakeholder={s} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
