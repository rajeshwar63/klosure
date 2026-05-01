# Sprint 07 — Team pool metering

**Sprint:** 7 of 11
**Estimated:** 1 day
**Goal:** Wire the pool throttle into the meeting dispatch path. Add the 80% notification email and the 100% throttle. Add a monthly cron to reset pools on the 1st.

## Why this matters

Meetings are 60% of per-seat cost. Without throttling, a single power-user customer with 50 hours of meetings/month destroys margins. The roadmap's pricing decision (Section 3.6) makes this a load-bearing trust commitment to customers: **"No surprise bills. When a team hits 100% of any pool, capture pauses. Manager gets a notification, not an invoice."**

This sprint enforces that promise.

## Two pieces ship

1. **Pool capacity check** added to the `nylas-process-meeting` dispatch path
2. **Pool reset cron** that runs at midnight UTC on the 1st of each month
3. **Notification emails** at 80% and 100% thresholds

## Pool check function

Add to `_shared/team-pool.ts`:

```typescript
// =============================================================================
// Team pool helpers — Phase A sprint 07
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

export interface PoolStatus {
  team_id: string
  seat_count: number
  meeting_minutes_total: number
  meeting_minutes_used: number
  meeting_minutes_pct: number
  notified_80_at: string | null
  notified_100_at: string | null
  current_period_end: string
}

export async function loadPoolStatus(
  sb: ReturnType<typeof createClient>,
  teamId: string,
): Promise<PoolStatus | null> {
  const { data, error } = await sb.rpc("get_team_pool", { p_team_id: teamId })
  if (error || !data || data.length === 0) {
    console.error("loadPoolStatus failed", error)
    return null
  }
  const row = data[0]
  return {
    team_id: row.team_id,
    seat_count: row.seat_count,
    meeting_minutes_total: row.meeting_minutes_total,
    meeting_minutes_used: row.meeting_minutes_used,
    meeting_minutes_pct: Number(row.meeting_minutes_pct ?? 0),
    notified_80_at: row.notified_80_at,
    notified_100_at: row.notified_100_at,
    current_period_end: row.current_period_end,
  }
}

/**
 * Returns true if dispatching a bot for `expectedMinutes` would NOT exceed
 * the team's monthly pool. Returns false if the team is over capacity, OR
 * the team has no team_id (solo users on the per-user pool — handled below).
 */
export async function canDispatchMeeting(
  sb: ReturnType<typeof createClient>,
  teamId: string | null,
  expectedMinutes: number,
): Promise<{ allowed: boolean; reason?: string; status?: PoolStatus }> {
  // Solo users (no team) — apply a per-user fallback pool of 15 hours/month.
  // We track that on the user row directly. Sprint 8 (pricing collapse) makes
  // every paying customer team-based, so this branch becomes vestigial.
  if (!teamId) {
    return await canDispatchSolo(sb, expectedMinutes)
  }

  const status = await loadPoolStatus(sb, teamId)
  if (!status) return { allowed: true }  // fail open if pool row missing

  if (status.meeting_minutes_used + expectedMinutes > status.meeting_minutes_total) {
    return {
      allowed: false,
      reason: `pool_exceeded: ${status.meeting_minutes_used}+${expectedMinutes} > ${status.meeting_minutes_total}`,
      status,
    }
  }
  return { allowed: true, status }
}

async function canDispatchSolo(
  sb: ReturnType<typeof createClient>,
  expectedMinutes: number,
): Promise<{ allowed: boolean; reason?: string }> {
  // Placeholder: solo users currently uncapped during Phase A.
  // Sprint 08 (pricing collapse) moves everyone to team plans, removing this branch.
  return { allowed: true }
}
```

## Update nylas-process-meeting to use the gate

Add the import and replace the placeholder check in sprint 6's dispatch flow:

```typescript
import { canDispatchMeeting } from "../_shared/team-pool.ts"

// ... inside handleCalendarEvent, after the stakeholder match check ...

  // Check 5: pool capacity.
  const expectedMinutes = Math.max(
    1,
    Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000)
  )
  const capacity = await canDispatchMeeting(sb, grant.team_id, expectedMinutes)
  if (!capacity.allowed) {
    await markEvent(event.id, "skipped_quota", capacity.reason ?? "pool_full")
    // Fire 100% notification if not yet sent (defensive — increment also fires it).
    if (capacity.status && !capacity.status.notified_100_at) {
      await fireQuotaNotification(grant.team_id!, "meeting_pool_full", capacity.status)
    }
    return json({ ok: true, skipped: "pool_full" })
  }
```

## Notification fan-out

Add to `_shared/team-pool.ts`:

```typescript
export async function fireQuotaNotification(
  teamId: string,
  eventType: "meeting_pool_80" | "meeting_pool_full",
  status: PoolStatus,
): Promise<void> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

  // Find the team owner (manager).
  const { data: team } = await sb.from("teams")
    .select("id, name, owner_id, users:owner_id(email, name)")
    .eq("id", teamId)
    .maybeSingle()

  if (!team) return

  const ownerEmail = (team.users as { email?: string })?.email
  const ownerName = (team.users as { name?: string })?.name ?? "there"
  if (!ownerEmail) return

  // Mark the notification timestamp first — even if email send fails, we
  // don't want to spam the manager.
  const updateField = eventType === "meeting_pool_80" ? "notified_80_at" : "notified_100_at"
  await sb.from("team_pool")
    .update({ [updateField]: new Date().toISOString() })
    .eq("team_id", teamId)

  // Send the email.
  const subject = eventType === "meeting_pool_80"
    ? `${team.name}: meeting capture at 80% of monthly pool`
    : `${team.name}: meeting capture paused — monthly pool reached`

  const body = eventType === "meeting_pool_80"
    ? buildEmail80(ownerName, status)
    : buildEmail100(ownerName, status)

  // Reuse the existing send-email shared helper.
  try {
    await sb.functions.invoke("internal-send-notification", {
      body: { to: ownerEmail, subject, html: body, plain: stripTags(body) },
    })
  } catch (err) {
    console.error("notification send failed", err)
  }
}

function buildEmail80(name: string, status: PoolStatus): string {
  return `
    <p>Hi ${name},</p>
    <p>Your team is at <strong>${status.meeting_minutes_pct}%</strong> of this month's meeting capture pool (${status.meeting_minutes_used} of ${status.meeting_minutes_total} minutes used).</p>
    <p>The pool resets on ${formatDate(status.current_period_end)}. If you'll need more, reply to this email and we'll set up a quick call to talk about adjusting your pool.</p>
    <p>No action needed right now — Klo will keep capturing meetings normally.</p>
    <p>— The Klosure team</p>
  `
}

function buildEmail100(name: string, status: PoolStatus): string {
  return `
    <p>Hi ${name},</p>
    <p>Your team has used 100% of this month's meeting capture pool (${status.meeting_minutes_used} of ${status.meeting_minutes_total} minutes).</p>
    <p><strong>Klo will not join meetings for the rest of this month.</strong> Email and chat keep working as normal — only meeting transcripts pause.</p>
    <p>The pool resets on ${formatDate(status.current_period_end)}. If your team needs to keep capturing meetings before then, reply to this email and we'll set up a custom plan.</p>
    <p>— The Klosure team</p>
  `
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\n\s+/g, "\n").trim()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" })
}
```

## Wire the increment-side notification

In sprint 6's `nylas-process-meeting`, the `increment_meeting_usage` RPC returns `crossed_80` and `crossed_100` flags. Use them:

```typescript
// In handleNotetakerUpdate, after the increment_meeting_usage call:

if (grantInfo?.team_id && usage && usage.length > 0) {
  const u = usage[0]
  const status = await loadPoolStatus(sb, grantInfo.team_id)
  if (u.crossed_80 && status && !status.notified_80_at) {
    await fireQuotaNotification(grantInfo.team_id, "meeting_pool_80", status)
  }
  if (u.crossed_100 && status && !status.notified_100_at) {
    await fireQuotaNotification(grantInfo.team_id, "meeting_pool_full", status)
  }
}
```

## Internal-send-notification edge function

Reuse the existing `_shared/send-email.ts` (Resend integration). Add a thin wrapper that the pool helpers can invoke:

Path: `supabase/functions/internal-send-notification/index.ts`

```typescript
import { sendEmail } from "../_shared/send-email.ts"

Deno.serve(async (req) => {
  // No JWT — service-role-only via secret header check.
  const auth = req.headers.get("X-Internal-Token") ?? ""
  if (auth !== Deno.env.get("INTERNAL_NOTIFY_TOKEN")) {
    return new Response("forbidden", { status: 403 })
  }
  const { to, subject, html, plain } = await req.json()
  await sendEmail({ to, subject, html, text: plain })
  return new Response("ok", { status: 200 })
})
```

Generate and store the token:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
supabase secrets set INTERNAL_NOTIFY_TOKEN=$([Convert]::ToHexString($bytes).ToLower())
```

Update the invoke call in `team-pool.ts` to pass the header. Or — simpler — just call `sendEmail` directly inside `fireQuotaNotification` instead of going through an edge function.

**Decision: simpler. Inline the sendEmail call.** Drop the `internal-send-notification` function entirely. The team-pool module is already a service-role context, no need for an extra hop.

```typescript
import { sendEmail } from "./send-email.ts"

// In fireQuotaNotification, replace the functions.invoke call with:
try {
  await sendEmail({ to: ownerEmail, subject, html: body, text: stripTags(body) })
} catch (err) {
  console.error("notification send failed", err)
}
```

## Monthly reset cron

Supabase doesn't have built-in cron in the OSS version, but the hosted Supabase Cloud has `pg_cron`. Use it:

Add to `supabase/phase_a.sql` (or a new `phase_a_cron.sql` if you want to keep migrations clean):

```sql
-- =============================================================================
-- Pool reset cron — runs at 00:01 UTC on the 1st of every month.
-- =============================================================================

create or replace function public.reset_team_pools()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reset all pools. Move period dates forward.
  update public.team_pool
     set current_meeting_minutes = 0,
         current_voice_minutes = 0,
         current_chat_messages = 0,
         notified_80_at = null,
         notified_100_at = null,
         current_period_start = date_trunc('month', now())::date,
         current_period_end   = (date_trunc('month', now()) + interval '1 month - 1 day')::date,
         updated_at = now();
end;
$$;

-- Schedule it. pg_cron must be enabled in the dashboard first
-- (Database -> Extensions -> pg_cron).
select cron.schedule(
  'reset-team-pools-monthly',
  '1 0 1 * *',  -- 00:01 UTC on day 1 of every month
  $$ select public.reset_team_pools(); $$
);
```

If you're not using `pg_cron` (for whatever reason) the fallback is an external scheduler (Vercel cron, GitHub Actions on schedule) hitting an edge function. For Phase A, prefer pg_cron — it's one line.

## Per-rep usage breakdown for the manager dashboard

This sprint also surfaces per-rep meeting usage data, used by sprint 10's dashboard. Add a helper:

```sql
create or replace function public.get_team_usage_by_rep(
  p_team_id uuid,
  p_year_month text default to_char(now(), 'YYYY-MM')
)
returns table (
  user_id uuid,
  user_name text,
  user_email text,
  meeting_minutes integer,
  meeting_count integer
)
language sql
stable
as $$
  select
    u.id as user_id,
    u.name as user_name,
    u.email as user_email,
    coalesce(sum(mu.duration_minutes), 0)::int as meeting_minutes,
    count(mu.id)::int as meeting_count
  from public.team_members tm
  join public.users u on u.id = tm.user_id
  left join public.meeting_usage mu
    on mu.user_id = tm.user_id
   and mu.team_id = tm.team_id
   and mu.consumed_year_month = p_year_month
  where tm.team_id = p_team_id
  group by u.id, u.name, u.email
  order by meeting_minutes desc;
$$;
```

## Acceptance

- [ ] `_shared/team-pool.ts` exists with `canDispatchMeeting`, `loadPoolStatus`, `fireQuotaNotification`
- [ ] `nylas-process-meeting` dispatch path checks pool capacity before bot dispatch
- [ ] A simulated overflow (artificially set `current_meeting_minutes` to total in DB, then schedule a meeting) results in `notetaker_state='skipped_quota'` and no Nylas bot dispatch call
- [ ] Crossing 80% during real usage fires a notification email to the team owner
- [ ] Crossing 100% during real usage fires the second email AND blocks future dispatches
- [ ] `notified_80_at` and `notified_100_at` are set so emails don't repeat
- [ ] `reset_team_pools()` works when called manually: `select reset_team_pools();` zeros out the counters
- [ ] `pg_cron` job is scheduled: `select * from cron.job` shows the entry
- [ ] `get_team_usage_by_rep(<team-uuid>)` returns one row per team member with their consumption

## Pitfalls

- **Notification spam protection** depends on `notified_80_at` / `notified_100_at`. If the cron resets these mid-month somehow (it shouldn't but be paranoid), the manager gets re-spammed. Don't add ad-hoc resets without thinking.
- **Pool race condition**: two simultaneous `increment_meeting_usage` calls could both pass the capacity check. The `for update` lock in the SQL function prevents the *increment* race, but two concurrent **dispatch** calls could both pre-flight-check below the threshold and both dispatch. Acceptable in Phase A — the ledger correctly captures both, and the next dispatch is blocked. If this becomes painful, add a "soft reservation" mechanism in Phase B.
- **The 80% notification could fire AFTER the meeting is already dispatched and the seller has already invited the bot.** That's fine — it's a *notification*, not a block. The 100% check is the actual gate.
- **pg_cron timezone** is UTC. Don't try to convert; the reset on the 1st UTC is fine for global teams.
- **Solo users skip the gate** — by design for Phase A. Sprint 8 (pricing collapse) makes everyone team-based, so this is short-lived.

## What this sprint does NOT do

- Per-rep throttling (everything is team-pool only) — by design per the roadmap
- Voice or chat-message metering with throttle — the table columns exist but we only enforce meeting minutes in Phase A
- Customer-facing pool dashboard for sellers — sprint 10 ships only the *manager* dashboard
- Auto-purchase of additional capacity — explicitly NOT in scope per roadmap Section 3.6

→ Next: `08-pricing-collapse-razorpay.md`
