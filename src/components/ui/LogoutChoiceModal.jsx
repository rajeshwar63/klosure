import { useEffect } from 'react'

export default function LogoutChoiceModal({
  open,
  onLogoutThisDevice,
  onLogoutAllDevices,
  onCancel,
  busy = false,
  canLogoutAllDevices = false,
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-choice-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-navy/10">
        <div className="px-5 pt-5 pb-3">
          <p className="text-[11px] font-semibold tracking-wider text-klo uppercase mb-1">◆ Klosure</p>
          <h2 id="logout-choice-title" className="text-base font-semibold text-navy">
            Log out?
          </h2>
          <p className="mt-1.5 text-sm text-navy/75">
            End this session, or sign out of every device where you’re currently logged in.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-navy/10 flex flex-col gap-2">
          <button
            type="button"
            onClick={onLogoutThisDevice}
            disabled={busy}
            className="w-full px-4 py-2 rounded-xl font-semibold bg-klo hover:bg-klo/90 text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Log out'}
          </button>
          {canLogoutAllDevices && (
            <button
              type="button"
              onClick={onLogoutAllDevices}
              disabled={busy}
              className="w-full px-4 py-2 rounded-xl font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Log out of all devices
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-full px-4 py-2 rounded-xl text-navy/70 hover:bg-navy/5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
