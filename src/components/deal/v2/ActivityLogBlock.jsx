// Activity log — derived event union, newest first. Sources:
//   - commitments: created (proposed), confirmed, marked done
//   - deal: stage / status flagged by Klo
//   - messages: each chat message (collapsed when bursty)

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const wasYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today ${time}`
  if (wasYesterday) return `Yesterday ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function buildEvents({ deal, commitments, messages }) {
  const events = []

  for (const c of commitments ?? []) {
    events.push({
      key: `c-create-${c.id}`,
      when: c.created_at,
      label: c.proposer_name || (c.proposed_by === 'seller' ? 'You' : 'Buyer') || 'Someone',
      text: `committed: ${c.task}`,
    })
    if (c.confirmed_at) {
      events.push({
        key: `c-confirm-${c.id}`,
        when: c.confirmed_at,
        label: c.confirmed_by_name || (c.confirmed_by === 'seller' ? 'You' : 'Buyer') || 'Someone',
        text: 'confirmed the commitment',
      })
    }
    if (c.status === 'done') {
      events.push({
        key: `c-done-${c.id}`,
        when: c.confirmed_at ?? c.created_at,
        label: c.owner === 'seller' ? 'You' : 'Buyer',
        text: `marked done: ${c.task}`,
      })
    }
    if (c.status === 'overdue') {
      events.push({
        key: `c-overdue-${c.id}`,
        when: c.due_date ?? c.created_at,
        label: 'KLO',
        klo: true,
        text: `flagged commitment as overdue: ${c.task}`,
      })
    }
  }

  if (deal?.created_at) {
    events.push({
      key: 'deal-created',
      when: deal.created_at,
      label: 'You',
      text: `created the deal${deal.buyer_company ? ` and shared with ${deal.buyer_company}` : ''}`,
    })
  }

  if (deal?.status === 'stuck' || deal?.status === 'at_risk') {
    events.push({
      key: 'klo-status',
      when: deal.updated_at ?? deal.created_at,
      label: 'KLO',
      klo: true,
      text: `flagged deal as ${deal.status === 'at_risk' ? 'At risk' : 'Stuck'}`,
    })
  }

  if (deal?.klo_state?.stage) {
    events.push({
      key: 'klo-stage',
      when: deal.updated_at ?? deal.created_at,
      label: 'KLO',
      klo: true,
      text: `detected stage: ${deal.klo_state.stage}`,
    })
  }

  // First and most recent buyer/seller message — prevents log explosion.
  const chat = (messages ?? []).filter(
    (m) => m.sender_type === 'seller' || m.sender_type === 'buyer',
  )
  if (chat.length > 0) {
    const first = chat[0]
    events.push({
      key: `msg-first-${first.id}`,
      when: first.created_at,
      label: first.sender_type === 'seller' ? 'You' : 'Buyer',
      text: 'started the conversation',
    })
  }
  if (chat.length > 1) {
    const last = chat[chat.length - 1]
    events.push({
      key: `msg-last-${last.id}`,
      when: last.created_at,
      label: last.sender_type === 'seller' ? 'You' : 'Buyer',
      text: 'sent a message',
    })
  }

  // Newest first, dedupe by key.
  const seen = new Set()
  const uniq = []
  for (const e of events) {
    if (seen.has(e.key)) continue
    seen.add(e.key)
    uniq.push(e)
  }
  uniq.sort((a, b) => new Date(b.when) - new Date(a.when))
  return uniq.slice(0, 12)
}

export default function ActivityLogBlock({ deal, commitments, messages }) {
  const events = buildEvents({ deal, commitments, messages })
  if (events.length === 0) return null

  return (
    <section className="dr-card mb-4">
      <div className="dr-card-head">
        <h3>Activity log</h3>
        <div
          className="dr-mono"
          style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          Newest first
        </div>
      </div>
      <div className="dr-card-body">
        {events.map((e) => (
          <div
            key={e.key}
            className="grid py-2"
            style={{
              gridTemplateColumns: '108px 1fr',
              gap: 16,
              borderBottom: '1px solid var(--dr-line)',
            }}
          >
            <div
              className="dr-mono"
              style={{ fontSize: 11, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {formatWhen(e.when)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--dr-ink-2)', letterSpacing: '-0.005em' }}>
              {e.klo ? (
                <span
                  className="dr-mono inline-block mr-1.5"
                  style={{
                    fontSize: 9.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '1px 5px',
                    background: 'var(--dr-ink)',
                    color: 'var(--dr-bg)',
                    borderRadius: 2,
                    verticalAlign: 1,
                  }}
                >
                  KLO
                </span>
              ) : (
                <span
                  className="font-medium"
                  style={{ color: 'var(--dr-ink)', marginRight: 4 }}
                >
                  {e.label}
                </span>
              )}
              {e.text}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
