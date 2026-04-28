# Step 06 — Deal creation cleanup

**Goal:** Remove the "Your Company" field from the deal creation form. Auto-populate `deals.seller_company` from `seller_profiles.seller_company`.

## Why

Sellers shouldn't have to type their own company name on every deal. Step 02 added `seller_company` to the profile. Step 06 makes deal creation use it.

## Files to modify

- `src/pages/NewDealPage.jsx` (or wherever the deal creation form lives — could be a modal)
- `src/components/NewDealForm.jsx` (if separate)

## Changes

### Remove the "Your Company" field

Delete the input, label, and any state related to seller_company in the form. Don't validate it. Don't ask for it.

### Auto-populate on submit

When the seller clicks "Create deal":

```javascript
async function handleCreate(formValues) {
  // Load profile if not already loaded
  const profile = await getSellerProfile(user.id)
  const sellerCompany = profile?.seller_company ?? null

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      seller_id: user.id,
      title: formValues.title,
      buyer_company: formValues.buyer_company,
      seller_company: sellerCompany,  // auto-filled, not from form
      value: formValues.value,
      deadline: formValues.deadline,
      stage: 'discovery',
      mode: formValues.shareWithBuyer ? 'shared' : 'solo',
    })
    .select()
    .maybeSingle()

  if (error) throw error
  navigate(`/deal/${deal.id}`)
}
```

### Edge case: profile has no seller_company

If the profile doesn't have `seller_company` set (because the seller skipped onboarding and hasn't filled the Train Klo page either), one of two paths:

**Option A — Allow null:** insert with `seller_company: null`. Klo's prompt handles missing company gracefully (the section builder skips empty fields). The deal header just shows "× {Buyer Company}" without the "Klosure × " prefix.

**Option B — Inline nudge:** if profile lacks `seller_company`, show a small inline form on deal creation:

> *Quick — what's your company called? We'll save it to your profile so we don't ask again.*

A single text field above the deal form. Save updates the profile, then deal creation proceeds.

**Recommendation: Option B.** It's a one-time micro-onboarding friction that fixes the data permanently. Better than nullable seller_company causing weird header rendering.

Implementation:

```jsx
function NewDealForm() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  // ... load profile

  const needsCompany = profile && !profile.seller_company

  return (
    <form>
      {needsCompany && (
        <InlineCompanyPrompt
          onSave={async (company) => {
            await upsertSellerProfile(user.id, { seller_company: company })
            setProfile(p => ({ ...p, seller_company: company }))
          }}
        />
      )}

      {/* rest of deal form, only enabled when needsCompany is false */}
      <input name="title" placeholder="Deal title" required />
      <input name="buyer_company" placeholder="Buyer company name" required />
      {/* etc */}
    </form>
  )
}
```

The deal form is gated behind the company being known.

## What stays in the form

- Deal title
- Buyer company name
- Deal value (optional)
- Target deadline (optional)
- "Share with buyer" toggle (sets mode to `shared` vs `solo`)

That's it. Lean.

## Backfill consideration

For existing deals that already have a `seller_company` value, do nothing — they keep theirs. Step 02's backfill already populated profiles from existing deals where possible.

For deals where `seller_company` is null and the seller now has a profile with `seller_company`, you could optionally retro-fill those deals. Not necessary for Phase 9, but easy:

```sql
update public.deals d
set seller_company = sp.seller_company
from public.seller_profiles sp
where d.seller_id = sp.user_id
  and d.seller_company is null
  and sp.seller_company is not null;
```

This is a one-time cleanup, run via SQL Editor after step 02 backfill.

## What this step does NOT do

- Does NOT change deal creation in any other way (value, deadline, share toggle all stay)
- Does NOT remove the existing `deals.seller_company` column — that stays, it's just populated from a different source
- Does NOT auto-create a profile if none exists — surface the inline company prompt instead

## Claude Code instructions

```
1. Find the deal creation page/form (likely src/pages/NewDealPage.jsx or src/components/NewDealForm.jsx).
2. Remove the "Your Company" input field, label, validation, and form state.
3. Update the create handler to load profile and auto-fill seller_company.
4. Add the InlineCompanyPrompt component for sellers with no seller_company in profile.
5. Run the optional backfill SQL on production to retro-fill seller_company on existing deals.
6. Test:
   - Seller with profile + seller_company → deal form has no company field, deal created with auto-filled company
   - Seller with profile but no seller_company → inline prompt appears, save it, then deal form unlocks
   - Seller with no profile at all → inline prompt appears (creates profile row with just company)
7. Commit: "Phase 9 step 06: deal creation cleanup"
8. Push.
```

## Acceptance

- [ ] Deal form no longer asks for "Your Company"
- [ ] New deals auto-populate `seller_company` from profile
- [ ] Inline prompt appears when profile lacks company
- [ ] Existing deals untouched
- [ ] No regression to deal creation flow

→ Next: `07-overview-redesign.md`
