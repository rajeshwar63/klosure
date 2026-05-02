// Phase A addition: when canEditEmail is true (seller view), show an inline
// "+ email" affordance per stakeholder. Editing routes through klo-respond
// via a chat message — the panel never patches klo_state directly. This keeps
// the chat as the audit trail and Klo as the agent that "files things away".

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { requestKloCoaching } from '../../services/klo.js'

const STATUS = {
  aligned: { urgency: 1 },
  engaged: { urgency: 2 },
  quiet: { urgency: 3 },
  blocker: { urgency: 4 },
  unknown: { urgency: 3 },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PENDING_TIMEOUT_MS = 30000

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

function isUnknownName(name) {
  const n = (name ?? '').trim().toLowerCase()
  return !n || n === 'unknown' || n.startsWith('unknown')
}

function StakeholderRow({
  stakeholder,
  canEditEmail,
  isEditing,
  isPending,
  onStartEdit,
  onSubmitEmail,
  onCancelEdit,
}) {
  const email = (stakeholder?.email ?? '').trim()
  const unknown = isUnknownName(stakeholder?.name)
  const showAffordance = canEditEmail && !unknown && !email

  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-navy/[0.06] text-navy/70"
          aria-hidden
        >
          👤
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy truncate" title={stakeholder?.name || 'Unnamed'}>
            {stakeholder?.name || 'Unnamed'}
          </p>
          <p className="text-xs text-navy/60 truncate" title={stakeholder?.role || '—'}>
            {stakeholder?.role || '—'}
          </p>
          {email ? (
            <p className="text-[11px] text-navy/55 truncate mt-0.5" title={email}>
              {email}
            </p>
          ) : isEditing ? (
            <EmailInlineInput
              personName={stakeholder?.name || 'They'}
              onSubmit={onSubmitEmail}
              onCancel={onCancelEdit}
            />
          ) : isPending ? (
            <p className="text-[11px] text-klo italic mt-0.5">Klo is filing this…</p>
          ) : showAffordance ? (
            <button
              type="button"
              onClick={onStartEdit}
              className="text-[11px] text-klo hover:underline mt-0.5"
            >
              + email
            </button>
          ) : (
            <p className="text-[11px] text-navy/45 mt-0.5">Person</p>
          )}
        </div>
      </div>
    </li>
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
          placeholder={`${(personName || '').split(' ')[0] || 'Their'}'s email`}
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

export default function BuyerStakeholderMap({
  stakeholders,
  title = 'Your team on this deal',
  emptyCopy = 'Klo will identify your internal stakeholders as they appear in your conversations with the vendor.',
  canEditEmail = false,
  dealId = null,
  dealMode = 'solo',
  currentUserName = 'Seller',
}) {
  const items = stakeholders ?? []

  const ranked = useMemo(
    () => [...items].sort((a, b) => scoreStakeholder(b) - scoreStakeholder(a)),
    [items],
  )
  const topFive = ranked.slice(0, 5)

  const [editingName, setEditingName] = useState(null)
  const [pendingName, setPendingName] = useState(null)
  const pendingTimerRef = useRef(null)

  // Clear pending hint once an email shows up for the matching stakeholder.
  useEffect(() => {
    if (!pendingName) return
    const match = items.find(
      (s) => (s?.name ?? '').trim() === pendingName && (s?.email ?? '').trim(),
    )
    if (match) {
      setPendingName(null)
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }
  }, [items, pendingName])

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    }
  }, [])

  async function submitEmail(stakeholder, value) {
    if (!dealId) return
    const name = (stakeholder?.name ?? '').trim()
    setEditingName(null)
    setPendingName(name)
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = setTimeout(() => {
      setPendingName((n) => (n === name ? null : n))
    }, PENDING_TIMEOUT_MS)

    const personName = name || 'They'
    const company = (stakeholder?.company ?? '').trim()
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
      console.error('[BuyerStakeholderMap] message insert failed', error)
      setPendingName(null)
      return
    }

    requestKloCoaching({
      deal: { id: dealId, mode: dealMode },
      role: 'seller',
      mode: dealMode,
    }).catch((err) => {
      console.error('[BuyerStakeholderMap] requestKloCoaching failed', err)
    })
  }

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
            {topFive.map((s, idx) => {
              const name = (s?.name ?? '').trim()
              return (
                <StakeholderRow
                  key={`${name || 'x'}-${idx}`}
                  stakeholder={s}
                  canEditEmail={canEditEmail}
                  isEditing={editingName === name && name !== ''}
                  isPending={pendingName === name && name !== ''}
                  onStartEdit={() => setEditingName(name)}
                  onSubmitEmail={(value) => submitEmail(s, value)}
                  onCancelEdit={() => setEditingName(null)}
                />
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
