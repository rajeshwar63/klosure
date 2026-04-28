# Step 05 — Onboarding modal

**Goal:** First time a seller lands on the dashboard after signup, show a modal with the Train Klo profile fields. Skippable. Banner + this modal converge sellers into filling the profile.

## Why

Currently sellers can use Klosure for hours without filling the profile. They feel "Klo is generic" and bounce. An upfront modal converts higher than a settings page they have to discover.

Per the locked decision: skippable. We don't block the dashboard. Banner remains as the persistent nag.

## Files to create / modify

- `src/components/onboarding/OnboardingModal.jsx` — new
- `src/pages/DashboardPage.jsx` — gate modal on first visit

## Trigger logic

```javascript
// On dashboard mount, after user is authenticated and seller_profiles is fetched:
const hasSeenOnboarding = localStorage.getItem(`klosure:onboarding:seen:${user.id}`)
const hasProfile = !!sellerProfile && !!sellerProfile.role  // any field implies profile exists
const shouldShowModal = !hasSeenOnboarding && !hasProfile

useEffect(() => {
  if (shouldShowModal) setModalOpen(true)
}, [shouldShowModal])
```

Once the modal is opened (or dismissed), set `klosure:onboarding:seen:{user.id}` to `'true'` so it never shows again — even if they didn't fill anything in. The dashboard banner picks up from there.

## Modal structure

```
┌──────────────────────────────────────────────────────────────┐
│                                                          ╳   │
│   ◆ Welcome to Klosure                                       │
│                                                              │
│   The more Klo knows about you, the less generic its         │
│   coaching gets. Six fields. Two minutes.                    │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Company name                                          │  │
│   │ [Klosure                                            ] │  │
│   └──────────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Your role                                             │  │
│   │ [Founder & CEO                                      ] │  │
│   └──────────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ What do you sell, in one sentence?                    │  │
│   │ [AI sales coaching software for B2B revenue teams   ] │  │
│   └──────────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Who's your ideal buyer?                               │  │
│   │ [Mid-market B2B SaaS in Gulf and India              ] │  │
│   └──────────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Region                                                │  │
│   │ [Gulf primary, India secondary                      ] │  │
│   └──────────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Top personas (Enter to add)                           │  │
│   │ [CRO] [VP Sales] [+ add more...]                      │  │
│   └──────────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ What most often kills your deals?                     │  │
│   │ [Procurement timelines drag past quarter-end        ] │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│         [Skip for now]              [Save & continue]        │
└──────────────────────────────────────────────────────────────┘
```

Component sketch:

```jsx
function OnboardingModal({ open, onClose, user }) {
  const [fields, setFields] = useState({
    seller_company: '',
    role: '',
    what_you_sell: '',
    icp: '',
    region: '',
    top_personas: [],
    common_deal_killer: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await upsertSellerProfile(user.id, fields)
      localStorage.setItem(`klosure:onboarding:seen:${user.id}`, 'true')
      onClose({ saved: true })
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    localStorage.setItem(`klosure:onboarding:seen:${user.id}`, 'true')
    onClose({ saved: false })
  }

  if (!open) return null

  return (
    <Modal onClose={handleSkip}>
      {/* form structure */}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={handleSkip}>Skip for now</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save & continue'}
        </button>
      </div>
    </Modal>
  )
}
```

## Validation

- Allow save with any subset of fields filled (don't enforce all 7 mandatory in the modal — that's what the banner is for, gentle nudge)
- Clicking Save with empty fields just stores nothing and dismisses
- Clicking Skip dismisses without saving anything

But: nudge — show a tiny inline hint under fields that say *"At minimum: Company, Role, ICP — these are the most useful for Klo."*

## Reuse over duplication

The fields here are identical to the Train Klo settings page. Extract a shared `<TrainKloFormFields />` component used in both places. Form state managed by parent (modal vs page); fields are pure controlled inputs.

## Aesthetic

- Match Klosure's existing modal pattern (if one exists) or introduce a clean centered modal
- Soft backdrop (rgba(0,0,0,0.4))
- Modal max-width ~520px, generous padding, rounded corners
- Mobile: modal fills screen with margin
- Same Stripe/Linear feel as the buyer dashboard

## What this step does NOT do

- Does NOT make profile mandatory — skip is a real option
- Does NOT show on every login — once dismissed, never again (per user)
- Does NOT include a "tour" of the app — too aggressive, just the form

## Claude Code instructions

```
1. Create src/components/onboarding/OnboardingModal.jsx.
2. Extract shared TrainKloFormFields component from src/pages/TrainKloPage.jsx so both surfaces use it.
3. Update src/pages/TrainKloPage.jsx to use the shared component.
4. Wire OnboardingModal into the dashboard page with the trigger logic above.
5. Test:
   - Sign up a new test user (or clear localStorage for an existing user)
   - Visit /dashboard — modal should appear
   - Click Skip — modal closes, localStorage flag set, doesn't return on refresh
   - For another fresh user, fill all fields and click Save — verify seller_profiles row created
6. Commit: "Phase 9 step 05: onboarding modal"
7. Push.
```

## Acceptance

- [ ] First-time sellers see modal on dashboard
- [ ] Modal is skippable and never re-appears for that user after skip/save
- [ ] Saved fields persist correctly
- [ ] Mobile: modal renders without overflow
- [ ] Existing sellers (with profile) never see modal

→ Next: `06-deal-creation-cleanup.md`
