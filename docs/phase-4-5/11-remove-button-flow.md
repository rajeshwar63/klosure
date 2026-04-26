# Step 11 — × Remove button + reason flow

**Goal:** Add the × button to each removable item in the Overview. Clicking opens a tiny inline prompt for the reason. Submit → call `klo-removal` Edge Function. Item disappears, toast shows.

## Files touched

- `src/components/RemoveButton.jsx` — new
- `src/services/removal.js` — wrapper for the Edge Function call
- `OverviewView.jsx` and section components — add `<RemoveButton>` to People, Blockers, Open Questions

## Component

```jsx
import { useState } from 'react';
import { requestRemoval } from '../services/removal';

export default function RemoveButton({ dealId, kind, match, label, onRemoved, addedAt }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Disable × on items added in the last 10 seconds (race-protection guard from earlier ambiguities)
  const tooNew = addedAt && (Date.now() - new Date(addedAt).getTime()) < 10_000;

  async function submit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await requestRemoval({ dealId, kind, match, reason: reason.trim() });
      setOpen(false);
      setReason('');
      onRemoved?.();
    } catch (err) {
      alert(`Couldn't remove: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (tooNew) {
    return <span className="remove-disabled" title="Just added — wait a moment">×</span>;
  }

  if (!open) {
    return (
      <button className="remove-btn" onClick={() => setOpen(true)} aria-label={`Remove ${label}`}>×</button>
    );
  }

  return (
    <div className="remove-prompt">
      <input
        autoFocus
        type="text"
        placeholder="What's wrong? (one line)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        disabled={submitting}
      />
      <button onClick={submit} disabled={submitting || !reason.trim()}>Remove</button>
      <button onClick={() => setOpen(false)} className="cancel">Cancel</button>
    </div>
  );
}
```

## Service

```javascript
// src/services/removal.js
export async function requestRemoval({ dealId, kind, match, reason }) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error('not signed in');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klo-removal`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ deal_id: dealId, kind, match, reason })
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Removal failed (${res.status})`);
  }
  return res.json();
}
```

## Integration

In each section component, render `<RemoveButton>` next to each item:

**People grid:**
```jsx
<RemoveButton
  dealId={dealId}
  kind="people"
  match={{ name: person.name, role: person.role }}
  label={`${person.name} (${person.role})`}
  addedAt={person.added_at}
  onRemoved={() => { /* realtime will refresh */ }}
/>
```

**Blockers and open questions:** match by their unique-ish identifying field. For blockers and questions where the text might be long, match on `text` or on `added_at` if you have it.

## Buyer view

In step 12 we'll disable removal for buyers entirely. For now, only render `<RemoveButton>` when `viewerRole === 'seller'`.

## Toast

If you don't have a toast component, add a minimal one (or just use the browser default). After successful removal, show: *"Removed. Klo won't re-add this."* for 2-3 seconds.

## Acceptance

- × button appears on each person, blocker, open question (seller view)
- Clicking × opens an inline input for the reason
- Empty reason can't submit (button disabled)
- Submit → item disappears from Overview within 1 second (via realtime)
- The removed item appears in `klo_state.removed_items` (verify in SQL)
- A `klo_state_history` row exists with `change_kind='removed'` and reason populated
- Send a new chat message that mentions the removed person → Klo does NOT re-add them
- × on items added in current turn (within 10s) is disabled

→ Next: `12-buyer-view-differences.md`
