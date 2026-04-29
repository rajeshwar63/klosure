// =============================================================================
// klo-lifecycle-cron — Phase 12.2
// =============================================================================
// Daily cron job. Schedule: 02:00 IST (20:30 UTC).
//
// Pipeline:
//   1. Mark expired trials as read-only.
//   2. Mark expired team plans as read-only.
//   3. Send 75-day "deletion in 15 days" warning emails.
//   4. Send 85-day "deletion in 5 days" final warning emails.
//   5. Hard-delete users that hit 90 days read-only.
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@klosure.ai"
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"

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

    // 3. 75-day warnings (15 days until deletion)
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

    // 4. 85-day final warnings (5 days until deletion)
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

    // 5. Purge at 90 days
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
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping warning email to", email)
    return
  }
  const subject =
    daysLeft === 15
      ? "Your Klosure account will be deleted in 15 days"
      : "Your Klosure account will be deleted in 5 days — last chance"

  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,"

  // Copy keeps the CTA honest: upgrade to keep the account. We do NOT promise
  // that "clicking" or "logging in" preserves data — only a paid plan does.
  const body = `<p>${greeting}</p>
    <p>Your Klosure account has been read-only for some time. To preserve your deals and continue using Klosure, please upgrade to a paid plan within the next ${daysLeft} days.</p>
    <p><a href="${APP_URL}/billing" style="background:#3b82f6;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">See plans</a></p>
    <p>After ${daysLeft} days, your account and all associated deals will be permanently deleted. This cannot be undone.</p>
    <p>If you have any questions, reply to this email — I read every one.</p>
    <p>— Rajeshwar<br>Klosure</p>`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Klosure <${FROM_EMAIL}>`,
      to: email,
      subject,
      html: body,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`resend: ${res.status} ${text}`)
  }
}
