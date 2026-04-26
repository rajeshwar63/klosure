// Phase 6 step 08 — chronological list of klo_state_history entries.
//
// Phase 6 keeps this simple: date + field path + before/after. Useful for
// answering "when did Klo add Khalid as a stakeholder?" without polish.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

function formatChangedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function summarize(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    if ('text' in value) return value.text
    if ('name' in value) return value.name
    if ('what' in value) return value.what
    if ('amount' in value) return String(value.amount)
    if ('value' in value) return String(value.value)
    return JSON.stringify(value).slice(0, 80)
  }
  return String(value)
}

export default function HistoryTab({ deal }) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    if (!deal?.id) return
    let mounted = true
    supabase
      .from('klo_state_history')
      .select('*')
      .eq('deal_id', deal.id)
      .order('changed_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.warn('[HistoryTab] load failed', error.message)
          setHistory([])
        } else {
          setHistory(data ?? [])
        }
      })
    return () => {
      mounted = false
    }
  }, [deal?.id])

  if (history === null) {
    return (
      <div className="p-6 md:p-8 text-sm text-navy/50">Loading history…</div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="p-6 md:p-8 text-sm text-navy/55 max-w-[800px]">
        No history yet — Klo hasn't made any updates to this deal record.
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      <div
        className="bg-white rounded-xl divide-y divide-navy/5 overflow-hidden"
        style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
      >
        {history.map((h) => (
          <div key={h.id} className="px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="font-medium text-navy">{h.field_path}</span>
              <span className="text-[11px] text-navy/45 shrink-0">
                {formatChangedAt(h.changed_at)} · {h.change_kind}
              </span>
            </div>
            <div className="text-[12px] text-navy/65 leading-snug">
              <span className="text-navy/40">{summarize(h.before_value)}</span>
              <span className="mx-1.5 text-navy/30">→</span>
              <span>{summarize(h.after_value)}</span>
            </div>
            {h.reason && (
              <p className="text-[11px] text-navy/50 mt-1 italic">
                {h.reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
