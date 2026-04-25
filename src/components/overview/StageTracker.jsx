import { getStageOrder, getStageLabel } from '../../services/overview.js'

// Horizontal 5-step deal stage indicator: discovery → proposal → negotiation
// → legal → closed. Connector lines take the color of the EARLIER node so
// "in progress between A and B" reads as "we've cleared A". When the deal
// status is won/lost we treat every stage as done and tag a Won/Lost badge
// at the end.
export default function StageTracker({ deal }) {
  const stages = getStageOrder()
  const currentIdx = stages.indexOf(deal?.stage)
  const idx = currentIdx === -1 ? 0 : currentIdx
  const closed = deal?.status === 'won' || deal?.status === 'lost'

  return (
    <div className="bg-white border border-navy/10 rounded-xl px-4 py-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-3">
        Where we are
      </div>
      <div className="flex items-start">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1
          const state = closed
            ? 'past'
            : i < idx
              ? 'past'
              : i === idx
                ? 'current'
                : 'future'
          return (
            <div key={stage} className="flex-1 flex flex-col items-center min-w-0 relative">
              <div className="flex items-center w-full">
                <Connector visible={i > 0} state={i <= idx || closed ? 'past' : 'future'} />
                <Node state={state} />
                <Connector visible={!isLast} state={i < idx || closed ? 'past' : 'future'} />
              </div>
              <div className={`mt-1.5 text-[11px] font-medium text-center px-1 truncate w-full ${
                state === 'past' ? 'text-emerald-700'
                  : state === 'current' ? 'text-klo'
                  : 'text-navy/40'
              }`}>
                {getStageLabel(stage)}
              </div>
            </div>
          )
        })}
      </div>
      {closed && (
        <div className="mt-3 flex justify-center">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
            deal.status === 'won'
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
              : 'bg-navy/10 text-navy/60 border border-navy/20'
          }`}>
            {deal.status === 'won' ? 'Won' : 'Lost'}
          </span>
        </div>
      )}
    </div>
  )
}

function Node({ state }) {
  if (state === 'past') {
    return (
      <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span className="w-5 h-5 rounded-full border-2 border-klo flex items-center justify-center shrink-0 bg-white">
        <span className="w-2 h-2 rounded-full bg-klo" />
      </span>
    )
  }
  return <span className="w-5 h-5 rounded-full border-2 border-navy/20 bg-white shrink-0" />
}

function Connector({ visible, state }) {
  if (!visible) return <span className="flex-1" />
  return (
    <span className={`flex-1 h-0.5 ${state === 'past' ? 'bg-emerald-400' : 'bg-navy/15'}`} />
  )
}
