# Step 06 — Stakeholders panel

**Sprint:** B
**Goal:** A new panel showing the people in this deal — buyer-side and seller-side — as persistent visual anchors. Each person shows name, role, company, and last-contact time.

## Why this matters

This is the biggest UX gap on the deal page right now. The deal IS the relationship with specific humans, and right now those humans are invisible until you click into Klo's full read or scan the chat. A salesperson should see Nina, Ahmed, and the unknown-signatory at-a-glance every time they open DIB.

## Files

- `src/components/deal/StakeholdersPanel.jsx` — new
- `src/components/deal/OverviewTab.jsx` — render the panel in the lower-right slot (paired with Blockers)
- `src/services/stakeholders.js` — helper to compute last-contact per person

## Where it lives

In the lower section of OverviewTab, paired with BlockersPanel:

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
  <BlockersPanel klo_state={ks} viewerRole={viewerRole} dealId={deal.id} />
  <StakeholdersPanel klo_state={ks} viewerRole={viewerRole} dealId={deal.id} />
</div>
```

## Component layout

```
┌─────────────────────────────────────────────────┐
│  ⌃ STAKEHOLDERS · 3                    + Add   │
│                                                 │
│  BUYER SIDE · Dubai Islamic Bank                │
│  ─────────────────────────────────              │
│  ● N  Nina · L&D Manager                        │
│       Last spoke 8 days ago                     │
│                                                 │
│  ● A  Ahmed · Talent Head                       │
│       Last spoke 12 days ago                    │
│                                                 │
│  ● ?  Unknown · Head of Talent Management       │
│       Signing authority — not yet identified    │
│                                                 │
│  SELLER SIDE · Disprz                           │
│  ─────────────────────────────────              │
│  ● R  Raja · Account Lead                       │
│       Last action 3 days ago                    │
└─────────────────────────────────────────────────┘
```

## Source of stakeholder data

From `klo_state.people` (already populated by Phase 4.5 extraction). Each entry has:

```typescript
{
  name: string,
  role: string,
  company: string,
  first_seen_message_id: string | null,
  added_at: string  // ISO date
}
```

The buyer/seller distinction is derived from `company`:
- If `company === deal.buyer_company` → buyer side
- If `company === deal.seller_company` (or matches the seller's organization) → seller side
- Otherwise → "Other" (probably partner/integrator/legal)

## Last-contact computation

For each person, find the most recent message in the chat where they could be associated. Heuristic:

- If the person is a buyer: find the most recent message where `sender_type === 'buyer'`
- If the person is the seller (Raja): find the most recent message where `sender_type === 'seller'` AND `sender_name === person.name`

This is approximate — Klosure doesn't have per-person message attribution for the buyer side (the buyer link is one shared identity per deal). But for now, "buyer side last spoke" can be the latest buyer message overall, and we attribute it to the most senior buyer (first person in the people list with role suggesting decision-maker).

A simpler v1: **just show the latest buyer message timestamp under all buyer-side people.** Improving per-person attribution is later work.

```javascript
// services/stakeholders.js
export async function computeLastContact(dealId, person, deal) {
  const isBuyer = person.company === deal.buyer_company;
  const senderType = isBuyer ? 'buyer' : 'seller';

  const { data } = await supabase
    .from('messages')
    .select('created_at')
    .eq('deal_id', dealId)
    .eq('sender_type', senderType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return data.created_at;
}

export function formatLastContact(iso) {
  if (!iso) return 'No recent contact';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
}
```

## Component

```jsx
import { useEffect, useState } from 'react';
import { computeLastContact, formatLastContact } from '../../services/stakeholders';

export default function StakeholdersPanel({ klo_state, viewerRole, dealId, deal }) {
  const people = klo_state?.people ?? [];
  const [contactMap, setContactMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      people.map(p => computeLastContact(dealId, p, deal).then(t => [p.name, t]))
    ).then(pairs => {
      if (!cancelled) setContactMap(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [dealId, people.length]);

  const buyerSide = people.filter(p => p.company === deal.buyer_company);
  const sellerSide = people.filter(p => p.company !== deal.buyer_company);

  return (
    <div className="bg-white border-tertiary rounded-xl p-4 md:p-5"
      style={{ borderWidth: '0.5px' }}>

      <div className="flex justify-between items-baseline mb-3">
        <span className="text-xs font-medium tracking-wider text-secondary">
          STAKEHOLDERS · {people.length}
        </span>
        {viewerRole === 'seller' && (
          <button className="text-xs text-info opacity-50 cursor-not-allowed" disabled
            title="Coming soon — Klo will help you add stakeholders by name">+ Add</button>
        )}
      </div>

      {people.length === 0 ? (
        <div className="text-sm text-tertiary py-2">
          No people identified yet. Klo will add them as they come up in chat.
        </div>
      ) : (
        <>
          {buyerSide.length > 0 && (
            <PersonGroup
              label={`BUYER SIDE · ${deal.buyer_company}`}
              people={buyerSide}
              contactMap={contactMap}
            />
          )}
          {sellerSide.length > 0 && (
            <PersonGroup
              label={`SELLER SIDE · ${deal.seller_company ?? 'Your team'}`}
              people={sellerSide}
              contactMap={contactMap}
            />
          )}
        </>
      )}
    </div>
  );
}

function PersonGroup({ label, people, contactMap }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-medium tracking-wider text-secondary mb-2">{label}</div>
      <div className="flex flex-col gap-2">
        {people.map((p, i) => (
          <PersonRow key={i} person={p} lastContact={contactMap[p.name]} />
        ))}
      </div>
    </div>
  );
}

function PersonRow({ person, lastContact }) {
  const isUnknown = person.name?.toLowerCase().startsWith('unknown') || person.name === 'Unknown';
  const initial = isUnknown ? '?' : (person.name?.[0]?.toUpperCase() ?? '?');
  const avatarBg = isUnknown ? '#FAEEDA' : '#E6F1FB';
  const avatarColor = isUnknown ? '#854F0B' : '#185FA5';

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
        style={{ background: avatarBg, color: avatarColor }}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{person.name} · {person.role}</div>
        <div className="text-xs text-tertiary">
          {isUnknown
            ? `${person.role} — not yet identified`
            : `Last spoke ${formatLastContact(lastContact)}`}
        </div>
      </div>
    </div>
  );
}
```

## Special handling — "Unknown" stakeholders

Klo sometimes records gap-stakeholders like "Unknown · Head of Talent Management" when the role is critical but the person isn't yet identified. The avatar shows "?" and the secondary text says "Head of Talent Management — not yet identified" instead of a date.

This visual cue keeps gap-stakeholders prominent without making them look like real people.

## Edge cases

- **No people in `klo_state.people`:** show empty state
- **Unknown company on a person:** put them in "Other" group (collapsed by default)
- **Last contact date null:** show "No recent contact" — not blank
- **Same name twice (rare):** show both rows, no dedup — might be different people with the same first name

## Mobile

On mobile (< 768px) the lower row's two columns stack — Stakeholders below Blockers. Each person row stays single-line where possible; the role and last-contact wrap if needed.

## Acceptance

- [ ] StakeholdersPanel appears in the lower row, right of Blockers
- [ ] DIB deal: shows Nina (L&D Manager · Dubai Islamic Bank · Last spoke X days ago), Ahmed (Talent Head · same), Unknown (Head of Talent Management — not yet identified)
- [ ] Below buyer-side group: seller-side group with Raja
- [ ] Avatars use first-letter initials with colored backgrounds
- [ ] Unknown stakeholders show "?" avatar with amber tint and "not yet identified" text
- [ ] Empty state when no people in klo_state
- [ ] + Add button visible (disabled, "coming soon" tooltip)
- [ ] Mobile: stacks below Blockers, each person row remains readable

→ Next: `07-recency-strip.md`
