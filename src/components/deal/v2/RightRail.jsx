// Right rail — tabbed (Klo / Stage / Activity). Defaults to Klo and persists
// the choice per deal in localStorage (mirrors the existing DealTabs pattern).

import { useEffect, useState } from 'react'
import KloChatPane from './KloChatPane.jsx'

const STORAGE_KEY_PREFIX = 'klosure:dealroomRail:'
const TABS = [
  { id: 'klo', label: 'Klo' },
  { id: 'stage', label: 'Stage' },
  { id: 'activity', label: 'Activity' },
]
const STAGES = ['discovery', 'proposal', 'negotiation', 'legal', 'closed']
const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiate',
  legal: 'Legal',
  closed: 'Closed',
}

function loadTab(dealId) {
  if (!dealId) return 'klo'
  try {
    const v = localStorage.getItem(STORAGE_KEY_PREFIX + dealId)
    return TABS.some((t) => t.id === v) ? v : 'klo'
  } catch {
    return 'klo'
  }
}

function saveTab(dealId, tab) {
  if (!dealId) return
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + dealId, tab)
  } catch {
    // ignore
  }
}

function StageTrack({ deal }) {
  const current = deal?.klo_state?.stage ?? deal?.stage ?? 'discovery'
  const currentIdx = STAGES.indexOf(current)
  return (
    <div>
      <div className="grid mb-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
        {STAGES.map((s, i) => (
          <div
            key={s}
            style={{
              height: 26,
              borderRadius: 3,
              background:
                i < currentIdx
                  ? 'var(--dr-ink)'
                  : i === currentIdx
                    ? 'var(--dr-accent)'
                    : 'var(--dr-bg-2)',
            }}
          />
        ))}
      </div>
      <div
        className="grid dr-mono"
        style={{
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 3,
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--dr-ink-4)',
        }}
      >
        {STAGES.map((s, i) => (
          <span
            key={s}
            style={{
              color: i === currentIdx ? 'var(--dr-accent-ink)' : undefined,
              fontWeight: i === currentIdx ? 500 : 400,
            }}
          >
            {STAGE_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  )
}

function QuickStats({ deal, commitments, messages }) {
  const open = (commitments ?? []).filter(
    (c) => c.status !== 'done' && c.status !== 'declined',
  )
  const overdue = open.filter((c) => {
    const d = c.due_date && new Date(c.due_date)
    return c.status === 'overdue' || (d && d < new Date())
  }).length
  const done = (commitments ?? []).filter((c) => c.status === 'done').length

  // Days silent
  const recent = (messages ?? [])
    .filter((m) => m.sender_type === 'buyer' || m.sender_type === 'seller')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  const days = recent
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(recent.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      )
    : null

  // Klo nudges = klo messages count
  const nudges = (messages ?? []).filter((m) => m.sender_type === 'klo').length

  const cells = [
    { label: 'Days silent', value: days ?? '—', tone: days !== null && days >= 7 ? 'warn' : null },
    { label: 'Klo nudges', value: nudges },
    { label: 'Overdue', value: overdue, tone: overdue > 0 ? 'bad' : null },
    { label: 'Done', value: done, tone: done > 0 ? 'good' : null },
  ]

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
        background: 'var(--dr-line)',
        border: '1px solid var(--dr-line)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {cells.map((c) => (
        <div key={c.label} style={{ background: 'var(--dr-surface)', padding: '11px 12px' }}>
          <div
            className="dr-mono"
            style={{ fontSize: 10, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}
          >
            {c.label}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: '-0.025em',
              color:
                c.tone === 'warn'
                  ? 'var(--dr-warn)'
                  : c.tone === 'bad'
                    ? 'var(--dr-bad)'
                    : c.tone === 'good'
                      ? 'var(--dr-good)'
                      : 'var(--dr-ink)',
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function StagePane({ deal, commitments, messages }) {
  return (
    <div>
      <div
        className="dr-mono mb-2.5"
        style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
      >
        Stage progress
      </div>
      <StageTrack deal={deal} />

      <div
        className="dr-mono mt-6 mb-2.5"
        style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
      >
        Pulse
      </div>
      <QuickStats deal={deal} commitments={commitments} messages={messages} />
    </div>
  )
}

function ActivityPane({ deal, messages, commitments }) {
  const events = []
  if (deal?.created_at) {
    events.push({ when: deal.created_at, text: 'Deal created' })
  }
  for (const c of commitments ?? []) {
    if (c.confirmed_at) events.push({ when: c.confirmed_at, text: `Confirmed: ${c.task}` })
    if (c.status === 'done') events.push({ when: c.confirmed_at ?? c.created_at, text: `Done: ${c.task}` })
  }
  const lastMsg = (messages ?? [])
    .filter((m) => m.sender_type !== 'klo')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  if (lastMsg) {
    events.push({
      when: lastMsg.created_at,
      text: `${lastMsg.sender_type === 'seller' ? 'You' : 'Buyer'} sent a message`,
    })
  }
  events.sort((a, b) => new Date(b.when) - new Date(a.when))
  const top = events.slice(0, 8)

  return (
    <div>
      <div
        className="dr-mono mb-2.5"
        style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
      >
        Recent
      </div>
      <div className="flex flex-col">
        {top.map((e, i) => (
          <div
            key={i}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid var(--dr-line)',
              fontSize: 12,
              color: 'var(--dr-ink-2)',
              lineHeight: 1.45,
            }}
          >
            <div
              className="dr-mono"
              style={{ fontSize: 10, color: 'var(--dr-ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}
            >
              {new Date(e.when).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </div>
            {e.text}
          </div>
        ))}
        {top.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--dr-ink-3)', padding: '8px 0' }}>
            No activity yet.
          </div>
        )}
      </div>
    </div>
  )
}

export default function RightRail({
  deal,
  messages,
  setMessages,
  commitments,
  kloThinking,
  setKloThinking,
}) {
  const [tab, setTab] = useState(() => loadTab(deal?.id))

  useEffect(() => {
    setTab(loadTab(deal?.id))
  }, [deal?.id])

  function handleTab(t) {
    setTab(t)
    saveTab(deal?.id, t)
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex px-4 sticky top-0 z-10"
        style={{
          borderBottom: '1px solid var(--dr-line)',
          background: 'var(--dr-rail)',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTab(t.id)}
            className="dr-mono"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '13px 0',
              marginRight: 22,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: tab === t.id ? 'var(--dr-ink)' : 'var(--dr-ink-3)',
              borderBottom: `1.5px solid ${tab === t.id ? 'var(--dr-accent)' : 'transparent'}`,
              marginBottom: -1,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-4 py-4 flex-1 min-h-0">
        {tab === 'klo' && (
          <KloChatPane
            deal={deal}
            messages={messages}
            setMessages={setMessages}
            commitments={commitments}
            kloThinking={kloThinking}
            setKloThinking={setKloThinking}
          />
        )}
        {tab === 'stage' && (
          <StagePane deal={deal} commitments={commitments} messages={messages} />
        )}
        {tab === 'activity' && (
          <ActivityPane deal={deal} messages={messages} commitments={commitments} />
        )}
      </div>
    </div>
  )
}
