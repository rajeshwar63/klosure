// =============================================================================
// Nylas service — Phase A
// =============================================================================
// Frontend wrappers around the nylas-* edge functions. Used by the settings
// page (sprint 09) and the OAuth callback page (sprint 03).
// =============================================================================

import { supabase } from '../lib/supabase.js'

export async function startConnect({ provider }) {
  if (provider !== 'google' && provider !== 'microsoft') {
    return { ok: false, error: 'invalid_provider' }
  }
  const { data, error } = await supabase.functions.invoke('nylas-auth-start', {
    body: { provider },
  })
  if (error) return { ok: false, error: error.message }
  return data
}

export async function finishConnect({ code, state }) {
  const { data, error } = await supabase.functions.invoke('nylas-auth-finish', {
    body: { code, state },
  })
  if (error) return { ok: false, error: error.message }
  return data
}

export async function listGrants() {
  const { data, error } = await supabase
    .from('nylas_grants')
    .select(
      'id, nylas_grant_id, provider, email_address, sync_state, granted_at, last_seen_at, last_error',
    )
    .order('granted_at', { ascending: false })
  if (error) return { ok: false, error: error.message, grants: [] }
  return { ok: true, grants: data ?? [] }
}

export async function disconnectGrant({ grantId }) {
  // Soft-delete: mark sync_state='revoked' first, the webhook handler will
  // skip events for revoked grants. We also call Nylas to revoke server-side.
  const { error: updateErr } = await supabase
    .from('nylas_grants')
    .update({ sync_state: 'revoked', last_seen_at: new Date().toISOString() })
    .eq('nylas_grant_id', grantId)
  if (updateErr) return { ok: false, error: updateErr.message }

  // Fire-and-forget the Nylas-side revoke. The local row is already revoked;
  // even if Nylas is down we won't accept further events for this grant.
  await supabase.functions
    .invoke('nylas-revoke-grant', { body: { grantId } })
    .catch(() => {})

  return { ok: true }
}
