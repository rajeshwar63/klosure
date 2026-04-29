// Page hero on the manager home. Same shape as the seller's KloFocusCard
// — KloBriefCard + dark primary button — but with a manager-perspective
// label.
//
// Manager briefs are typically longer than seller focus paragraphs, so the
// headline accommodates 1-2 sentences (whichever fits in ~220 chars) before
// splitting into the body.

import { useNavigate } from 'react-router-dom'
import { KloBriefCard } from '../shared/index.js'

function splitManagerBrief(text) {
  const clean = (text ?? '').replace(/\*\*/g, '').trim()
  if (!clean) return { headline: '', body: '' }
  const sentences = clean.split(/(?<=[.!?])\s+/)
  let headline = sentences[0] ?? ''
  let consumed = 1
  if (sentences.length > 1 && headline.length + sentences[1].length <= 220) {
    headline = `${headline} ${sentences[1]}`
    consumed = 2
  }
  const body = sentences.slice(consumed).join(' ').trim()
  return { headline, body }
}

function pickFocalRep(briefText, members) {
  if (!briefText || !Array.isArray(members) || members.length === 0) return null
  const lower = briefText.toLowerCase()
  let best = null
  for (const m of members) {
    const fullName = m.users?.name?.trim()
    if (!fullName) continue
    const candidates = [fullName, ...fullName.split(/\s+/)]
    let count = 0
    for (const c of candidates) {
      if (!c || c.length < 2) continue
      const safe = c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matches = lower.match(new RegExp(`\\b${safe}\\b`, 'g'))
      if (matches) count += matches.length
    }
    if (count > 0 && (!best || count > best.count)) best = { member: m, count }
  }
  return best?.member ?? null
}

function BriefSkeleton() {
  return (
    <div
      className="rounded-2xl mb-6 animate-pulse"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-line)',
        height: 180,
      }}
    />
  )
}

function BriefEmpty() {
  return (
    <div className="mb-6">
      <KloBriefCard label="Klo · Your team right now">
        Once your reps have active deals, Klo will brief you on the team each week.
      </KloBriefCard>
    </div>
  )
}

export default function KloTeamBriefCard({ brief, loading, pipeline }) {
  const navigate = useNavigate()
  if (loading) return <BriefSkeleton />
  if (!brief?.brief_text) return <BriefEmpty />

  const { headline, body } = splitManagerBrief(brief.brief_text)
  const focalRep = pickFocalRep(brief.brief_text, pipeline?.members ?? [])
  const focalName = focalRep?.users?.name?.split(' ')[0] || focalRep?.users?.name

  return (
    <div className="mb-6">
      <KloBriefCard label="Klo · Your team right now">
        <p
          className="font-medium leading-snug"
          style={{
            fontSize: 'clamp(18px, 2vw, 21px)',
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
            style={{ color: 'var(--klo-text-dim)', fontSize: 15 }}
          >
            {body}
          </p>
        )}

        <div className="mt-5 flex gap-2 flex-wrap">
          {focalRep && (
            <button
              type="button"
              onClick={() => navigate(`/team/reps?focus=${focalRep.user_id}`)}
              className="inline-flex items-center rounded-lg text-[14px] font-medium px-4 py-2.5"
              style={{ background: 'var(--klo-text)', color: '#fff' }}
            >
              Open {focalName}'s pipeline
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/team/askklo')}
            className="inline-flex items-center rounded-lg text-[14px] px-4 py-2.5"
            style={{
              background: 'transparent',
              color: 'var(--klo-text)',
              border: '1px solid var(--klo-line-strong)',
            }}
          >
            Ask Klo more
          </button>
        </div>
      </KloBriefCard>
    </div>
  )
}
