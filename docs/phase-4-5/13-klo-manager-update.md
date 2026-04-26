# Step 13 — Update `klo-manager` to use `klo_state` + history

**Goal:** Manager-talks-to-Klo gets sharper because it now reads structured `klo_state` (current Overview) and `klo_state_history` (recent changes) for each team deal — not just raw chat.

## Files touched

- `supabase/functions/klo-manager/index.ts` — modify the data assembly + system prompt

## What changes in data assembly

For each deal in the manager's team:

```javascript
// In klo-manager, when building the digest for the prompt
async function buildDealDigest(dealId) {
  const [dealRes, commitmentsRes, historyRes] = await Promise.all([
    sb.from('deals').select('*').eq('id', dealId).single(),
    sb.from('commitments').select('*').eq('deal_id', dealId),
    sb.from('klo_state_history')
      .select('*')
      .eq('deal_id', dealId)
      .order('changed_at', { ascending: false })
      .limit(10)
  ]);

  return {
    deal: dealRes.data,
    klo_state: dealRes.data.klo_state ?? null,
    commitments: commitmentsRes.data,
    recent_history: historyRes.data?.reverse() ?? []  // oldest first for prompt
  };
}
```

## What changes in the system prompt

Add a section explaining the structured data shape and how to use it:

```
You are coaching a sales manager. For each deal in their team, you have:

- klo_state: your current understanding of the deal (the Overview the seller and buyer see)
- recent_history: the last 10 things you changed in this deal
- commitments: structured tasks both sides have committed to

When the manager asks about a deal, prefer:

1. klo_state.summary and klo_state.klo_take_seller for the current situation
2. recent_history to answer "what changed?" / "when did X happen?" questions specifically
3. commitments for accountability — who owes what, what's overdue

Important: if recent_history shows the seller removed something (change_kind='removed'),
mention this when relevant. Example: "Raja removed Ahmed from the people list 3 days ago,
saying he was just CC'd. But Ahmed has sent 4 messages since — worth checking with Raja."

This is not surveillance — it's helping the manager see deal reality, including any
reality-bending the seller may have done.
```

## What does NOT change

- The `manager_threads` and `manager_messages` tables — same schema as Phase 4
- The frontend `ManagerKloPanel.jsx` — same UI
- The realtime subscription for the manager's chat — same as before
- Auth and team scoping — same as before (managers only see their own team's deals)

## Acceptance

- Deploy: `supabase functions deploy klo-manager --no-verify-jwt`
- As a manager, ask: "What's happening with the DIB deal?"
  - Klo's reply references `klo_state.summary`, current stage, key blockers
- As a manager, ask: "What changed in the last 3 days?"
  - Klo's reply lists specific changes from history with dates
- Force a seller to remove a stakeholder via × (with reason "just CC'd")
- As a manager, ask: "What did Raja remove?"
  - Klo's reply mentions the removal and the reason
- No regressions to the manager view UI — it loads the same, shows the same pipeline

→ Next: `14-what-changed-handling.md`
