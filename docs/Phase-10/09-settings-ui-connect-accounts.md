# Sprint 09 — Settings UI: Connect inbox & calendar

**Sprint:** 9 of 11
**Estimated:** 1 day
**Goal:** Wire the components from sprint 03 (`ConnectButtons`, `GrantsList`) into a real, polished settings page at `/settings/connections`. This is the page customers see after signup that turns Phase A from "infrastructure built" to "infrastructure usable."

## Why this matters

The OAuth components exist (sprint 03) and the OAuth backend works (sprints 03 + 04), but right now there's no actual page hosting the UI. A user can't find the connect button. This sprint builds the page, adds it to the settings nav, writes the empty-state copy that explains why connecting matters, and ships the disconnect confirmation flow.

This is the polish sprint. Get the empty-state copy right and adoption is high. Get it wrong and customers see "Connect Gmail" with no context and don't click.

## What ships

1. New page `src/pages/SettingsConnectionsPage.jsx`
2. Route registration in `src/App.jsx`
3. Settings nav item ("Connections") added to `src/pages/SettingsPage.jsx` (or wherever the settings layout lives)
4. Empty-state with explanatory copy
5. Status badges: green check (active), amber (expired), red (revoked + last error)
6. Per-grant deal-coverage info: "Klo is reading email for 4 of your 6 active deals" (so users see the value)

## Page layout

```
/settings/connections

┌─────────────────────────────────────────────────────────┐
│ Connect your inbox & calendar                            │
│                                                          │
│ When you connect, Klo reads emails and joins meetings    │
│ that involve your deal stakeholders. Klo never sends —   │
│ it just listens and keeps the deal record current.       │
│                                                          │
│ Read-only. You can disconnect anytime.                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   [G] Connect Gmail & Google Calendar                    │
│   [M] Connect Outlook & M365 Calendar                    │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ Connected accounts                                       │
│                                                          │
│ ✓ rajeshwar63@gmail.com (Google) · active                │
│   Reading for 4 of your 6 active deals                   │
│   Connected May 1                              Disconnect│
│                                                          │
│ ⚠ rajeshwar@klosure.ai (Microsoft) · expired             │
│   Reauthorize to continue email + meeting capture        │
│   Last seen Apr 28                              Reconnect│
└─────────────────────────────────────────────────────────┘
```

## SettingsConnectionsPage.jsx

Path: `src/pages/SettingsConnectionsPage.jsx`

```jsx
// =============================================================================
// SettingsConnectionsPage — Phase A sprint 09
// =============================================================================
// Hosts the ConnectButtons + GrantsList from sprint 03, plus context copy
// and per-grant deal-coverage stats.
// =============================================================================

import { useEffect, useState } from 'react'
import ConnectButtons from '../components/settings/ConnectButtons.jsx'
import GrantsListEnhanced from '../components/settings/GrantsListEnhanced.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { listGrants } from '../services/nylas.js'
import { supabase } from '../lib/supabase.js'

export default function SettingsConnectionsPage() {
  const { user } = useAuth()
  const [coverage, setCoverage] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!user) return
    loadCoverage(user.id).then(setCoverage)
  }, [user, refreshTick])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-navy">
        Connect your inbox & calendar
      </h1>

      <div className="mt-3 text-[15px] text-navy/70 leading-relaxed">
        When you connect, Klo reads emails and joins meetings that involve your deal stakeholders.
        Klo never sends email or schedules meetings — it just listens and keeps the deal record current.
      </div>

      <div className="mt-2 inline-flex items-center gap-2 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
        <CheckIcon /> Read-only. Disconnect anytime.
      </div>

      <div className="mt-6">
        <ConnectButtons onConnected={() => setRefreshTick(t => t + 1)} />
      </div>

      <div className="mt-8 pt-6 border-t border-navy/10">
        <h2 className="text-[13px] font-semibold tracking-wider text-navy/55 mb-3">
          CONNECTED ACCOUNTS
        </h2>
        <GrantsListEnhanced
          coverage={coverage}
          onChanged={() => setRefreshTick(t => t + 1)}
        />
      </div>

      <div className="mt-8 pt-6 border-t border-navy/10">
        <h2 className="text-[13px] font-semibold tracking-wider text-navy/55 mb-3">
          WHAT KLO READS
        </h2>
        <ul className="space-y-2 text-[14px] text-navy/70">
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span><strong>Emails</strong> with anyone listed as a stakeholder on your active deals. Personal email is ignored.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span><strong>Calendar events</strong> with deal stakeholders attending. Klo dispatches a notetaker bot to those meetings.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span><strong>Meeting transcripts</strong> via Klo's bot. The bot shows up as "Klo (Klosure)" in the participant list — buyers see it's there.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-klo">→</span>
            <span><strong>Nothing else.</strong> Klo doesn't send, schedule, reply, or forward. Read-only.</span>
          </li>
        </ul>
      </div>

      <div className="mt-8 text-xs text-navy/40">
        Need different scopes or have questions? <a href="mailto:support@klosure.ai" className="underline">Email support</a>.
      </div>
    </div>
  )
}

async function loadCoverage(userId) {
  // For each grant, count: (a) active deals total, (b) active deals where
  // klo_state.people contains an email that the grant could reach. (b) is the
  // "reading for X of Y" stat.
  const { data: grants } = await supabase
    .from('nylas_grants')
    .select('nylas_grant_id, email_address, sync_state')

  const { data: deals } = await supabase
    .from('deals')
    .select('id, klo_state')
    .eq('seller_id', userId)
    .eq('status', 'active')

  const totalActive = deals?.length ?? 0
  const dealsWithEmails = (deals ?? []).filter((d) => {
    const people = d.klo_state?.people ?? []
    return people.some((p) => !!p.email)
  }).length

  return { totalActive, dealsWithEmails, grants: grants ?? [] }
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0z"/>
    </svg>
  )
}
```

## GrantsListEnhanced — wraps sprint 03's GrantsList with coverage info

Path: `src/components/settings/GrantsListEnhanced.jsx`

```jsx
import { useEffect, useState } from 'react'
import { listGrants, disconnectGrant, startConnect } from '../../services/nylas.js'

export default function GrantsListEnhanced({ coverage, onChanged }) {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    const r = await listGrants()
    setGrants(r.grants)
    setLoading(false)
  }

  async function handleDisconnect(grantId, label) {
    if (!confirm(
      `Disconnect ${label}?\n\nKlo will stop reading email and meetings from this account. Existing deal data is preserved.`
    )) return
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
    if (!r.ok) { alert(r.error); return }
    window.location.href = r.url
  }

  if (loading) return <div className="text-sm text-navy/50">Loading…</div>

  if (grants.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="text-[14px] font-semibold text-amber-900">No accounts connected yet</div>
        <p className="mt-1 text-[13px] text-amber-800">
          Without a connected account, Klo only sees what you type in chat.
          {coverage?.totalActive > 0 && (
            <> Right now you have {coverage.totalActive} active deal{coverage.totalActive !== 1 && 's'} that could benefit.</>
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
              Reading for {coverage.dealsWithEmails} of {coverage.totalActive} active deal{coverage.totalActive !== 1 && 's'}
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
            <div className="mt-1 text-[13px] text-navy/40 italic">
              Disconnected
            </div>
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
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[state] || 'bg-navy/20'}`} />
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

## ConnectButtons — slight update for callback

Path: `src/components/settings/ConnectButtons.jsx` (already exists from sprint 03 — small change to accept `onConnected` callback for refresh after redirect:

```jsx
// Add prop:
export default function ConnectButtons({ onConnected }) {
  // ... existing implementation ...
  // The onConnected is reserved for future when we don't full-page-redirect.
  // For now hosted auth uses window.location.href so the page reloads anyway.
}
```

## Route registration

In `src/App.jsx` (or wherever routes live):

```jsx
import SettingsConnectionsPage from './pages/SettingsConnectionsPage.jsx'

// Inside <Routes>:
<Route path="/settings/connections" element={<SettingsConnectionsPage />} />
```

## Settings nav item

If you have a settings page with nav (`src/pages/SettingsPage.jsx`), add the "Connections" link:

```jsx
<NavLink to="/settings/connections" className="...">
  Connections
</NavLink>
```

If there's no settings layout yet, just navigate users to `/settings/connections` directly from a top-of-page banner on the dashboard for users with no grants:

```jsx
// In the dashboard page, near the top:
{coverage?.grantsCount === 0 && (
  <div className="bg-klo/5 border border-klo/20 rounded-xl p-3 mb-4">
    <span className="text-sm text-navy">
      Connect your inbox so Klo can read deal emails automatically.{' '}
      <Link to="/settings/connections" className="text-klo font-medium underline">
        Connect now →
      </Link>
    </span>
  </div>
)}
```

## Acceptance

- [ ] `/settings/connections` is reachable while signed in
- [ ] Page renders the explanatory header copy and the read-only badge
- [ ] Both connect buttons (Google + Microsoft) appear with logos
- [ ] Empty state shows when no grants exist, with helpful explanation
- [ ] After connecting Gmail, the page reloads and shows the active grant
- [ ] Coverage stat shows correctly: "Reading for X of Y active deals"
- [ ] Disconnecting prompts for confirmation
- [ ] Disconnect succeeds and the grant disappears (or shows as Disconnected)
- [ ] Expired grant shows the Reconnect CTA
- [ ] Page works on mobile (test at 375px)
- [ ] Settings nav (if exists) includes the new Connections link

## Pitfalls

- **Coverage stat misleads when stakeholder emails aren't populated** — most existing deals won't have emails until users have used Phase A for a few weeks. The "X of Y deals" looking like "0 of 6" right after connecting is correct but disappointing. The hover hint ("other deals don't have stakeholder emails yet") softens it. Consider adding a "Why?" link that explains how Klo learns stakeholder emails (from email content, over time).

- **The disconnect confirmation `confirm()` is browser-native.** Acceptable for V1; if customers complain it's jarring, swap for a custom modal in a Phase B polish pass.

- **Multiple grants of the same provider+email** — possible if a user connects rajeshwar@gmail.com twice (once on dev, once on prod). The unique constraint is on `nylas_grant_id`, not `email_address`. The list will show both. Acceptable.

- **OAuth completes but page navigates back without the new grant showing** — race between the upsert and the listGrants call. The 1.5s delay in `NylasCallbackPage` should cover it. If still flaky, increase to 3s.

- **Mobile: the buttons are full-width but on a wide phone the page is still cramped.** The `max-w-3xl mx-auto` plus `px-4` gives reasonable margins. Test at 375px and 414px.

## What this sprint does NOT do

- Notification preferences ("don't notify me about emails on weekends") — Phase B
- Grant-level filtering ("only read emails from deals tagged Gulf") — Phase B
- Multi-account selection in OAuth flow — Nylas's hosted auth handles this, but our UI doesn't surface it
- Showing Notetaker bot enable/disable per meeting — Phase B (the meeting card in deal chat would have a toggle)

→ Next: `10-manager-pool-dashboard.md`
