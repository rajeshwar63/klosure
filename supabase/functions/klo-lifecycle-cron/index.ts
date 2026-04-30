// =============================================================================
// klo-lifecycle-cron — Phase 12.2 + Phase 16
// =============================================================================
// Daily cron job. Schedule: 02:00 IST (20:30 UTC).
//
// Pipeline:
//   1. Mark expired trials as read-only.
//   2. Mark expired team plans as read-only.
//   3. Send "your trial ends in N days" warning (Phase 16) — fires for users
//      whose trial expires within the next 3 days.
//   4. Send 75-day "deletion in 15 days" warning emails.
//   5. Send 85-day "deletion in 5 days" final warning emails.
//   6. Hard-delete users that hit 90 days read-only.
//
// Auth model: protected by a CRON_SECRET in the x-cron-secret header. The
// function is deployed --no-verify-jwt; the shared secret is the only thing
// stopping a public caller from triggering deletions.
//
// Email copy: the warnings ALWAYS frame the action as "upgrade to keep your
// account" — never a misleading "click here to keep your data". Sending a
// payment-required CTA is honest; pretending the user can rescue data with
// one click is not.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { sendEmail } from "../_shared/send-email.ts"
import {
  trialEndingEmail,
  deletionWarningEmail,
} from "../_shared/email-templates.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"

// Window (in days) before trial_ends_at when we send the trial-ending warning.
// Picked 3 because it gives the rep a working day or two to upgrade without
// flooding them with reminders for the full 14-day trial.
const TRIAL_WARNING_DAYS_LEFT = 3

Deno.serve(async (req) => {
  // Optional shared-secret gate. Strongly recommend setting CRON_SECRET in
  // Supabase secrets so a public caller can't trigger purges.
  const cronSecret = Deno.env.get("CRON_SECRET")
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret")
    if (provided !== cronSecret) {
      return new Response("unauthorized", { status: 401 })
    }
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const log = {
    trials_expired: 0,
    teams_expired: 0,
    trial_warnings: 0,
    warning_75: 0,
    warning_85: 0,
    purged: 0,
    errors: [] as string[],
  }

  try {
    // 1. Trials → read-only
    const { data: trialResults, error: trialErr } = await sb.rpc("mark_trials_expired")
    if (trialErr) log.errors.push(`mark_trials_expired: ${trialErr.message}`)
    else log.trials_expired = (trialResults ?? []).length

    // 2. Teams → read-only
    const { data: teamResults, error: teamErr } = await sb.rpc("mark_teams_expired")
    if (teamErr) log.errors.push(`mark_teams_expired: ${teamErr.message}`)
    else log.teams_expired = (teamResults ?? []).length

    // 3. Trial-ending warnings (3 days before expiry)
    const { data: trialWarn, error: trialWarnErr } = await sb.rpc(
      "users_needing_trial_warning",
      { p_days_left: TRIAL_WARNING_DAYS_LEFT },
    )
    if (trialWarnErr) {
      log.errors.push(`trial_warn: ${trialWarnErr.message}`)
    } else {
      for (const u of (trialWarn ?? []) as Array<{
        user_id: string
        email: string
        name: string
        days_left: number
      }>) {
        try {
          const { subject, html } = trialEndingEmail({
            userEmail: u.email,
            userName: u.name,
            daysLeft: u.days_left,
            appUrl: APP_URL,
          })
          const sendRes = await sendEmail({
            to: u.email,
            subject,
            html,
            replyTo: "rajeshwar@klosure.ai",
            tags: [{ name: "type", value: "trial_ending" }],
          })
          if (!sendRes.ok) {
            log.errors.push(`trial_warn send ${u.email}: ${sendRes.error}`)
            continue
          }
          await sb
            .from("users")
            .update({ trial_ending_email_sent_at: new Date().toISOString() })
            .eq("id", u.user_id)
          log.trial_warnings++
        } catch (err) {
          log.errors.push(`trial_warn send ${u.email}: ${err}`)
        }
      }
    }

    // 4. 75-day warnings (15 days until deletion)
    const { data: warn75, error: warn75Err } = await sb.rpc("users_needing_deletion_warning", { p_days: 75 })
    if (warn75Err) {
      log.errors.push(`warn75: ${warn75Err.message}`)
    } else {
      for (const u of (warn75 ?? []) as Array<{ user_id: string; email: string; name: string }>) {
        try {
          await sendDeletionWarning(u.email, u.name, 15)
          await sb
            .from("users")
            .update({ deletion_warning_sent_at: new Date().toISOString() })
            .eq("id", u.user_id)
          log.warning_75++
        } catch (err) {
          log.errors.push(`warn75 send ${u.email}: ${err}`)
        }
      }
    }

    // 5. 85-day final warnings (5 days until deletion)
    const { data: warn85, error: warn85Err } = await sb.rpc("users_needing_deletion_warning", { p_days: 85 })
    if (warn85Err) {
      log.errors.push(`warn85: ${warn85Err.message}`)
    } else {
      for (const u of (warn85 ?? []) as Array<{ user_id: string; email: string; name: string }>) {
        try {
          await sendDeletionWarning(u.email, u.name, 5)
          await sb
            .from("users")
            .update({ final_warning_sent_at: new Date().toISOString() })
            .eq("id", u.user_id)
          log.warning_85++
        } catch (err) {
          log.errors.push(`warn85 send ${u.email}: ${err}`)
        }
      }
    }

    // 6. Purge at 90 days
    const { data: purged, error: purgeErr } = await sb.rpc("purge_expired_users")
    if (purgeErr) log.errors.push(`purge: ${purgeErr.message}`)
    else log.purged = (purged ?? []).length

    console.log(JSON.stringify({ event: "lifecycle_cron_complete", ...log }))
    return Response.json({ ok: true, ...log })
  } catch (err) {
    console.error("lifecycle cron error", err)
    return Response.json({ ok: false, error: String(err), ...log }, { status: 500 })
  }
})

async function sendDeletionWarning(email: string, name: string, daysLeft: number): Promise<void> {
  const { subject, html } = deletionWarningEmail({
    userEmail: email,
    userName: name,
    daysLeft,
    appUrl: APP_URL,
  })
  const res = await sendEmail({
    to: email,
    subject,
    html,
    replyTo: "rajeshwar@klosure.ai",
    tags: [{ name: "type", value: "deletion_warning" }],
  })
  if (!res.ok) {
    throw new Error(`deletion_warning: ${res.error}`)
  }
}
