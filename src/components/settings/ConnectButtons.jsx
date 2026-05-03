// Phase B — connect Gmail / Outlook buttons. Drops the user into Klosure's
// hosted OAuth flow via a full-page redirect; the callback page handles the
// return. The user sees Google/Microsoft for the consent step, then comes
// back to Klosure — no vendor name in our UI.

import { useState } from 'react'
import { startConnect } from '../../services/aurinko.js'

export default function ConnectButtons() {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function handleConnect(provider) {
    setBusy(provider)
    setError(null)
    const result = await startConnect({ provider })
    if (!result.ok) {
      setBusy(null)
      setError(result.error || 'Could not start connection')
      return
    }
    window.location.href = result.url
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => handleConnect('google')}
        disabled={!!busy}
        className="w-full bg-white border border-navy/10 hover:border-navy/30 text-navy font-medium py-3 px-4 rounded-xl flex items-center gap-3 disabled:opacity-50"
      >
        <GoogleLogo />
        {busy === 'google' ? 'Opening Google…' : 'Connect Gmail & Google Calendar'}
      </button>
      <button
        onClick={() => handleConnect('office365')}
        disabled={!!busy}
        className="w-full bg-white border border-navy/10 hover:border-navy/30 text-navy font-medium py-3 px-4 rounded-xl flex items-center gap-3 disabled:opacity-50"
      >
        <MicrosoftLogo />
        {busy === 'office365' ? 'Opening Microsoft…' : 'Connect Outlook & M365 Calendar'}
      </button>
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.4 35.4 44 30 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f3f3f3" d="M0 0h23v23H0z" />
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  )
}
