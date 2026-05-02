// Phase 6.1 step 06 — stakeholders panel. People in the deal are persistent
// visual anchors with last-contact time. Reads klo_state.people; groups by
// company (buyer side / seller side / other); shows "Unknown" gap-roles
// with a "?" avatar instead of a date.
//
// Phase A addition: inline email-add affordance. When the seller knows a
// stakeholder's email, they click "+ email" and type it. The panel posts a
// chat message ("Noora's email is X") through the existing klo-respond loop;
// Klo extracts and writes klo_state.people[].email. The chat is the audit
// trail — we don't PATCH the deal row directly.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatLastContact,
  isBuyerPerson,
  loadLatestMessageBySide,
} from '../../services/stakeholders.js'
import { supabase } from '../../lib/supabase.js'
import { requestKloCoaching } from '../../services/klo.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PENDING_TIMEOUT_MS = 30000

function personKey(p) {
  return `${(p?.name ?? '').trim()}|${(p?.role ?? '').trim()}|${(p?.company ?? '').trim()}`
}

const BUYER_AVATAR = { bg: '#E6F1FB', color: '#185FA5' }
const SELLER_AVATAR = { bg: '#EDE7DA', color: '#6B4A0F' }
const UNKNOWN_AVATAR = { bg: '#FAEEDA', color: '#854F0B' }

function isUnknownPerson(person) {
  const name = (person?.name ?? '').trim().toLowerCase()
  return !name || name === 'unknown' || name.startsWith('unknown')
}

function PersonRow({
  person,
  lastContact,
  side,
  canEditEmail,
  isEditing,
  isPending,
  onStartEdit,
  onSubmitEmail,
  onCancelEdit,
}) {
  const unknown = isUnknownPerson(person)
  const palette = unknown
    ? UNKNOWN_AVATAR
    : side === 'seller'
      ? SELLER_AVATAR
      : BUYER_AVATAR
  const name = unknown ? 'Unknown' : (person.name?.trim() || 'Unnamed')
  const initial = unknown ? '?' : (name[0]?.toUpperCase() ?? '?')
  const role = (person.role ?? '').trim()
  const email = (person.email ?? '').trim()

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
        {email ? (
          <div className="text-[12px] text-navy/55 truncate mt-0.5">{email}</div>
        ) : isEditing ? (
          <EmailInlineInput
            personName={name}
            onSubmit={onSubmitEmail}
            onCancel={onCancelEdit}
          />
        ) : isPending ? (
          <div className="text-[11px] text-klo italic mt-0.5">Klo is filing this…</div>
        ) : canEditEmail && !unknown ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="text-[11px] text-klo hover:underline mt-0.5"
          >
            + email
          </button>
        ) : null}
      </div>
    </div>
  )
}

function EmailInlineInput({ personName, onSubmit, onCancel }) {
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const trimmed = value.trim()
  const valid = EMAIL_RE.test(trimmed)
  const showError = touched && trimmed.length > 0 && !valid

  function handleSubmit(e) {
    e?.preventDefault?.()
    if (!valid) {
      setTouched(true)
      return
    }
    onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={`${personName.split(' ')[0]}'s email`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          className="text-[12px] px-2 py-1 rounded border border-navy/20 focus:outline-none focus:border-klo flex-1 min-w-0"
        />
        <button
          type="submit"
          disabled={!valid}
          className="text-[11px] text-klo hover:underline disabled:text-navy/30 disabled:no-underline"
        >
          save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-navy/50 hover:underline"
        >
          cancel
        </button>
      </div>
      {showError && (
        <div className="text-[11px] text-red-600">
          That doesn't look like an email address.
        </div>
      )}
    </form>
  )
}

function PersonGroup({
  label,
  people,
  lastContact,
  side,
  canEditEmail,
  editingKey,
  pendingKey,
  onStartEdit,
  onSubmitEmail,
  onCancelEdit,
}) {
  if (!people || people.length === 0) return null
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] font-semibold tracking-wider text-navy/45 mb-2">
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {people.map((p, i) => {
          const k = personKey(p)
          return (
            <PersonRow
              key={`${p.name || 'anon'}-${i}`}
              person={p}
              lastContact={lastContact}
              side={side}
              canEditEmail={canEditEmail}
              isEditing={editingKey === k}
              isPending={pendingKey === k}
              onStartEdit={() => onStartEdit(k)}
              onSubmitEmail={(value) => onSubmitEmail(p, value)}
              onCancelEdit={onCancelEdit}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function StakeholdersPanel({ klo_state, viewerRole, dealId, deal }) {
  const people = klo_state?.people ?? []
  const [contacts, setContacts] = useState({ buyer: null, seller: null })
  const [editingKey, setEditingKey] = useState(null)
  const [pendingKey, setPendingKey] = useState(null)
  const pendingTimerRef = useRef(null)
  const { user } = useAuth()
  const { profile } = useProfile()

  const canEditEmail = viewerRole === 'seller'
  const currentUserName = useMemo(
    () => profile?.name || user?.email || 'Seller',
    [profile?.name, user?.email],
  )

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

  // Clear the "Klo is filing this…" hint once the matching person actually
  // has an email in the latest klo_state. Keeps UI honest without a manual
  // race against klo-respond's latency.
  useEffect(() => {
    if (!pendingKey) return
    const match = people.find(
      (p) => personKey(p) === pendingKey && (p.email ?? '').trim(),
    )
    if (match) {
      setPendingKey(null)
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }
  }, [people, pendingKey])

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    }
  }, [])

  function startEdit(key) {
    setEditingKey(key)
  }

  function cancelEdit() {
    setEditingKey(null)
  }

  async function submitEmail(person, value) {
    if (!dealId) return
    const key = personKey(person)
    setEditingKey(null)
    setPendingKey(key)
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = setTimeout(() => {
      // Failsafe: clear the hint after PENDING_TIMEOUT_MS even if klo_state
      // didn't update — better to drop the spinner than to lie forever.
      setPendingKey((k) => (k === key ? null : k))
    }, PENDING_TIMEOUT_MS)

    const personName = person.name?.trim() || 'They'
    const company = person.company?.trim()
    const content = company
      ? `${personName}'s email is ${value} (${company}).`
      : `${personName}'s email is ${value}.`

    const { error } = await supabase.from('messages').insert({
      deal_id: dealId,
      sender_type: 'seller',
      sender_name: currentUserName,
      content,
    })

    if (error) {
      console.error('[StakeholdersPanel] message insert failed', error)
      setPendingKey(null)
      return
    }

    requestKloCoaching({
      deal: { id: dealId, mode: deal?.mode },
      role: 'seller',
      mode: deal?.mode ?? 'solo',
    }).catch((err) => {
      console.error('[StakeholdersPanel] requestKloCoaching failed', err)
    })
  }

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
            canEditEmail={canEditEmail}
            editingKey={editingKey}
            pendingKey={pendingKey}
            onStartEdit={startEdit}
            onSubmitEmail={submitEmail}
            onCancelEdit={cancelEdit}
          />
          <PersonGroup
            label={`SELLER SIDE${sellerCompany ? ` · ${sellerCompany}` : ' · Your team'}`}
            people={sellerSide}
            lastContact={contacts.seller}
            side="seller"
            canEditEmail={canEditEmail}
            editingKey={editingKey}
            pendingKey={pendingKey}
            onStartEdit={startEdit}
            onSubmitEmail={submitEmail}
            onCancelEdit={cancelEdit}
          />
          <PersonGroup
            label="OTHER"
            people={otherSide}
            lastContact={null}
            side="other"
            canEditEmail={canEditEmail}
            editingKey={editingKey}
            pendingKey={pendingKey}
            onStartEdit={startEdit}
            onSubmitEmail={submitEmail}
            onCancelEdit={cancelEdit}
          />
        </>
      )}
    </div>
  )
}
