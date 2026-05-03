// Phase B — OAuth callback handler.
// Aurinko redirects here with ?code=...&state=... after the user finishes
// the Google / Microsoft consent step. We POST those to aurinko-auth-finish
// and redirect back to settings. The user sees only Klosure copy here — no
// vendor names.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { finishConnect } from '../services/aurinko.js'

export default function InboxConnectCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const errParam = params.get('error')

    if (errParam) {
      setStatus('error')
      setError(
        `Provider returned an error: ${errParam}. ${params.get('error_description') ?? ''}`,
      )
      return
    }
    if (!code || !state) {
      setStatus('error')
      setError('Missing code or state in callback URL.')
      return
    }

    finishConnect({ code, state })
      .then((result) => {
        if (!result.ok) {
          setStatus('error')
          setError(result.error || 'Connection failed.')
          return
        }
        setStatus('done')
        // The `connected=1` flag tells SettingsConnectionsPage to force a
        // re-fetch of the grants list so the new account appears without a
        // manual page refresh.
        setTimeout(
          () => navigate('/settings/connections?connected=1', { replace: true }),
          1500,
        )
      })
      .catch((e) => {
        setStatus('error')
        setError(String(e))
      })
  }, [params, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full">
        {status === 'connecting' && (
          <>
            <h1 className="text-xl font-semibold text-navy">Connecting your account…</h1>
            <p className="mt-2 text-sm text-navy/60">This usually takes a few seconds.</p>
          </>
        )}
        {status === 'done' && (
          <>
            <h1 className="text-xl font-semibold text-emerald-700">Connected!</h1>
            <p className="mt-2 text-sm text-navy/60">Redirecting back to settings…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-red-700">Connection failed</h1>
            <p className="mt-2 text-sm text-navy/60">{error}</p>
            <button
              onClick={() => navigate('/settings/connections')}
              className="mt-4 bg-klo text-white px-4 py-2 rounded-xl"
            >
              Back to settings
            </button>
          </>
        )}
      </div>
    </div>
  )
}
