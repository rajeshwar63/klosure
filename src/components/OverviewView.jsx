import { useEffect, useMemo, useState } from 'react'
import {
  splitActionZones,
  deriveHealthFromState,
} from '../services/overview.js'
import { prefetchMessageSnippets, getCachedSnippet } from '../services/messageLookup.js'
import ActionZones from './overview/ActionZones.jsx'
import StageTracker from './overview/StageTracker.jsx'
import Tooltip from './Tooltip.jsx'
import RemoveButton from './RemoveButton.jsx'
import { formatCurrency } from '../lib/format.js'

// Phase 4.5: Overview renders from deals.klo_state — the living deal record
// Klo writes on every chat turn. Legacy fields (deal.value, deal.deadline,
// deal.summary, deal.stage) are still mirrored so this view degrades to the
// previous behavior if klo_state is null.
//
// Sections render the same factual data on both sides — only KloTake and
// OpenQuestionsList diverge. Removing items lives in step 11; provenance
// hover lives in step 10. This step is pure rendering.
export default function OverviewView({
  deal,
  dealContext: _dealContext,
  role,
  commitments,
  onSwitchToChat,
  onCommitmentClick,
}) {
  const ks = deal?.klo_state ?? null
  const zones = useMemo(() => splitActionZones(commitments), [commitments])
  const health = useMemo(
    () => deriveHealthFromState(ks, commitments),
    [ks, commitments],
  )

  // Phase 4.5: prefetch every source_message_id used by the Overview so the
  // tooltips on hover render synchronously from cache.
  const [snippetVersion, setSnippetVersion] = useState(0)
  useEffect(() => {
    if (!ks) return
    const ids = [
      ks.deal_value?.source_message_id,
      ks.deadline?.source_message_id,
      ...(ks.people ?? []).map((p) => p.first_seen_message_id),
      ...(ks.blockers ?? []).map((b) => b.source_message_id),
      ...(ks.open_questions ?? []).map((q) => q.source_message_id),
      ...(ks.decisions ?? []).map((d) => d.source_message_id),
    ].filter(Boolean)
    if (ids.length === 0) return
    let alive = true
    prefetchMessageSnippets(ids).then(() => {
      if (alive) setSnippetVersion((v) => v + 1)
    })
    return () => {
      alive = false
    }
  }, [ks])
  // snippetVersion forces a re-render once the cache is warm so tooltips can
  // pull from it synchronously.
  void snippetVersion

  return (
    <main className="flex-1 overflow-y-auto bg-chat-bg/40 px-3 py-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {ks ? (
          <>
            <KloTake state={ks} viewerRole={role} />
            <DealStatStrip state={ks} health={health} />
            <StageTracker deal={{ ...deal, stage: ks.stage }} />
            <PeopleGrid
              people={ks.people}
              viewerRole={role}
              dealId={deal.id}
              onSwitchToChat={onSwitchToChat}
            />
            <ActionZones deal={deal} zones={zones} onItemClick={onCommitmentClick} />
            <BlockersList blockers={ks.blockers} viewerRole={role} dealId={deal.id} />
            {/* Decisions are factual — both sides see them. Open questions are
                seller-side coaching prompts and stay hidden for buyers. */}
            <DecisionsList items={ks.decisions} />
            {role === 'seller' && (
              <OpenQuestionsList items={ks.open_questions} dealId={deal.id} />
            )}
          </>
        ) : (
          <EmptyKloState onSwitchToChat={onSwitchToChat} />
        )}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Klo's take — top of the Overview, role-scoped coaching string from klo_state.
// ---------------------------------------------------------------------------
function KloTake({ state, viewerRole }) {
  const text = viewerRole === 'buyer' ? state.klo_take_buyer : state.klo_take_seller
  if (!text) return null
  return (
    <div className="bg-klo-bg border border-klo/20 rounded-xl px-4 py-3 flex gap-3">
      <span className="text-klo text-base leading-none mt-0.5">◆</span>
      <p className="text-[14px] leading-snug text-navy">{text}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat strip — stage / value / deadline / health derived from klo_state.
// Tentative confidence renders in amber with an italic "(tentative)" tag.
// ---------------------------------------------------------------------------
const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed',
}

const HEALTH = {
  green: { dot: 'bg-emerald-500', label: 'On track', tone: 'text-emerald-700' },
  amber: { dot: 'bg-amber-500', label: 'At risk', tone: 'text-amber-700' },
  red: { dot: 'bg-red-500', label: 'Stuck', tone: 'text-red-700' },
}

function DealStatStrip({ state, health }) {
  const stage = STAGE_LABEL[state.stage] ?? '—'
  const valueTentative = state.deal_value?.confidence === 'tentative'
  const dateTentative = state.deadline?.confidence === 'tentative'
  const healthMeta = HEALTH[health] ?? HEALTH.green

  const valueValue = (
    <span className={valueTentative ? 'text-amber-700' : ''}>
      {state.deal_value ? formatCurrency(state.deal_value.amount) : '—'}
      {valueTentative && (
        <span className="ml-1 text-[11px] italic font-normal opacity-70">(tentative)</span>
      )}
    </span>
  )
  const dateValue = (
    <span className={dateTentative ? 'text-amber-700' : ''}>
      {state.deadline?.date ?? '—'}
      {dateTentative && (
        <span className="ml-1 text-[11px] italic font-normal opacity-70">(tentative)</span>
      )}
    </span>
  )

  return (
    <div className="rounded-xl overflow-hidden border border-navy/10 bg-navy/10">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px">
        <Cell label="Deal stage" value={stage} sub={state.stage_reasoning ?? null} />
        <Cell
          label="Value"
          value={
            <Tooltip content={renderProvenance(state.deal_value?.source_message_id)}>
              {valueValue}
            </Tooltip>
          }
          sub={state.deal_value ? `Per the deal record (${state.deal_value.currency})` : 'Not set'}
        />
        <Cell
          label="Deadline"
          value={
            <Tooltip content={renderProvenance(state.deadline?.source_message_id)}>
              {dateValue}
            </Tooltip>
          }
          sub={
            dateTentative && state.deadline?.previous
              ? `was ${state.deadline.previous}${state.deadline.note ? ` — ${state.deadline.note}` : ''}`
              : state.deadline?.date
              ? 'Target go-live'
              : 'Not set'
          }
        />
        <Cell
          label="Health"
          value={
            <span className={`inline-flex items-center gap-1.5 ${healthMeta.tone}`}>
              <span className={`w-2 h-2 rounded-full ${healthMeta.dot}`} />
              {healthMeta.label}
            </span>
          }
          sub={health === 'green' ? 'No tentative items' : 'Resolve in chat'}
        />
      </div>
    </div>
  )
}

// Build the JSX shown inside a tooltip from the cached message snippet.
// Returns null if there's no source id, or if the message hasn't been
// prefetched yet — Tooltip handles null content by rendering nothing (no
// empty bubble, no crash).
function renderProvenance(messageId) {
  const snippet = getCachedSnippet(messageId)
  if (!snippet) return null
  return (
    <span className="block">
      <span className="block text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-1">
        Source · {snippet.sender || snippet.role} · {snippet.when}
      </span>
      <span className="block italic text-navy/80">"{snippet.text}"</span>
    </span>
  )
}

function Cell({ label, value, sub }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-0.5">
        {label}
      </div>
      <div className="text-[15px] font-semibold text-navy leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-navy/50 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// People — pulled from klo_state.people.
// ---------------------------------------------------------------------------
function PeopleGrid({ people, viewerRole, dealId, onSwitchToChat }) {
  if (!people || people.length === 0) {
    return (
      <div className="bg-white border border-navy/10 border-dashed rounded-xl px-4 py-6 text-center">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
          People in this deal
        </div>
        <p className="text-[13px] text-navy/60 mb-3">
          Klo will add people as they appear in the chat.
        </p>
        {onSwitchToChat && (
          <button
            type="button"
            onClick={onSwitchToChat}
            className="text-[12px] font-semibold text-klo hover:underline"
          >
            Open chat →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-navy/10 rounded-xl px-4 py-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-3">
        People in this deal
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {people.map((p, i) => (
          <PersonCard
            key={`${p.name || 'anon'}-${i}`}
            person={p}
            dealId={dealId}
            canRemove={viewerRole === 'seller'}
          />
        ))}
      </div>
    </div>
  )
}

function PersonCard({ person, dealId, canRemove }) {
  const name = person?.name?.trim() || 'Unnamed'
  const role = person?.role?.trim() || ''
  const company = person?.company?.trim() || ''
  return (
    <div className="relative border border-navy/10 rounded-lg px-2 py-2.5 flex flex-col items-center text-center w-full">
      {canRemove && (
        <span className="absolute top-1 right-1">
          <RemoveButton
            dealId={dealId}
            kind="people"
            match={{ name: person.name }}
            label={name}
            addedAt={person.added_at}
          />
        </span>
      )}
      <Tooltip content={renderProvenance(person?.first_seen_message_id)}>
        <span className="block">
          <Avatar name={name} />
        </span>
      </Tooltip>
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

// ---------------------------------------------------------------------------
// Blockers — vertical list with a severity dot.
// ---------------------------------------------------------------------------
const SEVERITY_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

function BlockersList({ blockers, viewerRole, dealId }) {
  if (!blockers || blockers.length === 0) {
    return (
      <div className="bg-white border border-navy/10 rounded-xl px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-1">
          Blockers
        </div>
        <p className="text-[13px] text-navy/60">None right now.</p>
      </div>
    )
  }
  const canRemove = viewerRole === 'seller'
  return (
    <div className="bg-white border border-navy/10 rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
        Blockers
      </div>
      <ul className="space-y-1.5">
        {blockers.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-navy">
            <span
              className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                SEVERITY_DOT[b.severity] ?? 'bg-amber-500'
              }`}
            />
            <Tooltip content={renderProvenance(b.source_message_id)} className="flex-1">
              <span className="block">{b.text}</span>
            </Tooltip>
            {b.since && <span className="text-[11px] text-navy/40 shrink-0">since {b.since}</span>}
            {canRemove && (
              <RemoveButton
                dealId={dealId}
                kind="blockers"
                match={{ text: b.text }}
                label={b.text}
                addedAt={b.added_at}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Open questions — seller-only.
// ---------------------------------------------------------------------------
function OpenQuestionsList({ items, dealId }) {
  if (!items || items.length === 0) return null
  return (
    <div className="bg-white border border-navy/10 rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
        Open questions
      </div>
      <ul className="space-y-1.5">
        {items.map((q, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-navy">
            <span className="text-klo font-bold leading-none mt-0.5">?</span>
            <Tooltip content={renderProvenance(q.source_message_id)} className="flex-1">
              <span className="block">{q.text}</span>
            </Tooltip>
            <RemoveButton
              dealId={dealId}
              kind="open_questions"
              match={{ text: q.text }}
              label={q.text}
              addedAt={q.added_at}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Decisions — short audit list of what's been agreed.
// ---------------------------------------------------------------------------
function DecisionsList({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="bg-white border border-navy/10 rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
        Decisions on record
      </div>
      <ul className="space-y-1.5">
        {items.map((d, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-navy">
            <span className="text-emerald-600 leading-none mt-0.5">✓</span>
            <Tooltip content={renderProvenance(d.source_message_id)} className="flex-1">
              <span className="block">{d.what}</span>
            </Tooltip>
            {d.when && <span className="text-[11px] text-navy/40 shrink-0">{d.when}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state for legacy deals (klo_state is null until first chat turn).
// ---------------------------------------------------------------------------
function EmptyKloState({ onSwitchToChat }) {
  return (
    <div className="bg-white border border-navy/10 border-dashed rounded-xl px-4 py-8 text-center">
      <div className="text-klo text-2xl mb-2">◆</div>
      <p className="text-[14px] text-navy/70 mb-3 max-w-md mx-auto">
        Klo hasn't read this deal yet. Send a message in chat — Klo will catch
        up on the conversation and start tracking.
      </p>
      {onSwitchToChat && (
        <button
          type="button"
          onClick={onSwitchToChat}
          className="text-[13px] font-semibold text-klo hover:underline"
        >
          Open chat →
        </button>
      )}
    </div>
  )
}
