// Phase A sprint 09 — grants list with deal-coverage stats and richer status
// rendering. Wraps the basic GrantsList shape from sprint 03.

import { useEffect, useState } from 'react'
import { listGrants, disconnectGrant, startConnect } from '../../services/nylas.js'

export default function GrantsListEnhanced({ coverage, onChanged }) {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    const r = await listGrants()
    setGrants(r.grants)
    setLoading(false)
  }

  async function handleDisconnect(grantId, label) {
    if (
      !confirm(
        `Disconnect ${label}?\n\nKlo will stop reading email and meetings from this account. Existing deal data is preserved.`,
      )
    ) {
      return
    }
    const r = await disconnectGrant({ grantId })
    if (!r.ok) {
      alert(`Could not disconnect: ${r.error}`)
      return
    }
    await refresh()
    onChanged?.()
  }

  async function handleReconnect(provider) {
    const r = await startConnect({ provider })
    if (!r.ok) {
      alert(r.error)
      return
    }
    window.location.href = r.url
  }

  if (loading) return <div className="text-sm text-navy/50">Loading…</div>

  if (grants.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="text-[14px] font-semibold text-amber-900">
          No accounts connected yet
        </div>
        <p className="mt-1 text-[13px] text-amber-800">
          Without a connected account, Klo only sees what you type in chat.
          {coverage?.totalActive > 0 && (
            <>
              {' '}Right now you have {coverage.totalActive} active deal
              {coverage.totalActive !== 1 && 's'} that could benefit.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {grants.map((g) => (
        <GrantRow
          key={g.nylas_grant_id}
          grant={g}
          coverage={coverage}
          onDisconnect={() => handleDisconnect(g.nylas_grant_id, g.email_address)}
          onReconnect={() => handleReconnect(g.provider)}
        />
      ))}
    </ul>
  )
}

function GrantRow({ grant, coverage, onDisconnect, onReconnect }) {
  const isActive = grant.sync_state === 'active'
  const isExpired = grant.sync_state === 'expired'
  const isRevoked = grant.sync_state === 'revoked'
  const isError = grant.sync_state === 'error'

  const providerLabel = grant.provider === 'google' ? 'Google' : 'Microsoft'

  return (
    <li className="bg-white border border-navy/10 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot state={grant.sync_state} />
            <span className="font-medium text-navy truncate">{grant.email_address}</span>
            <span className="text-[12px] text-navy/40">· {providerLabel}</span>
          </div>

          {isActive && coverage && (
            <div className="mt-1 text-[13px] text-navy/60">
              Reading for {coverage.dealsWithEmails} of {coverage.totalActive} active deal
              {coverage.totalActive !== 1 && 's'}
              {coverage.dealsWithEmails < coverage.totalActive && (
                <span className="text-navy/40">
                  {' '}· other deals don't have stakeholder emails yet
                </span>
              )}
            </div>
          )}

          {isExpired && (
            <div className="mt-1 text-[13px] text-amber-700">
              Authorization expired. Reconnect to resume.
            </div>
          )}

          {isRevoked && (
            <div className="mt-1 text-[13px] text-navy/40 italic">Disconnected</div>
          )}

          {isError && (
            <div className="mt-1 text-[13px] text-red-700">
              Error: {grant.last_error ?? 'unknown'}
            </div>
          )}

          <div className="mt-1 text-[11px] text-navy/40">
            Connected {formatDate(grant.granted_at)}
            {grant.last_seen_at !== grant.granted_at && (
              <> · last activity {formatDate(grant.last_seen_at)}</>
            )}
          </div>
        </div>

        <div>
          {isActive && (
            <button
              onClick={onDisconnect}
              className="text-[13px] text-red-600 hover:underline"
            >
              Disconnect
            </button>
          )}
          {isExpired && (
            <button
              onClick={onReconnect}
              className="bg-klo text-white text-[13px] px-3 py-1.5 rounded-lg hover:opacity-90"
            >
              Reconnect
            </button>
          )}
          {isRevoked && (
            <button
              onClick={onReconnect}
              className="text-[13px] text-klo hover:underline"
            >
              Connect again
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function StatusDot({ state }) {
  const colors = {
    active: 'bg-emerald-500',
    expired: 'bg-amber-500',
    revoked: 'bg-navy/20',
    error: 'bg-red-500',
  }
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[state] || 'bg-navy/20'}`}
    />
  )
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
