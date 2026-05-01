// Phase A — basic grants list (sprint 03). Settings page (sprint 09) uses
// GrantsListEnhanced which adds deal-coverage stats; this remains as a
// minimal version for any consumer that doesn't need the wrapper data.

import { useEffect, useState } from 'react'
import { listGrants, disconnectGrant } from '../../services/nylas.js'

export default function GrantsList() {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function refresh() {
    const result = await listGrants()
    setGrants(result.grants)
    setLoading(false)
    if (!result.ok) setError(result.error)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDisconnect(grantId, label) {
    if (
      !confirm(
        `Disconnect ${label}? Klo will stop reading email and meetings from this account.`,
      )
    ) {
      return
    }
    const result = await disconnectGrant({ grantId })
    if (!result.ok) {
      alert(`Could not disconnect: ${result.error}`)
      return
    }
    refresh()
  }

  if (loading) return <div className="text-sm text-navy/50">Loading connections…</div>
  if (error) return <div className="text-sm text-red-700">{error}</div>
  if (grants.length === 0) {
    return (
      <div className="text-sm text-navy/50 italic">
        No accounts connected yet. Connect one above so Klo can read your email and meetings.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {grants.map((g) => (
        <li
          key={g.nylas_grant_id}
          className="bg-white border border-navy/10 rounded-xl p-3 flex justify-between items-center"
        >
          <div>
            <div className="font-medium text-navy">{g.email_address}</div>
            <div className="text-xs text-navy/50">
              {g.provider === 'google' ? 'Google' : 'Microsoft'} · {g.sync_state}
              {g.last_error && <span className="text-red-600"> · {g.last_error}</span>}
            </div>
          </div>
          {g.sync_state !== 'revoked' && (
            <button
              onClick={() => handleDisconnect(g.nylas_grant_id, g.email_address)}
              className="text-sm text-red-600 hover:underline"
            >
              Disconnect
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
