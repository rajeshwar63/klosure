# Step 03 — Inject seller profile into prompts

**Sprint:** A
**Goal:** Every seller-facing LLM call (klo-respond extraction, bootstrap, daily-focus, manager) now receives the seller's profile as a structured context block. This is the change that makes Klo's coaching specific instead of generic.

## Files

- `supabase/functions/_shared/prompts/sections.ts` — add `SELLER_PROFILE_SECTION` builder
- `supabase/functions/_shared/prompts/extraction-prompt.ts` — accept and inject seller profile
- `supabase/functions/_shared/prompts/bootstrap-prompt.ts` — accept and inject seller profile
- `supabase/functions/klo-respond/index.ts` — load profile, pass to prompt builders
- `supabase/functions/klo-daily-focus/index.ts` — load profile, inject into system prompt
- `supabase/functions/klo-manager/index.ts` — load profile (manager's own profile context), inject into system prompt
- `supabase/functions/_shared/seller-profile-loader.ts` — new shared helper

## Shared loader

Create `supabase/functions/_shared/seller-profile-loader.ts`:

```typescript
// Klosure — Phase 8
// Shared helper for loading a seller's profile from any Edge Function.
// Returns null if no profile row exists yet — callers must handle that case
// and fall back to no-injection (don't fabricate a profile).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export interface SellerProfile {
  user_id: string
  role: string | null
  what_you_sell: string | null
  icp: string | null
  region: string | null
  top_personas: string[] | null
  common_deal_killer: string | null
  updated_at: string
}

export async function loadSellerProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<SellerProfile | null> {
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb
    .from('seller_profiles')
    .select('user_id, role, what_you_sell, icp, region, top_personas, common_deal_killer, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}
```

## Prompt section builder

Add to `supabase/functions/_shared/prompts/sections.ts`:

```typescript
import type { SellerProfile } from '../seller-profile-loader.ts'

/**
 * Builds the <seller_profile> XML block for injection into seller-facing prompts.
 * Returns an empty string if no profile is set — callers should never inject
 * a placeholder profile, as that would mislead the model.
 */
export function buildSellerProfileSection(profile: SellerProfile | null): string {
  if (!profile) return ''
  // Only emit fields that have actual content. Don't emit "null" or empty
  // strings — those would just confuse the model.
  const lines: string[] = []
  if (profile.role) lines.push(`- Role: ${profile.role}`)
  if (profile.what_you_sell) lines.push(`- Sells: ${profile.what_you_sell}`)
  if (profile.icp) lines.push(`- ICP: ${profile.icp}`)
  if (profile.region) lines.push(`- Region: ${profile.region}`)
  if (profile.top_personas && profile.top_personas.length > 0) {
    lines.push(`- Typically sells to: ${profile.top_personas.join(', ')}`)
  }
  if (profile.common_deal_killer) {
    lines.push(`- Common deal-killer in their world: ${profile.common_deal_killer}`)
  }
  if (lines.length === 0) return ''

  return `<seller_profile>
You are coaching this specific seller. Ground every piece of advice in their context. Do NOT give generic SaaS advice — give advice that fits their role, market, and the patterns that kill their deals.

${lines.join('\n')}
</seller_profile>`
}
```

## Where to insert in extraction-prompt

In `supabase/functions/_shared/prompts/extraction-prompt.ts`, change the signature of `buildExtractionPrompt` to accept `sellerProfile`, and inject the section right after `<deal_context>`:

```typescript
export function buildExtractionPrompt(args: {
  dealTitle: string
  buyerCompany: string
  sellerCompany: string
  mode: 'solo' | 'shared'
  recipientRole: 'seller' | 'buyer'
  currentState: KloState
  todayISO?: string
  sellerProfile: SellerProfile | null   // NEW
}): string {
  const today = args.todayISO ?? new Date().toISOString().slice(0, 10)
  const profileBlock = buildSellerProfileSection(args.sellerProfile)

  return `${EXTRACTION_PROMPT_HEADER}

<today_date>${today}</today_date>

<deal_context>
- Deal: ${args.dealTitle}
- Buyer: ${args.buyerCompany}
- Seller: ${args.sellerCompany}
- Mode: ${args.mode}
- Replying to: ${args.recipientRole}
</deal_context>

${profileBlock}

<current_klo_state>
${JSON.stringify(args.currentState)}
</current_klo_state>

Now call emit_klo_response with the updated klo_state and a chat_reply addressed to ${args.recipientRole}.`
}
```

If `profileBlock` is empty string, the resulting prompt has a blank line where it would have been — which is fine, the LLM will ignore it.

## Same change in bootstrap-prompt

Same pattern in `supabase/functions/_shared/prompts/bootstrap-prompt.ts` — add `sellerProfile` parameter, inject the section after `<deal_context>`. The bootstrap prompt benefits even more from profile context since it has no prior state to lean on.

## Wire-up in klo-respond

In `supabase/functions/klo-respond/index.ts`, before calling `buildExtractionPrompt` or `buildBootstrapPrompt`, load the profile:

```typescript
import { loadSellerProfile } from '../_shared/seller-profile-loader.ts'

// ... inside the handler, once you have the deal and seller_id ...
const sellerProfile = await loadSellerProfile(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  deal.seller_id
)

// Pass to whichever prompt builder is being called:
const systemPrompt = buildExtractionPrompt({
  // ... existing args ...
  sellerProfile,
})
```

Add error handling: if `loadSellerProfile` throws, log and fall back to `null` (i.e., no injection). Don't block the chat turn on a profile load failure.

## Wire-up in klo-daily-focus

In `supabase/functions/klo-daily-focus/index.ts`, the system prompt is built inline. Modify it to accept and inject the profile. Same pattern: load profile, build the section string, inject it into the system prompt right after the role description.

The existing daily-focus system prompt starts with:

```
You are Klo, the AI deal coach inside Klosure. You're talking to a sales person at the start of their day.
```

Update it to:

```typescript
const profileSection = buildSellerProfileSection(sellerProfile)
const systemPrompt = `You are Klo, the AI deal coach inside Klosure. You're talking to a sales person at the start of their day.

${profileSection}

[... rest of existing prompt unchanged ...]`
```

## Wire-up in klo-manager

The manager case is interesting: the *manager* is the user, but the manager has their own `seller_profiles` row (managers also sell, or at minimum oversee a region/ICP). Inject the manager's own profile so Klo's coaching of the manager is also context-aware. If the manager has no profile, no injection — same fallback.

In `supabase/functions/klo-manager/index.ts`, add the profile load using `auth.uid()` (the manager) and inject into both the chat-style system prompt AND the quarter-take prompt.

## Telemetry

Add a single log line wherever the profile is loaded:

```typescript
console.log(JSON.stringify({
  event: 'seller_profile_loaded',
  user_id: deal.seller_id,
  has_profile: !!sellerProfile,
  fn: 'klo-respond' // or 'klo-daily-focus' / 'klo-manager'
}))
```

This lets you grep logs to confirm profile injection is happening on real calls.

## Cost / token impact

The profile section adds ~50-80 tokens of input per call. At Gemini 3.1 Flash-Lite pricing ($0.10 per 1M input tokens), that's ~$0.000007 extra per call — negligible. Output tokens unchanged.

## What this step does NOT do

- Does NOT change Klo's voice rules — those are in `VOICE_SECTION` already
- Does NOT add a "Klo's read of your profile" feature — defer
- Does NOT make profile mandatory — sellers without one still get the old generic coaching, just with a banner pushing them to fill it out

## Claude Code instructions

```
1. Create supabase/functions/_shared/seller-profile-loader.ts.
2. Add buildSellerProfileSection to supabase/functions/_shared/prompts/sections.ts.
3. Modify buildExtractionPrompt and buildBootstrapPrompt signatures + bodies in supabase/functions/_shared/prompts/extraction-prompt.ts and bootstrap-prompt.ts.
4. Wire profile loading into supabase/functions/klo-respond/index.ts.
5. Wire profile loading into supabase/functions/klo-daily-focus/index.ts.
6. Wire profile loading into supabase/functions/klo-manager/index.ts.
7. Deploy all three Edge Functions: `supabase functions deploy klo-respond klo-daily-focus klo-manager --no-verify-jwt`
8. Test in production: send a chat message before AND after saving a profile. The "after" reply should reference the seller's role/ICP/region in subtle ways — not necessarily naming them, but the advice should be more situated.
9. Commit: "Phase 8 step 03: inject seller profile into all seller-facing prompts"
10. Push.
```

## Acceptance

- [ ] All three Edge Functions deploy without error
- [ ] With profile saved, a chat message about a generic situation produces measurably more specific Klo coaching (manual A/B comparison)
- [ ] Without profile saved, Klo still works as before — no regression
- [ ] Logs show `seller_profile_loaded` events with `has_profile: true` for the test user
- [ ] Daily focus and manager view also reflect the profile (test by saving profile, then loading dashboard and manager view)
- [ ] No measurable latency increase per call
- [ ] Committed and pushed

→ Next: `04-buyer-view-schema.md`
