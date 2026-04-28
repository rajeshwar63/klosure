// Klosure — Phase 8 + Phase 9
// Shared helper for loading a seller's profile from any Edge Function.
// Returns null if no profile row exists yet — callers must handle that case
// and fall back to no-injection (don't fabricate a profile).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export const FIELDS =
  'user_id, role, what_you_sell, icp, region, top_personas, common_deal_killer, seller_company, updated_at'

export interface SellerProfile {
  user_id: string
  role: string | null
  what_you_sell: string | null
  icp: string | null
  region: string | null
  top_personas: string[] | null
  common_deal_killer: string | null
  seller_company: string | null
  updated_at: string
}

export async function loadSellerProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<SellerProfile | null> {
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb
    .from('seller_profiles')
    .select(FIELDS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as SellerProfile | null) ?? null
}
