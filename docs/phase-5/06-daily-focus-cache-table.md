# Step 06 — Cache table for daily focus

**Sprint:** 3
**Goal:** Cache the daily-focus output so we don't call Claude on every dashboard load. Refresh once per day per seller, OR on demand if the seller asks.

## Why cache

Without cache, every time a seller loads the dashboard, we'd call Claude — which is wasteful (deals don't materially change minute-to-minute) and expensive (Claude calls aren't free). One refresh per day is plenty for a "Today's focus" banner.

## Schema

Create a new SQL migration: `supabase/phase5_daily_focus.sql`

```sql
-- Cache of klo-daily-focus output, one row per seller
create table if not exists klo_daily_focus (
  seller_id uuid primary key references users(id) on delete cascade,
  focus_text text not null,
  deals_referenced uuid[] default '{}',
  generated_at timestamptz default now(),
  is_stale boolean default false
);

-- RLS: a seller can read their own cache row, no one else can
alter table klo_daily_focus enable row level security;

create policy "Sellers read their own focus"
on klo_daily_focus for select
to authenticated
using (seller_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies — only the service role writes via Edge Function
```

Apply this migration in the Supabase SQL Editor.

## Modify the Edge Function to use the cache

Update `klo-daily-focus/index.ts` to:

1. Check the cache first
2. If a row exists and is fresh (< 24 hours old) and `is_stale = false`, return it
3. Otherwise, generate fresh output, write to cache, return it

```typescript
// Before calling Anthropic:
const { data: cached } = await sb
  .from('klo_daily_focus')
  .select('*')
  .eq('seller_id', sellerId)
  .maybeSingle();

const url = new URL(req.url);
const forceRefresh = url.searchParams.get('refresh') === '1';

if (cached && !forceRefresh && !cached.is_stale) {
  const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3.6e6;
  if (ageHours < 24) {
    return Response.json({
      focus_text: cached.focus_text,
      deals_referenced: cached.deals_referenced,
      generated_at: cached.generated_at,
      from_cache: true
    });
  }
}

// (existing code: load deals, call Anthropic, get text)

// After successful generation, write to cache:
await sb.from('klo_daily_focus').upsert({
  seller_id: sellerId,
  focus_text: text.trim(),
  deals_referenced: referenced,
  generated_at: new Date().toISOString(),
  is_stale: false
});
```

## Invalidating the cache

The cache should be marked stale when:

1. A seller adds, archives, or wins/loses a deal — material pipeline change
2. A confidence score changes by ≥10 points on any of the seller's deals — meaningful movement worth resurfacing
3. The seller explicitly clicks "refresh focus" in the UI (step 07)

For #1 and #2, add a trigger:

```sql
-- When a deal's klo_state.confidence changes meaningfully, mark its seller's focus stale
create or replace function mark_seller_focus_stale_on_confidence_change()
returns trigger as $$
declare
  old_score int;
  new_score int;
begin
  old_score := (old.klo_state -> 'confidence' ->> 'value')::int;
  new_score := (new.klo_state -> 'confidence' ->> 'value')::int;
  if old_score is null or new_score is null or abs(coalesce(new_score, 0) - coalesce(old_score, 0)) >= 10 then
    update klo_daily_focus set is_stale = true where seller_id = new.seller_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_focus_stale_on_confidence on deals;
create trigger trg_focus_stale_on_confidence
after update of klo_state on deals
for each row
execute function mark_seller_focus_stale_on_confidence_change();

-- Also mark stale when a deal's status changes (archive, won, lost)
create or replace function mark_seller_focus_stale_on_status_change()
returns trigger as $$
begin
  if old.status is distinct from new.status then
    update klo_daily_focus set is_stale = true where seller_id = new.seller_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_focus_stale_on_status on deals;
create trigger trg_focus_stale_on_status
after update of status on deals
for each row
execute function mark_seller_focus_stale_on_status_change();
```

Add these triggers to `phase5_daily_focus.sql`.

## Acceptance

- SQL migration applies cleanly
- Calling the function twice in a row: first call generates; second call returns cached (with `from_cache: true`)
- After 24 hours, next call regenerates
- Calling with `?refresh=1` always regenerates and updates cache
- Updating a deal's `klo_state.confidence.value` by ≥10 points → next call regenerates (because `is_stale = true`)
- Closing/archiving a deal → next call regenerates
- Each seller has exactly one cache row max (upsert, not insert)

→ Next: `07-daily-focus-banner.md`
