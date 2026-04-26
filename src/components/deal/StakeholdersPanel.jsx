// Phase 6.1 step 06 — stakeholders panel. People in the deal are persistent
// visual anchors with last-contact time. Reads klo_state.people; groups by
// company (buyer side / seller side / other); shows "Unknown" gap-roles
// with a "?" avatar instead of a date.

import { useEffect, useState } from 'react'
import {
  formatLastContact,
  isBuyerPerson,
  loadLatestMessageBySide,
} from '../../services/stakeholders.js'

const BUYER_AVATAR = { bg: '#E6F1FB', color: '#185FA5' }
const SELLER_AVATAR = { bg: '#EDE7DA', color: '#6B4A0F' }
const UNKNOWN_AVATAR = { bg: '#FAEEDA', color: '#854F0B' }

function isUnknownPerson(person) {
  const name = (person?.name ?? '').trim().toLowerCase()
  return !name || name === 'unknown' || name.startsWith('unknown')
}

function PersonRow({ person, lastContact, side }) {
  const unknown = isUnknownPerson(person)
  const palette = unknown
    ? UNKNOWN_AVATAR
    : side === 'seller'
      ? SELLER_AVATAR
      : BUYER_AVATAR
  const name = unknown ? 'Unknown' : (person.name?.trim() || 'Unnamed')
  const initial = unknown ? '?' : (name[0]?.toUpperCase() ?? '?')
  const role = (person.role ?? '').trim()

  const contactLabel = unknown
    ? `${role || 'Role to identify'} — not yet identified`
    : side === 'seller'
      ? `Last action ${formatLastContact(lastContact)}`
      : `Last spoke ${formatLastContact(lastContact)}`

  return (
    <div className="flex gap-3 items-start">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
        style={{ background: palette.bg, color: palette.color }}
        aria-hidden
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-navy truncate">
          {name}
          {role && !unknown && (
            <span className="text-navy/55 font-normal"> · {role}</span>
          )}
        </div>
        <div className="text-[12px] text-navy/55 truncate">{contactLabel}</div>
      </div>
    </div>
  )
}

function PersonGroup({ label, people, lastContact, side }) {
  if (!people || people.length === 0) return null
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] font-semibold tracking-wider text-navy/45 mb-2">
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {people.map((p, i) => (
          <PersonRow
            key={`${p.name || 'anon'}-${i}`}
            person={p}
            lastContact={lastContact}
            side={side}
          />
        ))}
      </div>
    </div>
  )
}

export default function StakeholdersPanel({ klo_state, viewerRole, dealId, deal }) {
  const people = klo_state?.people ?? []
  const [contacts, setContacts] = useState({ buyer: null, seller: null })

  useEffect(() => {
    if (!dealId) return
    let cancelled = false
    loadLatestMessageBySide(dealId).then((result) => {
      if (!cancelled) setContacts(result)
    })
    return () => {
      cancelled = true
    }
  }, [dealId])

  const buyerSide = []
  const sellerSide = []
  const otherSide = []
  const buyerCompany = (deal?.buyer_company ?? '').trim()
  const sellerCompany = (deal?.seller_company ?? '').trim()

  for (const person of people) {
    const company = (person.company ?? '').trim()
    if (isBuyerPerson(person, deal)) {
      buyerSide.push(person)
    } else if (sellerCompany && company.toLowerCase() === sellerCompany.toLowerCase()) {
      sellerSide.push(person)
    } else if (!company) {
      // No company = ambiguous; keep with buyer side by default since
      // most extracted people are buyer-side contacts.
      buyerSide.push(person)
    } else {
      otherSide.push(person)
    }
  }

  return (
    <div
      className="bg-white rounded-xl p-4 md:p-5"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-[12px] font-semibold tracking-wider text-navy/55">
          STAKEHOLDERS · {people.length}
        </span>
        {viewerRole === 'seller' && (
          <button
            type="button"
            disabled
            title="Coming soon — Klo will help you add stakeholders by name"
            className="text-[10px] text-klo opacity-40 cursor-not-allowed"
          >
            + Add
          </button>
        )}
      </div>

      {people.length === 0 ? (
        <div className="text-sm text-navy/50 py-1">
          No people identified yet. Klo will add them as they come up in chat.
        </div>
      ) : (
        <>
          <PersonGroup
            label={`BUYER SIDE${buyerCompany ? ` · ${buyerCompany}` : ''}`}
            people={buyerSide}
            lastContact={contacts.buyer}
            side="buyer"
          />
          <PersonGroup
            label={`SELLER SIDE${sellerCompany ? ` · ${sellerCompany}` : ' · Your team'}`}
            people={sellerSide}
            lastContact={contacts.seller}
            side="seller"
          />
          <PersonGroup
            label="OTHER"
            people={otherSide}
            lastContact={null}
            side="other"
          />
        </>
      )}
    </div>
  )
}
