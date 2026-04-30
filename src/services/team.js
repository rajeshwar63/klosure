// =============================================================================
// Team service — Phase 4 (Week 8)
// =============================================================================
// Manager view: load every deal across every member of the team the user
// owns, plus members and pending invites. RLS already permits managers to
// read their team's deals via `manages_seller`.
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { enrichDeal, sortDeals } from './dashboard.js'

export async function loadTeamPipeline({ teamId }) {
  if (!teamId) return null

  const { data: members, error: memberErr } = await supabase
    .from('team_members')
    .select('id, user_id, role, added_at, users:users(id, name, email)')
    .eq('team_id', teamId)
  if (memberErr) return { error: memberErr.message }

  const memberIds = (members ?? []).map((m) => m.user_id)
  let deals = []
  if (memberIds.length > 0) {
    const dealsRes = await supabase
      .from('deals')
      .select('*')
      .in('seller_id', memberIds)
      .order('created_at', { ascending: false })
    if (dealsRes.error) return { error: dealsRes.error.message }
    deals = dealsRes.data ?? []
  }

  const sellerById = new Map()
  for (const m of members ?? []) {
    sellerById.set(m.user_id, m.users || { id: m.user_id, name: 'Member', email: '' })
  }
  const enriched = deals.map((d) => ({
    ...enrichDeal(d),
    seller_name: sellerById.get(d.seller_id)?.name || sellerById.get(d.seller_id)?.email || 'Member',
  }))
  const sorted = sortDeals(enriched)

  const { data: invites } = await supabase
    .from('team_invites')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return {
    members: members ?? [],
    deals: sorted,
    invites: invites ?? [],
    rollUp: rollUpByMember(enriched, members ?? []),
  }
}

export function rollUpByMember(deals, members) {
  const rows = members.map((m) => ({
    user_id: m.user_id,
    member_row_id: m.id,
    name: m.users?.name || m.users?.email || 'Member',
    email: m.users?.email || '',
    role: m.role,
    activeCount: 0,
    redCount: 0,
    pipelineValue: 0,
    valueAtRisk: 0,
  }))
  const byId = new Map(rows.map((r) => [r.user_id, r]))
  for (const d of deals) {
    const row = byId.get(d.seller_id)
    if (!row) continue
    if (d.status !== 'active') continue
    row.activeCount += 1
    const v = Number(d.value) || 0
    row.pipelineValue += v
    if (d.health === 'red') {
      row.redCount += 1
      row.valueAtRisk += v
    }
  }
  return rows
}

// Create a team for the current user as the owning manager. Returns the new
// team row; the SQL trigger to auto-add the owner as a manager-member is the
// caller's responsibility (we also insert the team_members row here so the
// member-list view is complete).
export async function createTeam({ name, ownerId, ownerName, ownerEmail }) {
  if (!ownerId) return { ok: false, error: 'no owner' }
  const { data: team, error } = await supabase
    .from('teams')
    .insert({ name: name?.trim() || 'My team', owner_id: ownerId, plan: 'team' })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }

  const { error: linkErr } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: ownerId, role: 'manager' })
  if (linkErr) console.warn('[team] add owner as member', linkErr)

  // Tag the owner's profile with team_id so manager_threads work cleanly.
  await supabase.from('users').update({ team_id: team.id, plan: 'team' }).eq('id', ownerId)

  return { ok: true, team }
}

export async function inviteMember({ teamId, email, invitedBy }) {
  if (!teamId || !email) return { ok: false, error: 'team + email required' }
  const { data, error } = await supabase
    .from('team_invites')
    .insert({ team_id: teamId, email: email.trim().toLowerCase(), invited_by: invitedBy })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, invite: data }
}

export async function revokeInvite({ inviteId }) {
  const { error } = await supabase
    .from('team_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Server-side via remove_team_member RPC (security definer). The RPC enforces
// "caller owns the team" and "removed user isn't the owner", deletes the
// team_members row, and clears the removed user's users.team_id (which RLS
// would otherwise block when the manager updates someone else's row).
export async function removeMember({ memberRowId }) {
  if (!memberRowId) return { ok: false, error: 'no member id' }
  const { data, error } = await supabase.rpc('remove_team_member', { p_member_id: memberRowId })
  if (error) return { ok: false, error: error.message }
  return data || { ok: false, error: 'no_response' }
}

// Invitee redeems a pending invite. Server-side `accept_team_invite` validates
// that the token matches and the signed-in user's email is the one invited,
// then inserts the team_members row and tags users.team_id.
export async function acceptInvite({ token }) {
  if (!token) return { ok: false, error: 'no token' }
  const { data, error } = await supabase.rpc('accept_team_invite', { p_token: token })
  if (error) return { ok: false, error: error.message }
  return data || { ok: false, error: 'no_response' }
}

export function buildInviteLink(token) {
  if (!token) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/join-team/${token}`
}

// =============================================================================
// Phase 11 additions
// =============================================================================

// Anonymous-friendly invite preview. Calls the get_invite_preview RPC which is
// granted to both `anon` and `authenticated` — a visitor with the token can
// see what they'd be accepting before signing in.
export async function getInvitePreview({ token }) {
  if (!token) return { ok: false, error: 'no token' }
  const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token })
  if (error) return { ok: false, error: error.message }
  return data || { ok: false, error: 'no_response' }
}

// Self-service team creation: the signed-in user becomes the team owner
// (manager). Used from /billing → "Create a team". Idempotent-ish — if the
// user already owns a team, returns that team instead of creating a new one.
export async function createTeamForCurrentUser({ teamName }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData?.session?.user?.id
  if (!userId) return { ok: false, error: 'not signed in' }

  const { data: existing } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()
  if (existing) return { ok: true, team: existing, alreadyExists: true }

  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .insert({ name: teamName?.trim() || 'My team', owner_id: userId, plan: 'team' })
    .select()
    .single()
  if (teamErr) return { ok: false, error: teamErr.message }

  const { error: linkErr } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: userId, role: 'manager' })
  if (linkErr) {
    console.warn('[team] add owner as member', linkErr)
  }

  await supabase
    .from('users')
    .update({ team_id: team.id, plan: 'team' })
    .eq('id', userId)

  return { ok: true, team }
}
