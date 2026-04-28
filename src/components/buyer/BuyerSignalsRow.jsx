// Phase 8 — three buyer-facing signals: timeline health, stakeholder
// alignment, vendor responsiveness. Always 3 cards, one per kind.

const KIND_LABELS = {
  timeline_health: 'Timeline confidence',
  stakeholder_alignment: 'Approver alignment',
  vendor_responsiveness: 'Vendor follow-through',
}

const LEVEL_STYLES = {
  strong: {
    label: 'Strong',
    text: 'text-emerald-700',
    chip: 'bg-emerald-50 border-emerald-200',
  },
  mixed: {
    label: 'Mixed',
    text: 'text-amber-700',
    chip: 'bg-amber-50 border-amber-200',
  },
  weak: {
    label: 'Weak',
    text: 'text-red-700',
    chip: 'bg-red-50 border-red-200',
  },
}

function pickSignal(signals, kind) {
  return (signals || []).find((s) => s?.kind === kind) || null
}

function SignalCard({ kind, signal }) {
  const level = signal?.level || 'mixed'
  const styles = LEVEL_STYLES[level] || LEVEL_STYLES.mixed
  return (
    <div className={`rounded-xl border ${styles.chip} px-4 py-4 flex flex-col gap-1`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-navy/55">
        {KIND_LABELS[kind]}
      </p>
      <p className={`text-lg font-semibold ${styles.text}`}>
        {signal ? styles.label : '—'}
      </p>
      <p className="text-[12px] text-navy/65 leading-snug">
        {signal?.one_line_why || 'Not enough activity yet—send a status check and log the response to calibrate this signal.'}
      </p>
    </div>
  )
}

export default function BuyerSignalsRow({ signals }) {
  const kinds = ['timeline_health', 'stakeholder_alignment', 'vendor_responsiveness']
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {kinds.map((kind) => (
        <SignalCard key={kind} kind={kind} signal={pickSignal(signals, kind)} />
      ))}
    </div>
  )
}
