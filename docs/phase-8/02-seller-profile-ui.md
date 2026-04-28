# Step 02 — Seller profile UI ("Train Klo")

**Sprint:** A
**Goal:** A clean, single-screen Settings page where the seller fills in 5 fields. Saves to `seller_profiles`. Becomes live for the next chat turn (no app restart needed).

## Files

- `src/pages/TrainKloPage.jsx` — new
- `src/lib/sellerProfile.js` — new (small data-access helper)
- Routing: add `/settings/train-klo` to the router (existing routing setup)
- Sidebar/menu: add "Train Klo" link in the seller's settings menu (wherever existing settings live)

## Page layout

Single-column form, max-width ~640px, centered. Premium feel — match the same visual language as the Overview / Klo Read panel (Stripe/Linear).

### Header

> **Train Klo**
>
> The more Klo knows about *you*, the less generic its coaching gets. Five questions. Two minutes. You can change these anytime.

Subtle. No marketing copy. The header is the value prop.

### Field 1 — Role

- Label: **What's your role?**
- Helper text: *Examples: Founder & CEO · Account Executive · VP Sales · Head of Growth*
- Input: single-line text input
- Placeholder: `Account Executive`
- Required
- Maps to `role`

### Field 2 — What you sell

- Label: **What do you sell, in one sentence?**
- Helper text: *Klo will use this to ground every piece of advice. Be specific.*
- Input: single-line text input (room for 1 sentence)
- Placeholder: `AI sales deal coaching SaaS for B2B revenue teams`
- Required
- Maps to `what_you_sell`

### Field 3 — ICP

- Label: **Who's your ideal buyer, in one sentence?**
- Helper text: *Industry, company size, stage. Klo coaches differently for SMB vs enterprise.*
- Input: single-line text input
- Placeholder: `Mid-market B2B SaaS revenue teams (50-500 reps) in the Gulf and India`
- Required
- Maps to `icp`

### Field 4 — Region

- Label: **Which market do you sell into?**
- Helper text: *Gulf, India SMB, US, EU. Sales cycles differ massively by region.*
- Input: single-line text input
- Placeholder: `Gulf (UAE / KSA / Qatar) primary, India secondary`
- Required
- Maps to `region`

### Field 5 — Top personas

- Label: **Which 2–5 roles do you typically sell to?**
- Helper text: *Type a role and press Enter. Klo prioritizes coaching around these stakeholders.*
- Input: tag-input (chips). Each chip is a role string. Backspace removes the last.
- Placeholder: `Type a role and press Enter`
- Min 1 chip, max 5
- Required
- Maps to `top_personas` (array)

### Field 6 — Common deal killer

- Label: **What most often kills your deals?**
- Helper text: *One sentence. Klo will watch for this on every deal.*
- Input: single-line text input
- Placeholder: `Procurement timelines drag past quarter-end and budget gets reallocated`
- Required
- Maps to `common_deal_killer`

### Save button

- Right-aligned, primary button: `Save`
- After save: button text becomes `Saved · Klo updated` for 2 seconds, then reverts to `Save`
- Above the button, a quiet line: *Last saved: just now* / *Last saved: 3 days ago* (from `updated_at`)

### First-run banner (above the form)

If the seller has no profile row yet (first time opening this page):

> 🎯 **Klo is currently using generic coaching.** Fill these in to get advice tailored to your role, market, and deal patterns.

Hide once they save the first time.

### Empty-state nudge on the dashboard

In the seller dashboard (existing page), if `seller_profiles` row doesn't exist for this user, render a dismissible banner at the top:

> Klo is giving you generic advice. **Train Klo** in 2 minutes for sharper coaching → [link to /settings/train-klo]

The banner stays until the seller either fills out the profile OR explicitly dismisses it (store dismissal in localStorage with key `klosure:trainklo:dismissed:{userId}` so it doesn't nag forever).

## Data access helper

Create `src/lib/sellerProfile.js`:

```javascript
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
```

## Routing

Add the route. Match whatever pattern is already used (likely react-router v6):

```jsx
// in the existing router file
<Route path="/settings/train-klo" element={<TrainKloPage />} />
```

If a "Settings" parent doesn't exist yet, create a minimal one or just add this as a top-level route under the authenticated shell. Don't build a full Settings hub — just this one page for now.

## Validation

Client-side, on submit:
- All 6 fields required (role, what_you_sell, icp, region, top_personas[], common_deal_killer)
- top_personas: at least 1, at most 5
- All text fields: min 3 chars, max 200 chars
- On validation failure: inline error per field, focus the first invalid field

## Aesthetic

- Match the existing Klosure design tokens — same button styles, same input styles as elsewhere in the app
- No new colors, no new fonts
- Premium feel comes from spacing, hierarchy, and copy — not flourishes
- Mobile: form stacks naturally, inputs are full-width

## What this step does NOT do

- Does NOT inject the profile into prompts yet — that's step 03
- Does NOT add a manager-side view of team members' profiles — defer to a future phase
- Does NOT validate region against any list — free text, sellers know their market

## Claude Code instructions

```
1. Read the existing routing setup (likely src/App.jsx or src/router.jsx) to understand the auth shell pattern.
2. Create src/lib/sellerProfile.js with the helper above.
3. Create src/pages/TrainKloPage.jsx — single form, 5 sections, save handler that calls upsertSellerProfile, success state.
4. Add the route /settings/train-klo to the router.
5. Add a "Train Klo" link in whatever settings/profile menu exists (or, if none exists, add a small icon-link in the top-right header).
6. On the seller Dashboard page (existing), add the empty-state banner that shows when getSellerProfile returns null. Use localStorage key klosure:trainklo:dismissed:{userId} for dismissal.
7. Test locally: open /settings/train-klo, save a profile, verify the row in Supabase, refresh the dashboard, verify banner is gone.
8. Commit: "Phase 8 step 02: Train Klo settings page"
9. Push.
```

## Acceptance

- [ ] /settings/train-klo renders the form
- [ ] All 6 fields validate as expected
- [ ] Save creates/updates a row in `seller_profiles`
- [ ] After save, dashboard banner disappears
- [ ] First-time visitor sees the "Klo is using generic coaching" banner above the form
- [ ] Mobile (375px wide): form stacks, all fields usable
- [ ] No regressions to chat, dashboard, manager view
- [ ] Committed and pushed

→ Next: `03-seller-profile-prompt-injection.md`
