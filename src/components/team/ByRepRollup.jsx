// Phase 5: by-rep rollup for the manager forecast tab. Each row is one team
// member with their active count, weighted pipeline, and Klo's flag — strong /
// at_risk / silent / neutral.

import { formatCurrency } from '../../lib/format.js'

const FLAG_TONE = {
  at_risk: 'bg-red-100 text-red-700',
  silent: 'bg-amber-100 text-amber-700',
  strong: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-navy/10 text-navy/60',
}

function flagLabel(rep) {
  if (rep.flag === 'at_risk') {
    return rep.slipping_count === 1 ? '1 slipping' : `${rep.slipping_count} slipping`
  }
  if (rep.flag === 'silent') {
    return rep.silent_count === 1 ? '1 silent' : `${rep.silent_count} silent`
  }
  if (rep.flag === 'strong') return 'strong'
  return ''
}

export default function ByRepRollup({ reps }) {
  if (!reps || reps.length === 0) return null
  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60 mb-2">
        By rep · Klo's read
      </h2>
      <div className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden">
        {reps.map((rep) => (
          <div key={rep.user_id} className="px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-klo/15 text-klo flex items-center justify-center text-sm font-bold shrink-0">
              {(rep.name || 'M').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-navy truncate">
                {rep.name || '—'}
                {rep.role === 'manager' && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-klo font-semibold">
                    Mgr
                  </span>
                )}
              </p>
              <p className="text-xs text-navy/60 truncate">
                {rep.active_count} active
                {rep.slipping_count > 0 && ` · ${rep.slipping_count} slipping`}
                {rep.silent_count > 0 && ` · ${rep.silent_count} silent`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-navy">
                {formatCurrency(rep.weighted)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-navy/40">
                weighted
              </p>
            </div>
            {rep.flag && (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
                  FLAG_TONE[rep.flag] ?? FLAG_TONE.neutral
                }`}
              >
                {flagLabel(rep)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
