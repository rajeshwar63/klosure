// =============================================================================
// Aurinko + Recall service — Phase B
// =============================================================================
// Frontend wrappers around the aurinko-* edge functions. The user sees only
// "Klosure" in the UI; the underlying provider names live here and in the
// edge functions.
// =============================================================================

import { supabase } from '../lib/supabase.js'

export async function startConnect({ provider }) {
  if (provider !== 'google' && provider !== 'office365') {
    return { ok: false, error: 'invalid_provider' }
  }
  const { data, error } = await supabase.functions.invoke('aurinko-auth-start', {
    body: { provider },
  })
  if (error) return { ok: false, error: error.message }
  return data
}

export async function finishConnect({ code, state }) {
  const { data, error } = await supabase.functions.invoke('aurinko-auth-finish', {
    body: { code, state },
  })
  if (error) return { ok: false, error: error.message }
  return data
}

export async function listGrants() {
  // Hide revoked grants from the UI — Aurinko issues a fresh accountId on
  // reconnect, so the stale row would otherwise sit beside the new active one.
  const { data, error } = await supabase
    .from('aurinko_grants')
    .select(
      'id, aurinko_account_id, provider, email_address, sync_state, granted_at, last_seen_at, last_error',
    )
    .neq('sync_state', 'revoked')
    .order('granted_at', { ascending: false })
  if (error) return { ok: false, error: error.message, grants: [] }
  return { ok: true, grants: data ?? [] }
}

export async function disconnectGrant({ accountId }) {
  // Soft-delete: mark sync_state='revoked' first; the webhook handler skips
  // events for revoked grants. Then call Aurinko to revoke server-side.
  const { error: updateErr } = await supabase
    .from('aurinko_grants')
    .update({ sync_state: 'revoked', last_seen_at: new Date().toISOString() })
    .eq('aurinko_account_id', accountId)
  if (updateErr) return { ok: false, error: updateErr.message }

  await supabase.functions
    .invoke('aurinko-revoke-grant', { body: { accountId } })
    .catch(() => {})

  return { ok: true }
}
