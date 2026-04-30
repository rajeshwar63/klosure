// Phase 8 — buyer dashboard empty state. Shown when klo_state.buyer_view
// hasn't been generated yet (deal is brand new, or not enough chat to
// produce something useful). When `status` is provided, the copy and
// optional `action` slot adapt to surface failed attempts instead of
// silently saying "Building…" forever.

function formatRelative(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diff = Math.round((Date.now() - t) / 1000)
  if (diff < 30) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

export default function BuyerEmptyState({ status = null, action = null }) {
  const failed =
    status?.last_outcome &&
    status.last_outcome !== 'success' &&
    !!status.last_attempt_at
  const when = formatRelative(status?.last_attempt_at)

  const heading = failed ? 'Dashboard not ready yet' : 'Building your dashboard…'
  const body = failed
    ? `Klo tried to build this dashboard ${when ? when : 'recently'} but the attempt didn’t complete. The next chat turn will try again, or you can retry directly.`
    : 'Klo creates this dashboard from your conversations with the vendor. As the deal develops, this page fills in with your action items, stakeholder map, and timeline.'
  const footer = failed ? null : 'Check back in a few minutes.'

  return (
    <div className="px-6 py-20 max-w-md mx-auto text-center">
      <div className="text-klo text-3xl mb-4" aria-hidden>◆</div>
      <h2 className="text-xl font-semibold text-navy mb-3">{heading}</h2>
      <p className="text-sm text-navy/60 leading-relaxed">{body}</p>
      {footer ? <p className="text-xs text-navy/40 mt-6">{footer}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
