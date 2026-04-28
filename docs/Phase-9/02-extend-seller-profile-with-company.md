# Step 02 — Extend seller profile with company

**Goal:** Add `seller_company` to the `seller_profiles` table so deal creation can auto-populate it instead of asking the seller every time.

## Why

Right now the deal creation form asks "Your Company" on every new deal. The seller's company doesn't change between deals. We should know it from settings/onboarding and never ask again.

## Files to modify

### SQL migration

Append to `supabase/phase9_drop_commitments.sql` (or a new file `supabase/phase9_seller_profile_company.sql`):

```sql
-- =============================================================================
-- Add seller_company to seller_profiles
-- =============================================================================

alter table public.seller_profiles
  add column if not exists seller_company text;

-- Backfill from existing deals — use the most recent deal's seller_company
-- value as the default. Sellers who already filled out a deal won't be re-asked.
update public.seller_profiles sp
set seller_company = sub.seller_company
from (
  select distinct on (seller_id)
    seller_id,
    seller_company
  from public.deals
  where seller_company is not null
  order by seller_id, created_at desc
) sub
where sp.user_id = sub.seller_id
  and sp.seller_company is null;

-- Verification
select
  count(*) as profiles,
  count(seller_company) as with_company,
  count(*) filter (where seller_company is null) as without_company
from public.seller_profiles;
```

### TypeScript types

In `supabase/functions/_shared/seller-profile-loader.ts`, extend the type:

```typescript
export interface SellerProfile {
  user_id: string
  role: string | null
  what_you_sell: string | null
  icp: string | null
  region: string | null
  top_personas: string[] | null
  common_deal_killer: string | null
  seller_company: string | null  // NEW
  updated_at: string
}
```

Update the `select` string in the loader:

```typescript
const FIELDS = 'user_id, role, what_you_sell, icp, region, top_personas, common_deal_killer, seller_company, updated_at'
```

In `src/lib/sellerProfile.js` mirror the same field addition.

### Prompt section

In `supabase/functions/_shared/prompts/sections.ts`, extend `buildSellerProfileSection` to include the company line when present:

```typescript
if (profile.seller_company) lines.push(`- Company: ${profile.seller_company}`)
```

Place it as the first line — Klo grounds best when it knows the seller's brand context up front.

### Train Klo settings page

In `src/pages/TrainKloPage.jsx`:
- Add a new field at the **top** of the form (before Role): **"What's your company called?"** with placeholder `Klosure` and helper text `This is the vendor name your buyers see in deal headers and the buyer dashboard.`
- Required field
- Maps to `seller_company`

### Where seller_company is read on deal creation (preview of step 06)

Step 06 will use this. For now, the column just exists and is loaded into the profile.

## What this step does NOT do

- Does NOT remove the "Your Company" field from deal creation — that's step 06
- Does NOT enforce that profile must have `seller_company` set before deal creation — still optional at this point

## Claude Code instructions

```
1. Append the ALTER TABLE + backfill UPDATE to a Phase 9 SQL file. Apply via SQL Editor.
2. Run the verification query and report counts (profiles / with_company / without_company).
3. Update SellerProfile type in supabase/functions/_shared/seller-profile-loader.ts.
4. Update FIELDS constant in the same file.
5. Mirror in src/lib/sellerProfile.js.
6. Update buildSellerProfileSection in supabase/functions/_shared/prompts/sections.ts to include the company line.
7. Add the "Company" field to the top of the Train Klo form in src/pages/TrainKloPage.jsx.
8. Test locally: open /settings/train-klo, verify Company field appears, save and verify the row updates in seller_profiles.
9. Deploy edge functions that import seller-profile-loader: `supabase functions deploy klo-respond klo-daily-focus klo-manager --no-verify-jwt`
10. Commit: "Phase 9 step 02: add seller_company to seller_profiles"
11. Push.
```

## Acceptance

- [ ] `seller_profiles.seller_company` column exists
- [ ] Backfill populated company from existing deals
- [ ] Train Klo form has Company field at top
- [ ] Saving the form persists `seller_company`
- [ ] Klo's prompt now sees the company in `<seller_profile>` block (verify via log of full prompt on next chat)

→ Next: `03-pending-tasks-extraction.md`
