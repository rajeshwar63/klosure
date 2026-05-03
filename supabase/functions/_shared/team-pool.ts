// =============================================================================
// Team pool helpers — Phase A sprint 07
// =============================================================================
// Pool capacity check + 80%/100% notification dispatch. Used by the calendar
// processor to decide whether to dispatch a Recall bot, and to fire emails
// to the team owner when consumption crosses thresholds.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { sendEmail } from "./send-email.ts"

// deno-lint-ignore no-explicit-any
type SbClient = ReturnType<typeof createClient<any, "public", any>>

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
  sb: SbClient,
  teamId: string,
): Promise<PoolStatus | null> {
  const { data, error } = await sb.rpc("get_team_pool", { p_team_id: teamId })
  if (error || !data || data.length === 0) {
    if (error) console.error("loadPoolStatus failed", error)
    return null
  }
  // deno-lint-ignore no-explicit-any
  const row = (data as any[])[0]
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
 * the team's monthly pool. Solo users (no team_id) currently fail-open in
 * Phase A. Sprint 8 (pricing collapse) makes every paying user team-based,
 * which retires the solo branch.
 */
export async function canDispatchMeeting(
  sb: SbClient,
  teamId: string | null,
  expectedMinutes: number,
): Promise<{ allowed: boolean; reason?: string; status?: PoolStatus }> {
  if (!teamId) {
    return { allowed: true }
  }

  const status = await loadPoolStatus(sb, teamId)
  if (!status) return { allowed: true } // fail open if pool row missing

  if (status.meeting_minutes_used + expectedMinutes > status.meeting_minutes_total) {
    return {
      allowed: false,
      reason: `pool_exceeded: ${status.meeting_minutes_used}+${expectedMinutes} > ${status.meeting_minutes_total}`,
      status,
    }
  }
  return { allowed: true, status }
}

export type QuotaEvent = "meeting_pool_80" | "meeting_pool_full"

export async function fireQuotaNotification(
  teamId: string,
  eventType: QuotaEvent,
  status: PoolStatus,
): Promise<void> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

  const { data: team } = await sb
    .from("teams")
    .select("id, name, owner_id")
    .eq("id", teamId)
    .maybeSingle()
  if (!team) return

  const { data: owner } = await sb
    .from("users")
    .select("email, name")
    .eq("id", team.owner_id)
    .maybeSingle()
  const ownerEmail = owner?.email
  const ownerName = owner?.name ?? "there"
  if (!ownerEmail) return

  // Mark the timestamp first so a send failure doesn't cause re-sending.
  const updateField = eventType === "meeting_pool_80" ? "notified_80_at" : "notified_100_at"
  await sb
    .from("team_pool")
    .update({ [updateField]: new Date().toISOString() })
    .eq("team_id", teamId)

  const subject =
    eventType === "meeting_pool_80"
      ? `${team.name}: meeting capture at 80% of monthly pool`
      : `${team.name}: meeting capture paused — monthly pool reached`

  const body =
    eventType === "meeting_pool_80"
      ? buildEmail80(ownerName, status)
      : buildEmail100(ownerName, status)

  try {
    await sendEmail({
      to: ownerEmail,
      subject,
      html: body,
      text: stripTags(body),
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
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\n\s+/g, "\n")
    .trim()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  })
}
