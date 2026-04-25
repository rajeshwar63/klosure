// =============================================================================
// Klosure.ai — Phase 4 "Manager talks to Klo"
// =============================================================================
// Pipeline-level coaching for sales managers. Different from klo-respond:
//   - Conversation lives in `manager_threads` + `manager_messages`, not in any
//     deal room.
//   - Context is the WHOLE pipeline for the team (every active deal across
//     every member), not a single transcript.
//   - Persona shifts: Klo speaks to the manager about reps, risk concentration,
//     and pipeline blockers, not about a single buyer.
//
// Auth model: the function expects a JWT for the manager (set --no-verify-jwt
// false on deploy). We confirm the manager owns the team via RLS-friendly
// queries on the user-bound client; pipeline reads use the service role.
//
// Deploy:
//   supabase functions deploy klo-manager
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const MODEL = Deno.env.get("KLO_MODEL") ?? "claude-sonnet-4-6"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const KLO_MANAGER_PROMPT = `You are Klo, the AI deal coach inside Klosure, now talking to a sales MANAGER about their pipeline.

# Who you are
You are the same Klo your sellers know — direct, brief, confident, 15+ years
in Gulf B2B sales. You've now been pulled aside by the manager. They want the
truth about what's happening across their team's pipeline, not a feel-good
dashboard summary.

# How you sound
- 1-3 sentences. Never an essay. Never bullet lists.
- Imperative. "Push Ahmed on the DIB deal today."
- Specific. Names, numbers, dates. Never generic.
- Confident. You've seen this exact pipeline shape before.
- No corporate speak. No "synergy". No "alignment".

# What you do
You read the WHOLE pipeline — every active deal in this manager's team — plus
all open and overdue commitments. Then you answer their question with the one
thing they should do today, who they should talk to, or which deal to dig into.

If the manager asks vague questions ("how is the pipeline?"), pick the
highest-risk thing you see and surface it. Don't summarise — direct.

You can name reps by name. You can name deals by title. You should — that's
what the manager came for.

# What you NEVER say
- "I understand…" / "Great question…" / "Let me help…"
- "You might want to consider…" / "It could be worth…"
- "Based on the data…" / "It seems like…"
- Anything starting with "As an AI…"
- Long preambles. Get to the move.
- Generic advice. "Build a forecast." "Coach your reps." Never.

# Output format
Plain text. 1-3 sentences. No JSON, no markdown headers, no lists.

Now wait for the pipeline digest and the manager's question.`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "use POST" }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const threadId = body?.thread_id
    const question = body?.question
    if (!threadId || !question) return json({ error: "thread_id + question required" }, 400)
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not set" }, 500)

    const auth = req.headers.get("Authorization")
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: auth ? { Authorization: auth } : {} },
      auth: { persistSession: false },
    })
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // Verify the caller actually owns the thread.
    const { data: thread, error: tErr } = await userClient
      .from("manager_threads")
      .select("*")
      .eq("id", threadId)
      .single()
    if (tErr || !thread) return json({ error: "thread not found", detail: tErr?.message }, 404)

    // Pipeline digest — service role for cross-rep reads.
    const { data: members } = await service
      .from("team_members")
      .select("user_id, users:users(id, name, email)")
      .eq("team_id", thread.team_id)
    const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)

    const [{ data: deals }, { data: commits }, { data: history }] = await Promise.all([
      service
        .from("deals")
        .select("*")
        .in("seller_id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("status", "active"),
      service.from("commitments").select("id, deal_id, status, due_date, task"),
      service
        .from("manager_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(20),
    ])

    const digest = renderPipeline(deals ?? [], commits ?? [], members ?? [])
    const transcript = renderTranscript(history ?? [])

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        thinking: { type: "disabled" },
        system: [
          {
            type: "text",
            text: KLO_MANAGER_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `${digest}\n\n${transcript}\n\nManager just asked: "${question}"\n\nAnswer in 1-3 sentences. Direct. Specific.`,
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const detail = await claudeRes.text()
      return json({ error: "claude error", status: claudeRes.status, detail }, 502)
    }

    const claudeData = await claudeRes.json()
    const textBlock = claudeData?.content?.find((b: { type: string }) => b.type === "text")
    const reply = textBlock?.text?.trim() || "I can't see your pipeline right now. Try again."

    const { error: insertErr } = await service.from("manager_messages").insert({
      thread_id: threadId,
      sender: "klo",
      content: reply,
    })
    if (insertErr) return json({ error: "insert failed", detail: insertErr.message }, 500)

    await service
      .from("manager_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId)

    return json({ ok: true, reply, usage: claudeData.usage })
  } catch (err) {
    return json({ error: "klo-manager crashed", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}

function renderPipeline(
  deals: Array<Record<string, unknown>>,
  commitments: Array<Record<string, unknown>>,
  members: Array<{ user_id: string; users?: { name?: string; email?: string } }>
) {
  const memberById = new Map(
    members.map((m) => [m.user_id, m.users?.name || m.users?.email || "Member"])
  )
  const lines: string[] = ["# Pipeline digest"]

  if (deals.length === 0) {
    lines.push("- No active deals.")
    return lines.join("\n")
  }

  const totalValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const red = deals.filter((d) => d.health === "red")
  const amber = deals.filter((d) => d.health === "amber")
  lines.push(
    `- Active deals: ${deals.length} · pipeline value ~${formatUsd(totalValue)}`,
    `- Health: ${red.length} red · ${amber.length} amber · ${deals.length - red.length - amber.length} green`,
  )

  const sorted = [...deals].sort((a, b) => rank(a.health) - rank(b.health))
  lines.push(`\n## Deals`)
  for (const d of sorted) {
    const sellerName = memberById.get(d.seller_id as string) || "Member"
    const own = commitments.filter((c) => c.deal_id === d.id)
    const overdue = own.filter((c) => c.status === "overdue").length
    const open = own.filter((c) => c.status === "confirmed" || c.status === "proposed").length
    lines.push(
      `- [${(d.health as string).toUpperCase()}] "${d.title}" — ${sellerName} · ${d.buyer_company || "buyer"} · ${formatUsd(Number(d.value) || 0)} · ${d.deadline ? `deadline ${d.deadline}` : "no deadline"} · ${overdue} overdue / ${open} open commitments${d.summary ? ` · summary: ${d.summary}` : ""}`,
    )
  }
  return lines.join("\n")
}

function rank(h: unknown) {
  return h === "red" ? 0 : h === "amber" ? 1 : 2
}

function formatUsd(n: number) {
  if (!n) return "$0"
  return "$" + Math.round(n).toLocaleString("en-US")
}

function renderTranscript(history: Array<{ sender: string; content: string }>) {
  if (history.length === 0) return "# Conversation\n- (this is the first turn)"
  const lines = ["# Conversation so far"]
  for (const m of history) {
    lines.push(`- ${m.sender === "klo" ? "Klo" : "Manager"}: ${m.content}`)
  }
  return lines.join("\n")
}
