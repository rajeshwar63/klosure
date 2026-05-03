// =============================================================================
// recall-webhook — Phase B
// =============================================================================
// Receives bot lifecycle events from Recall.ai. Recall uses Svix to sign
// webhooks: an svix-id, svix-timestamp, and svix-signature header. We verify
// the HMAC, update the recall_bots + meeting_events rows, and trigger the
// transcript processor when the bot finishes.
//
// Deploy:
//   supabase functions deploy recall-webhook --no-verify-jwt
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { decode as base64Decode } from "https://deno.land/std@0.224.0/encoding/base64.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const RECALL_WEBHOOK_SECRET = Deno.env.get("RECALL_WEBHOOK_SECRET") ?? ""

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 })
  }
  const startTime = Date.now()

  try {
    const rawBody = await req.text()
    const svixId = req.headers.get("svix-id") ?? ""
    const svixTimestamp = req.headers.get("svix-timestamp") ?? ""
    const svixSignature = req.headers.get("svix-signature") ?? ""

    const valid = await verifySvixSignature({
      id: svixId,
      timestamp: svixTimestamp,
      body: rawBody,
      signatureHeader: svixSignature,
      secret: RECALL_WEBHOOK_SECRET,
    })
    if (!valid) {
      console.warn("invalid recall webhook signature")
      return new Response("ok", { status: 200 })
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const result = await handleEvent(payload)

    console.log(JSON.stringify({
      event: "recall_webhook_complete",
      type: payload.event ?? "unknown",
      result,
      duration_ms: Date.now() - startTime,
    }))

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("recall webhook exception", err)
    return new Response("ok", { status: 200 })
  }
})

// ----- Svix signature verification ----------------------------------------

async function verifySvixSignature(args: {
  id: string
  timestamp: string
  body: string
  signatureHeader: string
  secret: string
}): Promise<boolean> {
  if (!args.signatureHeader || !args.secret || !args.id || !args.timestamp) return false

  // Svix secret format: "whsec_<base64>". Strip the prefix.
  const rawSecret = args.secret.startsWith("whsec_") ? args.secret.slice(6) : args.secret
  let secretBytes: Uint8Array
  try {
    secretBytes = base64Decode(rawSecret)
  } catch {
    return false
  }

  const signedPayload = `${args.id}.${args.timestamp}.${args.body}`
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))

  // Header format: "v1,sig1 v1,sig2 ..." — we accept if any matches.
  const tokens = args.signatureHeader.split(" ")
  for (const t of tokens) {
    const [version, sig] = t.split(",")
    if (version === "v1" && sig && constantTimeEq(sig, expected)) {
      return true
    }
  }
  return false
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// ----- Event routing ------------------------------------------------------

async function handleEvent(payload: Record<string, unknown>): Promise<string> {
  // Recall webhook envelope:
  //   { event: 'bot.status_change' | 'bot.done' | 'transcript.done',
  //     data: { bot_id, status, ... } }
  const eventType = String(payload.event ?? "").toLowerCase()
  const data = (payload.data ?? {}) as Record<string, unknown>
  const botId = String(data.bot_id ?? data.id ?? "")
  if (!botId) return "skipped_no_bot_id"

  const { data: bot } = await sb
    .from("recall_bots")
    .select("id, meeting_event_id, bot_state, user_id, team_id")
    .eq("recall_bot_id", botId)
    .maybeSingle()
  if (!bot) {
    console.warn("recall webhook for unknown bot", botId, eventType)
    return "skipped_unknown_bot"
  }

  if (eventType.startsWith("bot.status_change") || eventType.startsWith("bot.")) {
    const status = String(data.status ?? data.status_code ?? "").toLowerCase()
    const mapped = mapStatus(status)
    if (mapped) {
      await sb
        .from("recall_bots")
        .update({ bot_state: mapped, updated_at: new Date().toISOString() })
        .eq("id", bot.id)

      // Mirror the status onto meeting_events for the calendar UI.
      if (bot.meeting_event_id) {
        const meetingState = mapToNotetakerState(mapped)
        if (meetingState) {
          await sb
            .from("meeting_events")
            .update({ notetaker_state: meetingState, updated_at: new Date().toISOString() })
            .eq("id", bot.meeting_event_id)
        }
      }
    }

    // When the call has ended, kick the transcript processor.
    if (mapped === "done" || eventType === "bot.done") {
      triggerProcessor(botId)
    }
    return `status_${mapped ?? status}`
  }

  if (eventType.startsWith("transcript.")) {
    triggerProcessor(botId)
    return "transcript_event"
  }

  console.log("unhandled recall event", eventType)
  return "skipped_unhandled"
}

function mapStatus(status: string): string | null {
  switch (status) {
    case "joining_call":
    case "in_waiting_room":
      return "joining"
    case "in_call_not_recording":
    case "in_call_recording":
    case "recording":
      return "recording"
    case "call_ended":
    case "done":
      return "done"
    case "fatal":
    case "failed":
      return "failed"
    default:
      return null
  }
}

function mapToNotetakerState(botState: string): string | null {
  // meeting_events.notetaker_state enum (see phase_a.sql):
  //   'not_dispatched' | 'scheduled' | 'joined' | 'recording' |
  //   'media_processing' | 'ready' | 'failed' | 'skipped_quota' | 'cancelled'
  switch (botState) {
    case "joining":
      return "joined"
    case "in_call":
      return "joined"
    case "recording":
      return "recording"
    case "done":
      return "media_processing"
    case "transcript_ready":
      return "ready"
    case "failed":
      return "failed"
    default:
      return null
  }
}

function triggerProcessor(botId: string): void {
  sb.functions.invoke("recall-process-meeting", {
    body: { recall_bot_id: botId },
  }).catch((err) => console.warn("recall-process-meeting trigger failed", err))
}
