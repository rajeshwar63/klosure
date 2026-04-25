// Stakeholders mapped to the deal — pulled from deal_context.stakeholders
// (jsonb: [{name, role, company}]). No status pills or "engaged" badges
// because we don't track that data; the spec is explicit about not faking
// signal we don't have. Empty state nudges back to the chat where Klo
// captures stakeholder mentions.
export default function PeopleGrid({ stakeholders, onSwitchToChat }) {
  if (!stakeholders || stakeholders.length === 0) {
    return (
      <div className="bg-white border border-navy/10 border-dashed rounded-xl px-4 py-6 text-center">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
          People in this deal
        </div>
        <p className="text-[13px] text-navy/60 mb-3">
          No stakeholders mapped yet. Mention them in chat — Klo will track
          who's who.
        </p>
        <button
          type="button"
          onClick={onSwitchToChat}
          className="text-[12px] font-semibold text-klo hover:underline"
        >
          Open chat →
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-navy/10 rounded-xl px-4 py-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-3">
        People in this deal
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {stakeholders.map((s, i) => (
          <PersonCard key={`${s.name || 'anon'}-${i}`} person={s} />
        ))}
      </div>
    </div>
  )
}

function PersonCard({ person }) {
  const name = person?.name?.trim() || 'Unnamed'
  const role = person?.role?.trim() || ''
  const company = person?.company?.trim() || ''
  return (
    <div className="border border-navy/10 rounded-lg px-2 py-2.5 flex flex-col items-center text-center">
      <Avatar name={name} />
      <div className="text-[12px] font-semibold text-navy mt-1.5 truncate w-full" title={name}>
        {name}
      </div>
      {role && (
        <div className="text-[10px] text-navy/50 truncate w-full" title={role}>
          {role}
        </div>
      )}
      {company && (
        <div className="text-[10px] text-navy/40 truncate w-full" title={company}>
          {company}
        </div>
      )}
    </div>
  )
}

const AVATAR_PALETTE = [
  'bg-klo/20 text-klo',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
]

function Avatar({ name }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'
  const tone = AVATAR_PALETTE[hash(name) % AVATAR_PALETTE.length]
  return (
    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold ${tone}`}>
      {initials}
    </span>
  )
}

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
