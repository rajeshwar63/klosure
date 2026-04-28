function titleCase(text) {
  return String(text || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDueDate(dateIso) {
  if (!dateIso) return 'No due date'
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return 'No due date'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function deriveMilestones(kloState) {
  const stageLabel = kloState?.stage ? titleCase(kloState.stage) : null

  const fromStage = stageLabel
    ? [{ label: stageLabel, owner: 'Deal owner', dueDate: kloState?.deadline?.date ?? null, type: 'current-stage' }]
    : []

  const fromActions = (kloState?.next_actions ?? [])
    .filter((a) => a?.action)
    .map((a) => ({
      label: a.action,
      owner: a.owner || 'Deal owner',
      dueDate: a.due_date || a.deadline || null,
      type: 'action',
    }))

  const fromDecisions = (kloState?.decisions ?? [])
    .filter((d) => d?.what)
    .map((d) => ({
      label: d.what,
      owner: d.owner || d.who || 'Stakeholder',
      dueDate: d.due_date || d.by || null,
      type: 'decision',
    }))

  const fromQuestions = (kloState?.open_questions ?? [])
    .filter((q) => q?.text)
    .map((q) => ({
      label: `Clarify: ${q.text}`,
      owner: q.owner || 'Deal owner',
      dueDate: q.due_date || null,
      type: 'question',
    }))

  const fromBlockers = (kloState?.blockers ?? [])
    .filter((b) => b?.text)
    .map((b) => ({
      label: `Resolve: ${b.text}`,
      owner: b.owner || 'Deal owner',
      dueDate: b.due_date || null,
      type: 'blocked',
    }))

  const fromSignals = [...fromStage, ...fromActions, ...fromDecisions, ...fromQuestions, ...fromBlockers]

  const unique = []
  for (const signal of fromSignals) {
    const trimmed = signal?.label?.trim()
    if (!trimmed) continue
    if (unique.some((s) => s.label.toLowerCase() === trimmed.toLowerCase())) continue
    unique.push({ ...signal, label: trimmed })
  }

  return unique.slice(0, 5)
}

function stateForMilestone(milestone, idx, currentIdx) {
  if (milestone?.type === 'blocked') return 'blocked'
  if (idx < currentIdx) return 'completed'
  if (idx === currentIdx) return 'current'
  if (idx === currentIdx + 1) return 'next'
  return 'upcoming'
}

const STATE_STYLES = {
  completed: {
    node: 'bg-slate-100 border-slate-300 text-slate-700',
    title: 'text-navy/80',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    connector: 'bg-slate-300',
    icon: '✓',
    legend: 'Completed',
  },
  current: {
    node: 'bg-klo border-klo text-white shadow-sm shadow-klo/25',
    title: 'text-klo font-semibold',
    badge: 'bg-klo text-white border-klo/90',
    connector: 'bg-klo/40',
    icon: '●',
    legend: 'Current',
  },
  next: {
    node: 'bg-white border-klo/60 text-klo',
    title: 'text-klo/90',
    badge: 'bg-klo/10 text-klo border-klo/20',
    connector: 'bg-klo/25',
    icon: '○',
    legend: 'Next',
  },
  blocked: {
    node: 'bg-rose-50 border-rose-300 text-rose-700',
    title: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    connector: 'bg-rose-300',
    icon: '⚠',
    legend: 'Blocked',
  },
  upcoming: {
    node: 'bg-white border-navy/20 text-navy/50',
    title: 'text-navy/65',
    badge: 'bg-navy/[0.03] text-navy/55 border-navy/15',
    connector: 'bg-navy/15',
    icon: '·',
    legend: 'Upcoming',
  },
}

function MilestoneLegend() {
  const order = ['completed', 'current', 'next', 'blocked']
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-navy/55 mt-3" title="Milestone state legend: completed, current, next, blocked, and upcoming.">
      {order.map((state) => {
        const style = STATE_STYLES[state]
        return (
          <span key={state} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${style.badge}`}>
            <span className="text-[11px] leading-none">{style.icon}</span>
            <span>{style.legend}</span>
          </span>
        )
      })}
    </div>
  )
}

export default function SellerTimelineStrip({ kloState }) {
  const milestones = deriveMilestones(kloState)

  if (milestones.length === 0) {
    return (
      <div className="bg-white border border-navy/10 rounded-2xl px-5 py-5">
        <h3 className="text-sm font-semibold text-navy mb-2">Deal milestones</h3>
        <p className="text-xs text-navy/55">Milestones are unavailable right now. Add stage updates, actions, or blockers to generate a timeline.</p>
      </div>
    )
  }

  const blockedIdx = milestones.findIndex((m) => m.type === 'blocked')
  const currentIdx = blockedIdx !== -1 ? Math.max(0, blockedIdx - 1) : 0

  return (
    <div className="bg-white border border-navy/10 rounded-2xl px-5 py-5">
      <h3 className="text-sm font-semibold text-navy mb-4">Deal milestones</h3>

      <div className="md:hidden">
        <ol className="flex flex-col gap-3">
          {milestones.map((milestone, idx) => {
            const state = stateForMilestone(milestone, idx, currentIdx)
            const style = STATE_STYLES[state]
            const badge = state === 'current' ? 'Current' : state === 'next' ? 'Next' : null
            const due = formatDueDate(milestone.dueDate)
            return (
              <li key={`milestone-mobile-${idx}`} className="relative pl-8">
                {idx < milestones.length - 1 && <span className={`absolute left-[14px] top-7 h-[calc(100%+6px)] w-px ${style.connector}`} />}
                <span className={`absolute left-0 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${style.node}`}>{style.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className={`text-xs truncate ${style.title}`} title={milestone.label}>{milestone.label}</p>
                    {badge && <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${style.badge}`}>{badge}</span>}
                  </div>
                  <p className="text-[10px] text-navy/50 truncate" title={`${milestone.owner || 'Unassigned'} • ${due}`}>{milestone.owner || 'Unassigned'} • {due}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="hidden md:block overflow-x-auto -mx-1 px-1">
        <ol className="flex items-start min-w-[760px] gap-0 snap-x snap-mandatory">
          {milestones.map((milestone, idx) => {
            const state = stateForMilestone(milestone, idx, currentIdx)
            const style = STATE_STYLES[state]
            const badge = state === 'current' ? 'Current' : state === 'next' ? 'Next' : null
            const due = formatDueDate(milestone.dueDate)
            const isLast = idx === milestones.length - 1

            return (
              <li key={`milestone-${idx}`} className="relative flex-1 min-w-[150px] snap-start pr-4">
                {!isLast && <span className={`absolute left-[calc(50%+16px)] right-0 top-4 h-0.5 ${style.connector}`} />}
                <div className="flex flex-col items-center text-center gap-2 min-w-0">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${style.node}`}>{style.icon}</span>
                  <div className="min-w-0 w-full">
                    <div className="flex items-center justify-center gap-1 min-w-0">
                      <p className={`text-[11px] uppercase tracking-wide truncate ${style.title}`} title={milestone.label}>{milestone.label}</p>
                      {badge && <span className={`shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${style.badge}`}>{badge}</span>}
                    </div>
                    <p className="text-[10px] text-navy/50 truncate mt-0.5" title={`${milestone.owner || 'Unassigned'} • ${due}`}>{milestone.owner || 'Unassigned'} • {due}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <MilestoneLegend />
    </div>
  )
}
