import { useEffect, useState } from 'react'
import { onInstallStateChange, triggerInstall, isStandalone } from '../lib/pwa.js'

const DISMISS_KEY = 'klosure:installDismissedAt'
const DISMISS_DAYS = 14

// Banner that shows up exactly once when the browser fires beforeinstallprompt
// and the user hasn't already installed or recently dismissed. We do NOT show
// this on iOS (no event support) — iOS users get the manual instructions in
// the Settings menu when we add it post-launch.
export default function InstallPrompt() {
  const [state, setState] = useState({ canInstall: false, installed: isStandalone() })
  const [dismissed, setDismissed] = useState(() => recentlyDismissed())

  useEffect(() => onInstallStateChange(setState), [])

  if (state.installed || dismissed || !state.canInstall) return null

  return (
    <div className="bg-klo-bg border border-klo/30 rounded-2xl p-3.5 mb-4 flex items-start gap-3">
      <div className="text-klo text-xl shrink-0">◆</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-navy">Install Klosure</p>
        <p className="text-xs text-navy/70 mt-0.5">
          Add to your home screen — works offline so you can open cached deals on patchy connections.
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={async () => {
            const res = await triggerInstall()
            if (!res.ok && res.outcome === 'dismissed') {
              localStorage.setItem(DISMISS_KEY, String(Date.now()))
              setDismissed(true)
            }
          }}
          className="bg-klo hover:bg-klo/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          Install
        </button>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()))
            setDismissed(true)
          }}
          className="text-navy/50 hover:text-navy text-xs"
        >
          Not now
        </button>
      </div>
    </div>
  )
}

function recentlyDismissed() {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY))
    if (!ts) return false
    const ageMs = Date.now() - ts
    return ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}
