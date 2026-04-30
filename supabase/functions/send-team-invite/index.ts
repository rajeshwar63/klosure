// =============================================================================
// send-team-invite
// =============================================================================
// Authenticated POST. Body: { email }.
//
// Replaces the old "copy invite link, paste in Slack" flow. The manager types
// the teammate's email, clicks Invite, and the teammate gets an email with a
// real CTA. We still create the team_invites row server-side (so the existing
// accept-invite flow keeps working), and we still hand the link back in the
// response so the UI can show "invite sent + copy link as backup".
//
// Auth: extract caller from JWT, confirm they own a team. Server-side check —
// don't trust client-supplied team_id.
//
// Deploy:
//   supabase functions deploy send-team-invite
//
// Required Supabase secrets:
//   RESEND_API_KEY, FROM_EMAIL, APP_URL
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { sendEmail } from "../_shared/send-email.ts"
import { teamInviteEmail } from "../_shared/email-templates.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userId = userData.user.id
    const userEmail = userData.user.email ?? ""

    const body = await req.json().catch(() => ({}))
    const inviteEmail = String(body.email ?? "").trim().toLowerCase()
    if (!inviteEmail || !inviteEmail.includes("@")) {
      return json({ ok: false, error: "invalid_email" }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Find the team this user owns. The current product model is
    // one-team-per-owner so we don't need a teamId from the client.
    const { data: team, error: teamErr } = await sb
      .from("teams")
      .select("id, name, owner_id")
      .eq("owner_id", userId)
      .maybeSingle()
    if (teamErr) {
      console.error("team lookup failed", teamErr)
      return json({ ok: false, error: "team_lookup_failed" }, 500)
    }
    if (!team) {
      return json({ ok: false, error: "no_team_owned" }, 403)
    }

    // Pull the inviter's display name for the email body.
    const { data: inviterRow } = await sb
      .from("users")
      .select("name, email")
      .eq("id", userId)
      .maybeSingle()

    // Reuse an existing pending invite if it already exists for the same
    // (team, email). The old token stays valid — we just resend the email.
    const { data: existing } = await sb
      .from("team_invites")
      .select("id, token, status")
      .eq("team_id", team.id)
      .eq("email", inviteEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    let invite: { id: string; token: string; email: string }
    if (existing && existing.status === "pending") {
      invite = {
        id: existing.id,
        token: existing.token,
        email: inviteEmail,
      }
    } else {
      const { data: created, error: insertErr } = await sb
        .from("team_invites")
        .insert({
          team_id: team.id,
          email: inviteEmail,
          invited_by: userId,
        })
        .select("id, token, email")
        .single()
      if (insertErr || !created) {
        console.error("invite insert failed", insertErr)
        return json(
          { ok: false, error: insertErr?.message || "invite_create_failed" },
          500,
        )
      }
      invite = created
    }

    const inviteUrl = `${APP_URL.replace(/\/$/, "")}/join-team/${invite.token}`
    const { subject, html } = teamInviteEmail({
      inviteeEmail: invite.email,
      inviterName: inviterRow?.name ?? "",
      inviterEmail: inviterRow?.email ?? userEmail,
      teamName: team.name ?? "your team",
      inviteUrl,
    })

    const sendResult = await sendEmail({
      to: invite.email,
      subject,
      html,
      replyTo: inviterRow?.email || userEmail || undefined,
      tags: [
        { name: "type", value: "team_invite" },
        { name: "team_id", value: String(team.id) },
      ],
    })

    if (!sendResult.ok) {
      // Don't roll back the invite row — manager can retry / copy the link
      // manually. But surface the failure so the UI shows it.
      console.error("invite email send failed", sendResult.error)
      return json(
        {
          ok: false,
          error: "email_send_failed",
          detail: sendResult.error,
          invite: { ...invite, link: inviteUrl },
        },
        502,
      )
    }

    return json({
      ok: true,
      invite: { ...invite, link: inviteUrl },
      email_sent: !sendResult.skipped,
      email_skipped: !!sendResult.skipped,
    })
  } catch (err) {
    console.error("send-team-invite error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
