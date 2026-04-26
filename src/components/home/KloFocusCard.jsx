// Phase 6 step 05 — hero of the seller home page. Klo's daily focus paragraph
// framed as ONE coaching action with primary + secondary CTAs.
//
// The first sentence is the headline (big, weight 500). The remaining
// sentences are the body (smaller, muted). Primary CTA jumps to the deal
// Klo referenced; secondary CTA opens a chat asking Klo why.

import { useNavigate } from 'react-router-dom'

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
      className="rounded-xl p-5 md:p-7 mb-6 animate-pulse"
      style={{ background: '#FAEEDA' }}
    >
      <div className="h-3 w-40 rounded mb-3" style={{ background: '#BA7517', opacity: 0.3 }} />
      <div className="h-7 w-3/4 rounded mb-2" style={{ background: '#BA7517', opacity: 0.3 }} />
      <div className="h-4 w-full rounded mb-1" style={{ background: '#BA7517', opacity: 0.2 }} />
      <div className="h-4 w-5/6 rounded mb-4" style={{ background: '#BA7517', opacity: 0.2 }} />
      <div className="h-9 w-32 rounded" style={{ background: '#412402', opacity: 0.3 }} />
    </div>
  )
}

function FocusEmpty({ onStart }) {
  return (
    <div
      className="rounded-xl p-5 md:p-7 mb-6 bg-white"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/45 mb-2">
        ◆ KLO
      </div>
      <h2 className="text-lg md:text-xl font-medium text-navy leading-snug mb-4">
        Once you have an active deal, Klo will tell you where to focus each morning.
      </h2>
      <button
        type="button"
        onClick={onStart}
        className="px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ background: '#412402' }}
      >
        + Start your first deal
      </button>
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
    <div
      className="rounded-xl p-5 md:p-7 mb-6"
      style={{ background: '#FAEEDA' }}
    >
      <div
        className="text-[10px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: '#854F0B' }}
      >
        ◆ KLO · YOUR FOCUS TODAY
      </div>

      <h2
        className="text-xl md:text-2xl font-medium leading-snug mb-3"
        style={{ color: '#412402' }}
      >
        {headline}
      </h2>

      {body && (
        <p
          className="text-sm md:text-base leading-relaxed mb-4 whitespace-pre-line"
          style={{ color: '#633806' }}
        >
          {body}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {primaryDeal && (
          <button
            type="button"
            onClick={openPrimary}
            className="px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ background: '#412402' }}
          >
            Open {primaryDeal.title}
          </button>
        )}
        <button
          type="button"
          onClick={askKloWhy}
          className="px-4 py-2 rounded-md text-sm border"
          style={{ borderColor: '#BA7517', color: '#633806' }}
        >
          Ask Klo why
        </button>
      </div>
    </div>
  )
}
