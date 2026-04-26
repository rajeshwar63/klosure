# Step 08 — Manager forecast buckets

**Sprint:** 4
**Goal:** Aggregate the team's deals into three confidence buckets (Likely close / In play / Long shots) with weighted dollar amounts. Pure data layer — no UI yet.

## Files touched

- `src/services/teamForecast.js` — new
- (Optional) Supabase view if it makes the manager page faster

## Bucket definitions

```javascript
// services/teamForecast.js

export function bucketDeals(deals) {
  const active = deals.filter(d => d.status === 'active');

  const buckets = {
    likely: { deals: [], total: 0, weighted: 0 },     // confidence >= 65
    in_play: { deals: [], total: 0, weighted: 0 },    // 30 <= confidence < 65
    long_shot: { deals: [], total: 0, weighted: 0 },  // confidence < 30 (or null = unknown)
  };

  for (const deal of active) {
    const value = deal.klo_state?.deal_value?.amount ?? deal.value ?? 0;
    const confidence = deal.klo_state?.confidence?.value;
    const weighted = confidence != null ? Math.round(value * confidence / 100) : 0;

    let bucket;
    if (confidence == null) bucket = 'long_shot';
    else if (confidence >= 65) bucket = 'likely';
    else if (confidence >= 30) bucket = 'in_play';
    else bucket = 'long_shot';

    buckets[bucket].deals.push(deal);
    buckets[bucket].total += value;
    buckets[bucket].weighted += weighted;
  }

  return buckets;
}

export function computeQuarterCommit(buckets) {
  // Conservative: just the likely bucket weighted
  return buckets.likely.weighted;
}

export function computeQuarterStretch(buckets) {
  // Stretch: likely weighted + in_play weighted (treats in-play as 50% likely on average)
  return buckets.likely.weighted + Math.round(buckets.in_play.weighted * 0.6);
}
```

## Where this data comes from

The Phase 4 `team.js` service already loads team deals. Add a helper that loads the team's deals along with their `klo_state`:

```javascript
// In services/team.js (existing) or extend:

export async function getTeamPipeline(teamId) {
  // Load all team members
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId);

  if (!members || members.length === 0) return { deals: [], members: [] };

  const memberIds = members.map(m => m.user_id);

  const { data: deals } = await supabase
    .from('deals')
    .select('*, users!deals_seller_id_fkey(name)')
    .in('seller_id', memberIds)
    .eq('status', 'active');

  return { deals: deals ?? [], members };
}
```

## RLS check

The existing manages_seller RLS function (from Phase 4) already enforces that only managers see their team's deals. No changes needed — the queries above are gated by RLS automatically.

## By-rep rollup

```javascript
export function rollupByRep(deals, members) {
  const reps = new Map();

  for (const member of members) {
    reps.set(member.user_id, {
      user_id: member.user_id,
      name: null, // filled below
      role: member.role,
      active_count: 0,
      slipping_count: 0,
      silent_count: 0,
      weighted: 0,
      flag: null  // 'strong' | 'at_risk' | 'silent' | null — Klo's read of this rep's pipeline
    });
  }

  for (const deal of deals) {
    const rep = reps.get(deal.seller_id);
    if (!rep) continue;
    if (rep.name == null) rep.name = deal.users?.name ?? '—';

    rep.active_count++;

    const confidence = deal.klo_state?.confidence;
    const value = deal.klo_state?.deal_value?.amount ?? deal.value ?? 0;
    if (confidence?.value != null) {
      rep.weighted += Math.round(value * confidence.value / 100);
    }

    if (confidence?.trend === 'down' && confidence?.delta <= -10) {
      rep.slipping_count++;
    }

    // "Silent" detection — needs the deal's last message timestamp
    // We'll add that to the query above, then check 5+ days
    // For now, fall back to klo_state.summary mentioning 'silent' or 'quiet' (heuristic)
    // Real implementation: include last_message_at in the deals query
  }

  // Set the flag for each rep
  for (const rep of reps.values()) {
    if (rep.slipping_count > 0) rep.flag = 'at_risk';
    else if (rep.silent_count > 0) rep.flag = 'silent';
    else if (rep.active_count > 0 && rep.weighted >= rep.active_count * 30000) rep.flag = 'strong';
  }

  return Array.from(reps.values()).sort((a, b) => b.weighted - a.weighted);
}
```

The `silent_count` requires the deal's `last_message_at`. Add this to the deals select:

```javascript
// In getTeamPipeline:
const { data: deals } = await supabase
  .from('deals')
  .select(`
    *,
    users!deals_seller_id_fkey(name),
    last_message:messages(created_at)
  `)
  .in('seller_id', memberIds)
  .eq('status', 'active')
  .order('created_at', { foreignTable: 'last_message', ascending: false })
  .limit(1, { foreignTable: 'last_message' });
```

Then in `rollupByRep`, compute `daysSinceLastMessage` and increment `silent_count` if ≥ 5.

## Acceptance

- `bucketDeals(deals)` correctly splits deals into the three confidence buckets
- Weighted totals match (deal value × confidence / 100, summed per bucket)
- Deals without confidence go to `long_shot`
- `rollupByRep` returns rows for each team member with their counts and weighted total
- Reps without active deals still appear in the rollup with zeros
- Sort order: highest weighted first
- No service-layer regressions — existing team page still loads

This step is pure data prep. The UI comes in step 09.

→ Next: `09-manager-forecast-tab.md`
