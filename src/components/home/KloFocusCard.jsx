// Page hero of /today. Klo's daily focus paragraph framed as ONE coaching
// action with a primary + secondary CTA.
//
// Design language: KloBriefCard (accent left-border, mono label) + dark
// primary button. Replaces the old amber-cream variant.

import { useNavigate } from 'react-router-dom'
import { KloBriefCard } from '../shared/index.js'

function splitFocus(text) {
  const clean = (text ?? '').replace(/\*\*/g, '').trim()
  if (!clean) return { headline: '', body: '' }
  const parts = clean.split(/(?<=[.!?])\s+/)
  return {
    headline: parts[0] ?? clean,
    body: parts.slice(1).join(' ').trim(),
  }
}

function pickPrimaryDeal(focus, deals) {
  const ids = focus?.deals_referenced
  if (!Array.isArray(ids) || ids.length === 0) return null
  return (deals || []).find((d) => d.id === ids[0]) || null
}

function FocusSkeleton() {
  return (
    <div
      className="mb-6 rounded-2xl animate-pulse"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-line)',
        height: 180,
      }}
    />
  )
}

function FocusEmpty({ onStart }) {
  return (
    <div className="mb-6">
      <KloBriefCard label="Klo · Your focus today">
        Once you have an active deal, Klo will tell you where to focus each morning.
        <div className="mt-4">
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-lg text-[14px] font-medium px-4 py-2.5"
            style={{ background: 'var(--klo-text)', color: '#fff' }}
          >
            <span>+</span> Start your first deal
          </button>
        </div>
      </KloBriefCard>
    </div>
  )
}

export default function KloFocusCard({ focus, loading, deals }) {
  const navigate = useNavigate()

  if (loading) return <FocusSkeleton />
  if (!focus || !focus.focus_text) {
    return <FocusEmpty onStart={() => navigate('/deals/new')} />
  }

  const { headline, body } = splitFocus(focus.focus_text)
  const primaryDeal = pickPrimaryDeal(focus, deals)

  function openPrimary() {
    if (!primaryDeal) return
    navigate(`/deals/${primaryDeal.id}`)
  }

  function askKloWhy() {
    if (primaryDeal) {
      navigate(`/deals/${primaryDeal.id}?ask=focus_explain`)
    } else {
      navigate('/team/askklo')
    }
  }

  return (
    <div className="mb-6">
      <KloBriefCard label="Klo · Your focus today">
        <p
          className="font-medium leading-snug"
          style={{
            fontSize: 'clamp(20px, 2.4vw, 24px)',
            letterSpacing: '-0.01em',
            color: 'var(--klo-text)',
            margin: 0,
          }}
        >
          {headline}
        </p>

        {body && (
          <p
            className="mt-3 leading-relaxed whitespace-pre-line"
            style={{ color: 'var(--klo-text-dim)', fontSize: 16 }}
          >
            {body}
          </p>
        )}

        <div className="mt-5 flex gap-2 flex-wrap">
          {primaryDeal && (
            <button
              type="button"
              onClick={openPrimary}
              className="inline-flex items-center gap-2 rounded-lg text-[14px] font-medium px-4 py-2.5"
              style={{ background: 'var(--klo-text)', color: '#fff' }}
            >
              Open {primaryDeal.title}
            </button>
          )}
          <button
            type="button"
            onClick={askKloWhy}
            className="inline-flex items-center gap-2 rounded-lg text-[14px] px-4 py-2.5"
            style={{
              background: 'transparent',
              color: 'var(--klo-text)',
              border: '1px solid var(--klo-line-strong)',
            }}
          >
            Ask Klo why
          </button>
        </div>
      </KloBriefCard>
    </div>
  )
}
