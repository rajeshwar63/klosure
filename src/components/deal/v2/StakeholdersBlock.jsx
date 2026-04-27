// Stakeholders — two-column buyer / your side. Reads klo_state.people, plus
// a synthesized "You" row on the seller side. Classification tags use
// person.classification (new) or fall back to inferring from role.

import { isBuyerPerson } from '../../../services/stakeholders.js'

const CLASS_TAG = {
  champion: { label: 'Champion', bg: 'var(--dr-good-soft)', fg: 'var(--dr-good)', border: 'rgba(79, 107, 47, 0.25)' },
  decision: { label: 'Decision', bg: 'var(--dr-accent-soft)', fg: 'var(--dr-accent-ink)', border: 'rgba(213, 97, 61, 0.3)' },
  approver: { label: 'Approver', bg: 'var(--dr-bg-2)', fg: 'var(--dr-ink-2)', border: 'var(--dr-line)' },
  influencer: { label: 'Influencer', bg: 'var(--dr-bg-2)', fg: 'var(--dr-ink-2)', border: 'var(--dr-line)' },
  user: { label: 'User', bg: 'var(--dr-bg-2)', fg: 'var(--dr-ink-2)', border: 'var(--dr-line)' },
  you: { label: 'You', bg: 'var(--dr-bg-2)', fg: 'var(--dr-ink-2)', border: 'var(--dr-line)' },
}

function inferClassification(person) {
  if (person.classification) return person.classification.toLowerCase()
  const r = (person.role ?? '').toLowerCase()
  if (r.includes('decision') || r.includes('cfo') || r.includes('vp') || r.includes('chief') || r.includes('head')) return 'decision'
  if (r.includes('procurement') || r.includes('purchas')) return 'approver'
  if (r.includes('champion')) return 'champion'
  return null
}

function initialsOf(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Tag({ classification }) {
  if (!classification) return null
  const t = CLASS_TAG[classification]
  if (!t) return null
  return (
    <span
      className="dr-mono"
      style={{
        fontSize: 9.5,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        padding: '2px 6px',
        border: `1px solid ${t.border}`,
        borderRadius: 3,
        background: t.bg,
        color: t.fg,
      }}
    >
      {t.label}
    </span>
  )
}

function PersonRow({ person, isSelf }) {
  const cls = isSelf ? 'you' : inferClassification(person)
  const name = isSelf ? person.name : (person.name?.trim() || 'Unnamed')
  const role = isSelf ? person.role : (person.role ?? '').trim()
  return (
    <div
      className="flex items-center gap-2.5 py-2"
      style={{ borderBottom: '1px solid var(--dr-line)' }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: isSelf ? 'var(--dr-bg-2)' : 'var(--dr-accent-soft)',
          color: isSelf ? 'var(--dr-ink-2)' : 'var(--dr-accent-ink)',
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        {initialsOf(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="font-medium truncate"
          style={{ fontSize: 13, color: 'var(--dr-ink)', letterSpacing: '-0.005em' }}
        >
          {name}
        </div>
        {role && (
          <div className="truncate" style={{ fontSize: 11.5, color: 'var(--dr-ink-3)' }}>
            {role}
          </div>
        )}
      </div>
      <Tag classification={cls} />
    </div>
  )
}

function ColLabel({ children }) {
  return (
    <div
      className="dr-mono mb-2"
      style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}
    >
      {children}
    </div>
  )
}

export default function StakeholdersBlock({ deal, dealContext, sellerName }) {
  const people = deal?.klo_state?.people ?? []
  const buyerSide = []
  const sellerSide = []
  for (const p of people) {
    if (isBuyerPerson(p, deal)) {
      buyerSide.push(p)
    } else if (
      (p.company ?? '').trim().toLowerCase() ===
      (deal?.seller_company ?? '').trim().toLowerCase()
    ) {
      sellerSide.push(p)
    } else if (!(p.company ?? '').trim()) {
      // Unattributed → buyer side by default (most extracted people are buyer)
      buyerSide.push(p)
    } else {
      buyerSide.push(p)
    }
  }

  const sellerCount = sellerSide.length + 1 // include "You"
  const totalCount = buyerSide.length + sellerCount

  return (
    <section className="dr-card mb-4">
      <div className="dr-card-head">
        <h3>Stakeholders</h3>
        <div
          className="dr-mono"
          style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {totalCount} {totalCount === 1 ? 'person' : 'people'} · 2 sides
        </div>
      </div>
      <div className="dr-card-body">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="md:pr-5">
            <ColLabel>Buyer side</ColLabel>
            {buyerSide.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--dr-ink-3)' }}>
                No buyer-side people identified yet. Klo will add them as
                they come up in chat.
              </p>
            ) : (
              buyerSide.map((p, i) => <PersonRow key={`b-${i}`} person={p} />)
            )}
          </div>
          <div
            className="md:pl-5 mt-4 md:mt-0"
            style={{ borderLeft: 'none' }}
          >
            <ColLabel>Your side</ColLabel>
            <PersonRow
              person={{ name: sellerName, role: 'Account Executive' }}
              isSelf
            />
            {sellerSide.map((p, i) => (
              <PersonRow key={`s-${i}`} person={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
