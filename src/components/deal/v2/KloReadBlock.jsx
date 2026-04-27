// Klo's read — dark hero card with one-paragraph narrative + a Next move row.
// Reads klo_state.klo_take_seller (existing) and klo_state.next_move (new,
// optional — falls back to deriving from the take's last sentence).

const URGENCY_PATTERN =
  /\b(today|now|this week|by\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|tomorrow|tonight|asap)\b/i

function highlightUrgency(text) {
  if (!text) return text
  const match = text.match(URGENCY_PATTERN)
  if (!match) return text
  const idx = match.index
  const before = text.slice(0, idx)
  const hit = text.slice(idx, idx + match[0].length)
  const after = text.slice(idx + match[0].length)
  return (
    <>
      {before}
      <span style={{ color: 'var(--dr-accent)' }} className="font-medium">
        {hit}
      </span>
      {after}
    </>
  )
}

function deriveNextMove(take) {
  if (!take) return null
  const sentences = take.replace(/\*\*/g, '').trim().split(/(?<=[.!?])\s+/)
  if (sentences.length === 0) return null
  // Last sentence is usually the imperative.
  const last = sentences[sentences.length - 1]
  if (last.length < 12 || sentences.length === 1) return null
  return last.trim()
}

function timeAgo(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.max(1, Math.floor((Date.now() - t) / 60000))
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function KloReadBlock({ deal, onDraftMessage }) {
  const ks = deal?.klo_state ?? {}
  const take = (ks.klo_take_seller ?? '').replace(/\*\*/g, '').trim()
  const explicitNextMove = (ks.next_move ?? '').trim()
  const nextMove = explicitNextMove || deriveNextMove(take)

  // Body of the read = take minus the next-move sentence if we derived it.
  const body =
    nextMove && !explicitNextMove
      ? take.slice(0, take.length - nextMove.length).trim()
      : take

  if (!take) {
    return (
      <div
        className="rounded-[10px] mb-4 px-6 py-5 relative overflow-hidden"
        style={{ background: 'var(--dr-ink)', color: 'var(--dr-bg)' }}
      >
        <span
          className="absolute left-0 top-0 h-full"
          style={{ width: 3, background: 'var(--dr-accent)' }}
        />
        <div className="dr-mono mb-2" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
          Klo's read
        </div>
        <p className="m-0" style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
          Klo will read the room once you've had your first conversation in
          this deal. Open the chat to get started.
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-[10px] mb-4 px-6 py-5 relative overflow-hidden"
      style={{ background: 'var(--dr-ink)', color: 'var(--dr-bg)' }}
    >
      <span
        className="absolute left-0 top-0 h-full"
        style={{ width: 3, background: 'var(--dr-accent)' }}
      />

      <div className="flex items-center justify-between mb-3">
        <div
          className="flex items-center gap-2 dr-mono"
          style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}
        >
          <span
            className="inline-block"
            style={{ width: 7, height: 7, background: 'var(--dr-accent)', transform: 'rotate(45deg)' }}
          />
          Klo's read{deal?.updated_at && <> · {timeAgo(deal.updated_at)}</>}
        </div>
        <div
          className="dr-mono"
          style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}
        >
          Only you
        </div>
      </div>

      <p
        className="m-0"
        style={{
          fontSize: 17,
          fontWeight: 400,
          lineHeight: 1.45,
          letterSpacing: '-0.012em',
          color: 'rgba(255,255,255,0.95)',
          marginBottom: nextMove ? 16 : 0,
          whiteSpace: 'pre-line',
        }}
      >
        {highlightUrgency(body)}
      </p>

      {nextMove && (
        <div
          className="flex items-center gap-3.5 pt-3.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
        >
          <span
            className="dr-mono shrink-0"
            style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}
          >
            Next move
          </span>
          <span className="flex-1" style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.92)' }}>
            {highlightUrgency(nextMove)}
          </span>
          <button
            type="button"
            className="dr-btn dr-btn--accent shrink-0"
            onClick={() => onDraftMessage?.(nextMove)}
          >
            Draft message
          </button>
        </div>
      )}
    </div>
  )
}
