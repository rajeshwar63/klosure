export default function AppToast({ open, tone = 'info', message, actionLabel = 'Dismiss', onAction }) {
  if (!open) return null

  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-900'
        : 'border-klo/30 bg-klo-bg text-navy'

  return (
    <div className="fixed right-4 bottom-4 z-50 max-w-md w-[calc(100%-2rem)]">
      <div className={`rounded-xl border shadow-lg px-4 py-3 ${toneClass}`}>
        <p className="text-sm whitespace-pre-line">{message}</p>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
