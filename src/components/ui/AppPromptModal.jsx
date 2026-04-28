import { useEffect } from 'react'

export default function AppPromptModal({
  open,
  tone = 'default',
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel, busy])

  if (!open) return null

  const isDanger = tone === 'danger'
  const confirmClass = isDanger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-klo hover:bg-klo/90 text-white'

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="app-prompt-title">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-navy/10">
        <div className="px-5 pt-5 pb-3">
          <p className="text-[11px] font-semibold tracking-wider text-klo uppercase mb-1">◆ Klosure</p>
          <h2 id="app-prompt-title" className="text-base font-semibold text-navy">{title}</h2>
          <p className="mt-1.5 text-sm text-navy/75 whitespace-pre-line">{message}</p>
        </div>
        <div className="px-5 py-4 border-t border-navy/10 flex justify-end gap-2.5">
          {cancelLabel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 rounded-xl border border-navy/15 text-navy/75 hover:bg-navy/5 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-xl font-semibold disabled:opacity-50 ${confirmClass}`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
