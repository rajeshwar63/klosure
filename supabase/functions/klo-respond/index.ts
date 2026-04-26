// Klosure — Phase 4.5 klo-respond
// Per-turn pipeline: load context → call Klo → diff → write history → update state → post chat reply.
//
// This is the skeleton from docs/phase-4-5/06-klo-respond-skeleton.md.
// Helper bodies are filled in step 07 (07-klo-respond-wireup.md).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { buildBootstrapPrompt } from "../_shared/prompts/bootstrap-prompt.ts"
import { buildExtractionPrompt } from "../_shared/prompts/extraction-prompt.ts"
import type { KloState, KloRespondOutput, KloHistoryRow } from "../_shared/klo-state-types.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const KLO_MODEL = Deno.env.get("KLO_MODEL") ?? "claude-sonnet-4-6"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Quiet "unused import" while step 07 is pending — these are wired up next.
void buildBootstrapPrompt
void buildExtractionPrompt
void ANTHROPIC_API_KEY
void KLO_MODEL

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  if (req.method !== "POST") {
    return json({ error: "use POST" }, 405)
  }

  try {
    const { deal_id, triggering_message_id } = await req.json()
    if (!deal_id) return json({ error: "deal_id required" }, 400)

    // 1. Load context
    const ctx = await loadDealContext(deal_id)

    // 2. Decide path: bootstrap (state is null) vs normal turn
    const output = ctx.deal.klo_state == null
      ? await runBootstrap(ctx)
      : await runExtraction(ctx, triggering_message_id ?? null)

    // 3. Diff old state vs new state, append history rows
    await writeHistory(
      deal_id,
      ctx.deal.klo_state,
      output.klo_state,
      triggering_message_id ?? null,
      ctx.recipientRole,
    )

    // 4. Update deals.klo_state (and sync legacy fields)
    await updateDealState(deal_id, output.klo_state)

    // 5. Insert chat_reply as a Klo message scoped to recipientRole
    await postKloMessage(deal_id, output.chat_reply, ctx.recipientRole)

    return json({ ok: true })
  } catch (err) {
    console.error("klo-respond error", err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

// --- Stubs (filled in step 07) ---

interface MessageRow {
  id: string
  sender_type: "seller" | "buyer" | "klo"
  sender_name: string | null
  content: string
  created_at: string
}

interface DealContext {
  deal: {
    id: string
    title: string
    buyer_company: string | null
    seller_company: string | null
    value: number | null
    deadline: string | null
    mode: "solo" | "shared"
    stage: string
    klo_state: KloState | null
    [k: string]: unknown
  }
  context: {
    stakeholders?: Array<{ name?: string; role?: string; company?: string }>
    what_needs_to_happen?: string | null
    budget_notes?: string | null
    notes?: string | null
  } | null
  messages: MessageRow[]
  history: KloHistoryRow[]
  recipientRole: "seller" | "buyer"
}

async function loadDealContext(deal_id: string): Promise<DealContext> {
  const [dealRes, contextRes, messagesRes, historyRes] = await Promise.all([
    sb.from("deals").select("*").eq("id", deal_id).single(),
    sb.from("deal_context").select("*").eq("deal_id", deal_id).maybeSingle(),
    sb
      .from("messages")
      .select("id, sender_type, sender_name, content, created_at")
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: true })
      .limit(50),
    sb
      .from("klo_state_history")
      .select("*")
      .eq("deal_id", deal_id)
      .order("changed_at", { ascending: false })
      .limit(20),
  ])

  if (dealRes.error) throw dealRes.error
  const deal = dealRes.data as DealContext["deal"]
  const context = (contextRes.data ?? null) as DealContext["context"]
  const messages = (messagesRes.data ?? []) as MessageRow[]
  const history = ((historyRes.data ?? []) as KloHistoryRow[]).slice().reverse() // oldest first for the prompt

  // recipientRole = role of the most recent non-Klo message sender
  const lastNonKlo = [...messages].reverse().find((m) => m.sender_type !== "klo")
  const recipientRole: "seller" | "buyer" =
    lastNonKlo?.sender_type === "buyer" ? "buyer" : "seller"

  return { deal, context, messages, history, recipientRole }
}

async function runBootstrap(_ctx: DealContext): Promise<KloRespondOutput> {
  // TODO step 07: build bootstrap prompt, call Anthropic, parse JSON
  throw new Error("runBootstrap not implemented")
}

async function runExtraction(
  _ctx: DealContext,
  _triggering_message_id: string | null,
): Promise<KloRespondOutput> {
  // TODO step 07: build extraction prompt, call Anthropic with prompt caching, parse JSON
  throw new Error("runExtraction not implemented")
}

async function writeHistory(
  _deal_id: string,
  _oldState: KloState | null,
  _newState: KloState,
  _triggering_message_id: string | null,
  _triggered_by_role: "seller" | "buyer" | "system",
): Promise<void> {
  // TODO step 07: diff old vs new, insert one klo_state_history row per change
  throw new Error("writeHistory not implemented")
}

async function updateDealState(_deal_id: string, _state: KloState): Promise<void> {
  // TODO step 07: update deals.klo_state, AND sync legacy columns (stage, value, deadline, summary)
  throw new Error("updateDealState not implemented")
}

async function postKloMessage(
  _deal_id: string,
  _content: string,
  _visible_to: "seller" | "buyer",
): Promise<void> {
  // TODO step 07: insert into messages with sender_type='klo', visible_to set
  throw new Error("postKloMessage not implemented")
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
