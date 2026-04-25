// =============================================================================
// PWA registration + install prompt — Phase 4 (Week 7)
// =============================================================================
// We register the service worker on first load (production builds only — Vite
// dev mode stays uncached so HMR keeps working). The browser fires the
// `beforeinstallprompt` event when add-to-home-screen is eligible; we stash
// the event and the UI calls `triggerInstall()` from a button click.
// =============================================================================

let deferredInstallPrompt = null
const installListeners = new Set()

function notifyInstall(state) {
  for (const fn of installListeners) {
    try {
      fn(state)
    } catch (err) {
      console.error('[pwa] install listener', err)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstallPrompt = e
    notifyInstall({ canInstall: true, installed: false })
  })

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    notifyInstall({ canInstall: false, installed: true })
  })
}

export function registerServiceWorker() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[pwa] sw register failed', err)
    })
  })
}

export function onInstallStateChange(fn) {
  installListeners.add(fn)
  // Emit current state synchronously so consumers can render immediately.
  fn({
    canInstall: Boolean(deferredInstallPrompt),
    installed: isStandalone(),
  })
  return () => installListeners.delete(fn)
}

export async function triggerInstall() {
  if (!deferredInstallPrompt) return { ok: false, reason: 'no-prompt' }
  deferredInstallPrompt.prompt()
  const choice = await deferredInstallPrompt.userChoice.catch(() => null)
  deferredInstallPrompt = null
  notifyInstall({ canInstall: false, installed: choice?.outcome === 'accepted' })
  return { ok: choice?.outcome === 'accepted', outcome: choice?.outcome }
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari sets navigator.standalone instead of display-mode.
  return Boolean(window.navigator.standalone)
}
