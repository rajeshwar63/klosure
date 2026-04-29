// =============================================================================
// Klosure — Phase 5 "Today's focus"
// =============================================================================
// Cross-deal coaching for a seller at the start of their day. Different from
// klo-respond (which runs per chat turn on a single deal): this function reads
// the seller's whole active pipeline at once and synthesizes ONE short
// paragraph telling them where to spend their time today.
//
// Auth model: requires a JWT for the seller themselves; we use the auth header
// to identify the caller, then read deals via the service role.
//
// Caching: klo_daily_focus (one row per seller). The function checks the cache
// first; if the row is fresh (< 24h) and not flagged stale, it returns the
// cached paragraph. Triggers in phase5_daily_focus.sql flip is_stale when the
// pipeline shifts meaningfully (≥10pt confidence swing, status change, new
// deal). Pass ?refresh=1 to bypass the cache.
//
// Deploy:
//   supabase functions deploy klo-daily-focus
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { callLlm } from "../_shared/llm-client.ts"
import { loadSellerProfile } from "../_shared/seller-profile-loader.ts"
import { buildSellerProfileSection } from "../_shared/prompts/sections.ts"
import { canWrite } from "../_shared/can-write.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const USE_GEMINI = (Deno.env.get("USE_GEMINI") ?? "true").toLowerCase() === "true"
const KLO_MODEL_GEMINI = Deno.env.get("KLO_MODEL_GEMINI") ?? "gemini-3.1-flash-lite-preview"
const KLO_MODEL_ANTHROPIC = Deno.env.get("KLO_MODEL_ANTHROPIC") ?? "claude-sonnet-4-5"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const SYSTEM_PROMPT = `You are Klo, the AI deal coach inside Klosure. You're talking to a sales person at the start of their day.

You have a digest of their active deals — confidence scores, trends, top blockers, and your previous coaching for each. Your job is to synthesize ONE coaching paragraph (3-5 sentences max) that tells them where to spend their time today.

Rules:
- Name the 1-2 deals that matter most today, BY NAME (e.g. "DIB" or the deal title)
- Open with the recommended action, then explain why in 1-2 sentences
- Be specific about why each deal matters — reference the actual blocker or signal
- Tell them what to do, in order of priority
- Don't summarize their whole pipeline. Pick the urgent stuff and ignore the rest. Sellers know they have other deals.
- If a deal is slipping (trend down, delta -10 or worse), it usually deserves the top spot
- If two deals are quiet for 5+ days, mention both as a pattern
- If everything is on track, say so briefly and point them at the highest-leverage move (usually the biggest deal in proposal stage)

VOICE — Klo speaks like a senior sales VP coaching a rep:
- Direct, not corporate. "Send the LXP proposal to Nina before Monday" — not "It might be helpful to follow up with Nina."
- Specific, not generic.
- DO NOT say: "Good morning!", "I'd recommend...", "It might be helpful...", "Have you considered...".
- DO say: "Send X to Y today.", "DIB needs your attention today.", "The next move is...".

Output a single paragraph. No bullet lists. No headers. No greetings.`

interface DealRow {
  id: string
  title: string
  buyer_company: string | null
  klo_state: Record<string, unknown> | null
  value: number | null
  deadline: string | null
  stage: string | null
  status: string | null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "use POST or GET" }, 405)
  }

  try {
    const auth = req.headers.get("Authorization")
    if (!auth) return json({ error: "not authorized" }, 401)

    // Resolve the calling seller from their JWT.
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ error: "not authorized" }, 401)
    }
    const sellerId = userData.user.id

    // Phase 12.1 — server-side licensing gate. Block daily-focus generation
    // for read-only sellers so we don't burn LLM tokens on a non-paying user.
    const writeCheck = await canWrite(SUPABASE_URL, SERVICE_ROLE_KEY, sellerId)
    if (!writeCheck.ok) {
      console.log(JSON.stringify({
        event: "klo_daily_focus_blocked_read_only",
        seller_id: sellerId,
        status: writeCheck.status,
        reason: writeCheck.reason,
      }))
      return json({
        ok: false,
        error: "account_read_only",
        status: writeCheck.status,
        message: "This account is read-only. Upgrade to continue using Klo coaching.",
      }, 402)
    }

    // Service role for the deal read so we don't depend on a per-row RLS path.
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const url = new URL(req.url)
    const forceRefresh = url.searchParams.get("refresh") === "1"

    // Cache hit path: < 24h old and not flagged stale.
    if (!forceRefresh) {
      const { data: cached } = await service
        .from("klo_daily_focus")
        .select("focus_text, deals_referenced, generated_at, is_stale")
        .eq("seller_id", sellerId)
        .maybeSingle()
      if (cached && !cached.is_stale) {
        const ageHours =
          (Date.now() - new Date(cached.generated_at).getTime()) / 3.6e6
        if (ageHours < 24) {
          return json({
            focus_text: cached.focus_text,
            deals_referenced: cached.deals_referenced ?? [],
            generated_at: cached.generated_at,
            from_cache: true,
          })
        }
      }
    }

    const { data: deals, error: dealsErr } = await service
      .from("deals")
      .select("id, title, buyer_company, klo_state, value, deadline, stage, status")
      .eq("seller_id", sellerId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(20)
    if (dealsErr) throw dealsErr

    if (!deals || deals.length === 0) {
      const emptyText =
        "No active deals yet. When you start one, Klo will start coaching across your pipeline here."
      const generatedAt = new Date().toISOString()
      await service.from("klo_daily_focus").upsert({
        seller_id: sellerId,
        focus_text: emptyText,
        deals_referenced: [],
        generated_at: generatedAt,
        is_stale: false,
      })
      return json({
        focus_text: emptyText,
        deals_referenced: [],
        generated_at: generatedAt,
        from_cache: false,
      })
    }

    const digest = (deals as DealRow[]).map((d) => {
      const ks = (d.klo_state ?? {}) as Record<string, unknown>
      const dealValue = ks.deal_value as { amount?: number } | undefined
      const deadline = ks.deadline as { date?: string } | undefined
      const confidence = ks.confidence as
        | { value?: number; trend?: string; delta?: number }
        | undefined
      const blockers = (ks.blockers as Array<{ text?: string }> | undefined) ?? []
      return {
        id: d.id,
        title: d.title,
        buyer: d.buyer_company,
        stage: (ks.stage as string | undefined) ?? d.stage,
        value: dealValue?.amount ?? d.value,
        deadline: deadline?.date ?? d.deadline,
        confidence: confidence?.value ?? null,
        trend: confidence?.trend ?? null,
        delta: confidence?.delta ?? null,
        summary: (ks.summary as string | undefined) ?? null,
        top_blocker: blockers[0]?.text ?? null,
        seller_take: (ks.klo_take_seller as string | undefined) ?? null,
      }
    })

    const userMessage = `Here's the seller's active pipeline:

${JSON.stringify(digest, null, 2)}

Write today's coaching paragraph.`

    // Phase 8 — inject seller profile so daily focus is grounded in role/ICP.
    let sellerProfile = null
    try {
      sellerProfile = await loadSellerProfile(SUPABASE_URL, SERVICE_ROLE_KEY, sellerId)
    } catch (err) {
      console.warn("seller_profile_load_failed", err)
    }
    console.log(JSON.stringify({
      event: "seller_profile_loaded",
      user_id: sellerId,
      has_profile: !!sellerProfile,
      fn: "klo-daily-focus",
    }))
    const profileSection = buildSellerProfileSection(sellerProfile)
    const systemPrompt = profileSection
      ? `${SYSTEM_PROMPT}\n\n${profileSection}`
      : SYSTEM_PROMPT

    const result = await callLlm({
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 600,
      temperature: 0.7,
    })
    if (result.toolCalled) {
      // Defensive: we didn't pass a tool, so this shouldn't happen.
      throw new Error("Unexpected tool call in klo-daily-focus")
    }
    const text = result.text.trim()

    console.log(JSON.stringify({
      event: "klo_daily_focus_complete",
      model: USE_GEMINI ? KLO_MODEL_GEMINI : KLO_MODEL_ANTHROPIC,
      seller_id: sellerId,
      deal_count: digest.length,
    }))

    // Best-effort: deals whose title or buyer name appears in Klo's paragraph.
    const lower = text.toLowerCase()
    const referenced = digest
      .filter(
        (d) =>
          (d.title && lower.includes(d.title.toLowerCase())) ||
          (d.buyer && lower.includes(d.buyer.toLowerCase())),
      )
      .map((d) => d.id)

    const generatedAt = new Date().toISOString()
    await service.from("klo_daily_focus").upsert({
      seller_id: sellerId,
      focus_text: text,
      deals_referenced: referenced,
      generated_at: generatedAt,
      is_stale: false,
    })

    return json({
      focus_text: text,
      deals_referenced: referenced,
      generated_at: generatedAt,
      from_cache: false,
    })
  } catch (err) {
    console.error("klo-daily-focus error", err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
