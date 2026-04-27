// "Ground covered" — completed commitments + key milestones derived from
// the existing data (no new schema). Shows a tick + the milestone text +
// when it happened.

function formatShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function deriveItems({ deal, commitments }) {
  const items = []

  // 1. Done commitments — strongest signal of progress.
  const done = (commitments ?? [])
    .filter((c) => c.status === 'done')
    .sort(
      (a, b) =>
        new Date(b.confirmed_at ?? b.created_at) -
        new Date(a.confirmed_at ?? a.created_at),
    )
  for (const c of done) {
    items.push({
      key: `c-${c.id}`,
      text: c.task,
      detail: c.owner === 'seller' ? 'You' : 'Buyer',
      when: c.confirmed_at ?? c.created_at,
    })
  }

  // 2. Stage progressed past discovery — milestone.
  const ks = deal?.klo_state ?? {}
  const stage = ks.stage ?? deal?.stage
  if (stage === 'proposal' || stage === 'negotiation' || stage === 'legal' || stage === 'closed') {
    items.push({
      key: 'stage-proposal',
      text: 'Discovery complete · moved to proposal',
      detail: null,
      when: deal?.updated_at ?? deal?.created_at,
    })
  }
  if (stage === 'negotiation' || stage === 'legal' || stage === 'closed') {
    items.push({
      key: 'stage-negotiation',
      text: 'Proposal accepted · in negotiation',
      detail: null,
      when: deal?.updated_at ?? deal?.created_at,
    })
  }

  // 3. Deal created — anchor.
  if (deal?.created_at) {
    items.push({
      key: 'created',
      text: 'Deal created',
      detail: deal.buyer_company,
      when: deal.created_at,
    })
  }

  // De-dup by text and sort newest-first.
  const seen = new Set()
  const unique = []
  for (const it of items) {
    const k = it.text.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(it)
  }
  unique.sort((a, b) => new Date(b.when) - new Date(a.when))
  return unique
}

export default function GroundCoveredBlock({ deal, commitments }) {
  const items = deriveItems({ deal, commitments })
  if (items.length === 0) return null

  return (
    <section className="dr-card mb-4">
      <div className="dr-card-head">
        <h3>Ground covered</h3>
        <div
          className="dr-mono"
          style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {items.length} {items.length === 1 ? 'win' : 'wins'} · keep momentum
        </div>
      </div>
      <div className="dr-card-body">
        {items.map((it) => (
          <div
            key={it.key}
            className="grid items-baseline py-2.5"
            style={{
              gridTemplateColumns: '18px 1fr auto',
              gap: 14,
              borderBottom: '1px solid var(--dr-line)',
            }}
          >
            <div
              className="flex items-center justify-center rounded"
              style={{
                width: 14,
                height: 14,
                background: 'var(--dr-good-soft)',
                color: 'var(--dr-good)',
                fontSize: 9,
                fontWeight: 600,
                transform: 'translateY(2px)',
              }}
              aria-hidden
            >
              ✓
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--dr-ink)', letterSpacing: '-0.005em' }}>
              {it.text}
              {it.detail && (
                <span style={{ color: 'var(--dr-ink-3)', fontSize: 12, marginLeft: 6 }}>
                  — {it.detail}
                </span>
              )}
            </div>
            <div
              className="dr-mono"
              style={{ fontSize: 11, color: 'var(--dr-ink-3)' }}
            >
              {formatShortDate(it.when)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
