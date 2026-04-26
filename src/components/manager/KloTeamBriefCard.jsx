// Phase 6 step 13 — hero card on the manager home. Same shape as
// KloFocusCard but blue tones (manager perspective vs seller's amber).
//
// Manager briefs are typically longer than seller focus paragraphs, so
// the headline accommodates 1-2 sentences (whichever fits in ~220 chars)
// before splitting into the body.

import { useNavigate } from 'react-router-dom'

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
      className="rounded-xl p-5 md:p-7 mb-6 animate-pulse"
      style={{ background: '#E6F1FB' }}
    >
      <div className="h-3 w-44 rounded mb-3" style={{ background: '#185FA5', opacity: 0.3 }} />
      <div className="h-5 w-3/4 rounded mb-2" style={{ background: '#185FA5', opacity: 0.3 }} />
      <div className="h-4 w-full rounded mb-1" style={{ background: '#185FA5', opacity: 0.2 }} />
      <div className="h-4 w-5/6 rounded mb-4" style={{ background: '#185FA5', opacity: 0.2 }} />
      <div className="h-9 w-44 rounded" style={{ background: '#042C53', opacity: 0.3 }} />
    </div>
  )
}

function BriefEmpty() {
  return (
    <div
      className="rounded-xl p-5 md:p-7 mb-6 bg-white"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/45 mb-2">
        ◆ KLO
      </div>
      <h2 className="text-base md:text-lg font-medium text-navy leading-snug">
        Once your reps have active deals, Klo will brief you on the team each week.
      </h2>
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
    <div
      className="rounded-xl p-5 md:p-7 mb-6"
      style={{ background: '#E6F1FB' }}
    >
      <div
        className="text-[10px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: '#185FA5' }}
      >
        ◆ KLO · YOUR TEAM RIGHT NOW
      </div>

      <h2
        className="text-base md:text-lg font-medium leading-relaxed mb-3"
        style={{ color: '#042C53' }}
      >
        {headline}
      </h2>

      {body && (
        <p
          className="text-sm leading-relaxed mb-4 whitespace-pre-line"
          style={{ color: '#0C447C' }}
        >
          {body}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {focalRep && (
          <button
            type="button"
            onClick={() =>
              navigate(`/team/reps?focus=${focalRep.user_id}`)
            }
            className="px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ background: '#042C53' }}
          >
            Open {focalName}'s pipeline
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/team/askklo')}
          className="px-4 py-2 rounded-md text-sm border"
          style={{ borderColor: '#378ADD', color: '#0C447C' }}
        >
          Ask Klo more
        </button>
      </div>
    </div>
  )
}
