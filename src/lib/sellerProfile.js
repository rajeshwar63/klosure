// Klosure — Phase 8
// Tiny data-access helper for seller profile.
// All component code goes through this so we have one place to change shape.

import { supabase } from './supabase'

const FIELDS = 'user_id, role, what_you_sell, icp, region, top_personas, common_deal_killer, updated_at'

export async function getSellerProfile(userId) {
  const { data, error } = await supabase
    .from('seller_profiles')
    .select(FIELDS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data // null if no row yet
}

export async function upsertSellerProfile(userId, fields) {
  const payload = { user_id: userId, ...fields }
  const { data, error } = await supabase
    .from('seller_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select(FIELDS)
    .maybeSingle()
  if (error) throw error
  return data
}
