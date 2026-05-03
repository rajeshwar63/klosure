// Klosure — Phase 4.5 klo-respond
// Per-turn pipeline: load context → call Klo → diff → write history → update state → post chat reply.
//
// This is the skeleton from docs/phase-4-5/06-klo-respond-skeleton.md.
// Helper bodies are filled in step 07 (07-klo-respond-wireup.md).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { buildBootstrapPrompt } from "../_shared/prompts/bootstrap-prompt.ts"
import { buildExtractionPrompt } from "../_shared/prompts/extraction-prompt.ts"
import type {
  KloState,
  KloRespondOutput,
  BuyerView,
  BuyerViewOutcome,
} from "../_shared/klo-state-types.ts"
import type { LlmMessage, LlmToolDefinition } from "../_shared/llm-types.ts"
import { callLlm } from "../_shared/llm-client.ts"
import { loadSellerProfile, type SellerProfile } from "../_shared/seller-profile-loader.ts"
import { detectMaterialChange } from "../_shared/material-change-detector.ts"
import { buildBuyerViewPrompt } from "../_shared/prompts/buyer-view-prompt.ts"
import { BUYER_VIEW_TOOL } from "../_shared/buyer-view-tool.ts"
import { canWrite } from "../_shared/can-write.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const USE_GEMINI = (Deno.env.get("USE_GEMINI") ?? "true").toLowerCase() === "true"
const KLO_MODEL_GEMINI = Deno.env.get("KLO_MODEL_GEMINI") ?? "gemini-3.1-flash-lite-preview"
const KLO_MODEL_ANTHROPIC = Deno.env.get("KLO_MODEL_ANTHROPIC") ?? "claude-sonnet-4-5"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const KLO_OUTPUT_TOOL: LlmToolDefinition = {
  name: "emit_klo_response",
  description: `Emit Klo's response to the user's most recent message.

You MUST call this tool exactly once. Do not return free-form text.

The chat_reply is what the user sees in chat — Klo's conversational coaching reply. STRICT MAXIMUM: 4 sentences. Often 2-3 is enough.

The klo_state is the complete structured record of this deal AFTER incorporating any new information from the user's latest message. Every field in klo_state must be present. Use null (or empty arrays) for fields that don't apply yet. Do not omit any fields.`,
  parameters: {
    type: "object",
    properties: {
      klo_state: {
        type: "object",
        properties: {
          version: { type: "number" },
          summary: {
            type: ["string", "null"],
            description: "ONE sentence describing the current deal state. Max 30 words. Null if deal is brand new.",
          },
          stage: { type: "string", enum: ["discovery", "proposal", "negotiation", "legal", "closed"] },
          stage_reasoning: { type: "string" },
          deal_value: {
            type: ["object", "null"],
            properties: {
              amount: { type: "number" },
              currency: { type: "string" },
              confidence: { type: "string", enum: ["definite", "tentative"] },
              source_message_id: { type: ["string", "null"] },
            },
          },
          deadline: {
            type: ["object", "null"],
            properties: {
              date: { type: "string" },
              confidence: { type: "string", enum: ["definite", "tentative"] },
              previous: { type: ["string", "null"] },
              note: { type: ["string", "null"] },
              source_message_id: { type: ["string", "null"] },
            },
          },
          people: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                company: { type: "string" },
                first_seen_message_id: { type: ["string", "null"] },
                added_at: { type: "string" },
              },
              required: ["name", "role", "company", "added_at"],
            },
          },
          decisions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                what: { type: "string" },
                when: { type: "string" },
                source_message_id: { type: ["string", "null"] },
              },
              required: ["what", "when"],
            },
          },
          blockers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                since: { type: "string" },
                severity: { type: "string", enum: ["green", "amber", "red"] },
                source_message_id: { type: ["string", "null"] },
                added_at: { type: "string" },
              },
              required: ["text", "since", "severity", "added_at"],
            },
          },
          open_questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                source_message_id: { type: ["string", "null"] },
                added_at: { type: "string" },
              },
              required: ["text", "added_at"],
            },
          },
          removed_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["people", "blockers", "open_questions", "decisions"] },
                value: {},
                reason: { type: "string" },
                removed_at: { type: "string" },
              },
              required: ["kind", "value", "reason", "removed_at"],
            },
          },
          klo_take_seller: {
            type: ["string", "null"],
            description: "2-3 sentence coaching paragraph for the seller. Max 240 chars (~40 words). Direct and specific.",
          },
          klo_take_buyer: {
            type: ["string", "null"],
            description: "2 sentence coaching for the buyer. Max 180 chars. ONLY populate if mode is 'shared' (buyer has joined the deal). On solo seller deals, set to null to save tokens.",
          },
          confidence: {
            type: ["object", "null"],
            properties: {
              value: { type: "integer", minimum: 0, maximum: 100 },
              trend: { type: "string", enum: ["up", "down", "flat"] },
              delta: { type: "integer" },
              factors_dragging_down: {
                type: "array",
                maxItems: 3,
                description: "Top 3 factors dragging confidence down. Most impactful first.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Max 12 words." },
                    impact: { type: "integer", maximum: 0 },
                  },
                  required: ["label", "impact"],
                },
              },
              factors_to_raise: {
                type: "array",
                maxItems: 3,
                description: "Top 3 actions that would raise confidence. Highest impact first.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Max 12 words." },
                    impact: { type: "integer", minimum: 0 },
                  },
                  required: ["label", "impact"],
                },
              },
              rationale: {
                type: "string",
                description: "ONE sentence explaining the score. Max 25 words.",
              },
              computed_at: { type: "string" },
            },
            required: [
              "value",
              "trend",
              "delta",
              "factors_dragging_down",
              "factors_to_raise",
              "rationale",
              "computed_at",
            ],
          },
          previous_confidence_value: {
            type: ["integer", "null"],
          },
          next_meeting: {
            type: ["object", "null"],
            properties: {
              date: { type: "string" },
              title: { type: "string" },
              with: {
                type: "array",
                items: { type: "string" },
              },
              confidence: { type: "string", enum: ["definite", "tentative"] },
              source_message_id: { type: ["string", "null"] },
            },
            required: ["date", "title", "with", "confidence"],
          },
          last_meeting: {
            type: ["object", "null"],
            properties: {
              date: { type: "string" },
              title: { type: "string" },
              outcome_note: { type: ["string", "null"] },
              source_message_id: { type: ["string", "null"] },
            },
            required: ["date", "title"],
          },
          pending_on_seller: {
            type: "array",
            description: "Tasks the seller (vendor) owes — extracted from chat. Max 10 active items. See extraction rules for what qualifies. Always emit (empty array if none).",
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable hash-derived ID. Same task across turns gets same ID." },
                task: { type: "string", description: "≤ 12 words." },
                due_date: { type: ["string", "null"], description: "ISO date or null." },
                status: { type: "string", enum: ["pending", "overdue", "done"] },
                source_message_id: { type: ["string", "null"] },
                added_at: { type: "string", description: "ISO timestamp when first detected." },
              },
              required: ["id", "task", "due_date", "status", "source_message_id", "added_at"],
            },
          },
          pending_on_buyer: {
            type: "array",
            description: "Tasks the buyer (client) owes — extracted from chat. Max 10 active items. See extraction rules for what qualifies. Always emit (empty array if none).",
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable hash-derived ID. Same task across turns gets same ID." },
                task: { type: "string", description: "≤ 12 words." },
                due_date: { type: ["string", "null"], description: "ISO date or null." },
                status: { type: "string", enum: ["pending", "overdue", "done"] },
                source_message_id: { type: ["string", "null"] },
                added_at: { type: "string", description: "ISO timestamp when first detected." },
              },
              required: ["id", "task", "due_date", "status", "source_message_id", "added_at"],
            },
          },
          next_actions: {
            type: "array",
            description: "3-5 seller-side moves for this week (mirrors buyer playbook). Empty array if nothing meaningful to recommend.",
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable hash-derived ID." },
                action: { type: "string", description: "≤ 12 words, imperative voice." },
                why_it_matters: { type: "string", description: "1 sentence in Klo's seller voice." },
                who: { type: "string", description: "'you', a teammate role, or a named stakeholder." },
                deadline: { type: ["string", "null"], description: "ISO date or null." },
                status: { type: "string", enum: ["not_started", "in_flight", "done"] },
              },
              required: ["id", "action", "why_it_matters", "who", "deadline", "status"],
            },
          },
        },
        required: [
          "version",
          "summary",
          "stage",
          "deal_value",
          "deadline",
          "people",
          "decisions",
          "blockers",
          "open_questions",
          "removed_items",
          "klo_take_seller",
          "klo_take_buyer",
          "confidence",
          "next_meeting",
          "last_meeting",
          "pending_on_seller",
          "pending_on_buyer",
          "next_actions",
        ],
      },
      chat_reply: {
        type: "string",
        description: "Klo's chat reply to the user. STRICT MAXIMUM: 4 sentences, ~60 words. Often 2-3 is enough.",
      },
    },
    required: ["klo_state", "chat_reply"],
  },
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  if (req.method !== "POST") {
    return json({ error: "use POST" }, 405)
  }

  try {
    const { deal_id, triggering_message_id, regenerate_buyer_view } = await req.json()
    if (!deal_id) return json({ error: "deal_id required" }, 400)

    // 1. Load context
    const ctx = await loadDealContext(deal_id)

    // Phase 12.1 — server-side licensing gate. Block Klo coaching for
    // read-only / cancelled / pending-deletion accounts so a stale client
    // (or a direct API call) can't burn tokens on a non-paying seller.
    // The seller_id comes from the deal row, not the JWT — this function
    // runs as service role and never verifies the caller's token.
    const sellerId = ctx.deal.seller_id as string
    if (sellerId) {
      const writeCheck = await canWrite(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sellerId)
      if (!writeCheck.ok) {
        console.log(JSON.stringify({
          event: "klo_respond_blocked_read_only",
          deal_id,
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
    }

    // Phase 8 — manual buyer-view refresh path. Skip the main extraction;
    // just rerun the buyer-view generation against the current klo_state.
    if (regenerate_buyer_view) {
      if (!ctx.deal.klo_state) {
        return json({ error: "no klo_state to base buyer view on" }, 400)
      }
      let sellerProfileForRefresh: SellerProfile | null = null
      try {
        sellerProfileForRefresh = await loadSellerProfile(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
          ctx.deal.seller_id as string,
        )
      } catch {
        sellerProfileForRefresh = null
      }
      const refreshedView = await runBuyerViewRefresh({
        deal: ctx.deal,
        currentState: ctx.deal.klo_state,
        sellerProfile: sellerProfileForRefresh,
      })
      if (!refreshedView) {
        return json({ ok: false, error: "buyer view refresh failed" }, 502)
      }
      return json({ ok: true, buyer_view: refreshedView })
    }

    // 1b. Load the seller's profile (Phase 8) — null if no profile saved yet.
    //     Failure to load must not block the turn; fall back to no injection.
    let sellerProfile: SellerProfile | null = null
    try {
      sellerProfile = await loadSellerProfile(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        ctx.deal.seller_id as string,
      )
    } catch (err) {
      console.warn("seller_profile_load_failed", err)
      sellerProfile = null
    }
    console.log(JSON.stringify({
      event: "seller_profile_loaded",
      user_id: ctx.deal.seller_id,
      has_profile: !!sellerProfile,
      fn: "klo-respond",
    }))

    // 2. Decide path: bootstrap (state is null) vs normal turn
    const output = ctx.deal.klo_state == null
      ? await runBootstrap(ctx, sellerProfile)
      : await runExtraction(ctx, triggering_message_id ?? null, sellerProfile)

    // 2b. Preserve previous confidence value so the next turn can compute trend/delta.
    if (output.klo_state.confidence) {
      output.klo_state.previous_confidence_value =
        ctx.deal.klo_state?.confidence?.value ?? undefined
    }

    // 3. Diff old state vs new state, append history rows
    await writeHistory(
      deal_id,
      ctx.deal.klo_state,
      output.klo_state,
      triggering_message_id ?? null,
      ctx.recipientRole,
    )

    // 4. Update deals.klo_state (and sync legacy fields). The main extraction
    //    tool does not emit buyer_view (that's a separate gated call), so
    //    carry forward the previous buyer_view to avoid dropping it on every
    //    non-material turn. maybeRegenerateBuyerView below will overwrite it
    //    when material change is detected.
    const stateToWrite: KloState = {
      ...output.klo_state,
      buyer_view:
        output.klo_state.buyer_view ?? ctx.deal.klo_state?.buyer_view ?? null,
    }
    await updateDealState(deal_id, stateToWrite)

    // 5. Insert chat_reply as a Klo message scoped to recipientRole
    await postKloMessage(deal_id, output.chat_reply, ctx.recipientRole)

    // 6. Phase 8 — buyer_view regeneration (gated by material change).
    //    Best-effort: a failure here must NOT fail the chat turn.
    try {
      await maybeRegenerateBuyerView({
        deal: ctx.deal,
        beforeState: ctx.deal.klo_state,
        newState: output.klo_state,
        sellerProfile,
      })
    } catch (err) {
      console.error("buyer_view generation failed", err)
      await writeBuyerViewStatus(
        deal_id,
        "thrown_error",
        err instanceof Error ? err.message : String(err),
      )
    }

    return json({ ok: true })
  } catch (err) {
    console.error("klo-respond error", err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

async function maybeRegenerateBuyerView(args: {
  deal: DealContext["deal"]
  beforeState: KloState | null
  newState: KloState
  sellerProfile: SellerProfile | null
}): Promise<void> {
  const { deal, beforeState, newState, sellerProfile } = args

  const sinceISO = beforeState?.buyer_view?.generated_at ?? null
  const messagesSinceLastBuyerView = await countMessagesSince(deal.id, sinceISO)

  const materialCheck = detectMaterialChange({
    before: beforeState,
    after: newState,
    messagesSinceLastBuyerView,
  })

  console.log(JSON.stringify({
    event: "buyer_view_gating_decision",
    deal_id: deal.id,
    is_material: materialCheck.isMaterial,
    reasons: materialCheck.reasons,
    messages_since_last: messagesSinceLastBuyerView,
  }))

  if (!materialCheck.isMaterial) return

  const buyerViewPrompt = buildBuyerViewPrompt({
    dealTitle: deal.title,
    buyerCompany: deal.buyer_company ?? "the buyer",
    sellerCompany: deal.seller_company ?? "the vendor",
    recipientLabel: "the buyer",
    currentState: newState,
    sellerProfile,
    previousMomentumScore: beforeState?.buyer_view?.momentum_score ?? null,
  })

  const buyerViewResult = await callLlm<{ buyer_view: BuyerView }>({
    systemPrompt: buyerViewPrompt,
    messages: [{ role: "user", content: "Emit the buyer dashboard." }],
    tool: BUYER_VIEW_TOOL,
    maxTokens: 1500,
    temperature: 0.6,
  })

  if (!buyerViewResult.toolCalled) {
    console.warn("buyer_view tool not called — skipping update")
    await writeBuyerViewStatus(deal.id, "tool_not_called")
    return
  }

  const buyerView = buyerViewResult.input.buyer_view
  if (!buyerView) {
    console.warn("buyer_view missing in tool input — skipping update")
    await writeBuyerViewStatus(deal.id, "missing_input")
    return
  }
  buyerView.generated_at = new Date().toISOString()
  buyerView.generation_reason = beforeState?.buyer_view ? "material_change" : "initial"

  // Append to the momentum history (cap at 30 entries) so the dashboard chart
  // gets a real series instead of just the latest point.
  const prevHistory = beforeState?.buyer_view?.momentum_history ?? []
  const nextHistory = buyerView.momentum_score == null
    ? prevHistory
    : [...prevHistory, { date: buyerView.generated_at, score: buyerView.momentum_score }]
  buyerView.momentum_history = nextHistory.slice(-30)

  // Read fresh state, merge, write — avoids stomping any other concurrent write.
  const { data: fresh } = await sb
    .from("deals")
    .select("klo_state")
    .eq("id", deal.id)
    .maybeSingle()
  const baseState = (fresh?.klo_state ?? newState) as KloState
  const mergedState: KloState = {
    ...baseState,
    buyer_view: buyerView,
    buyer_view_status: {
      last_attempt_at: new Date().toISOString(),
      last_outcome: "success",
      last_error: null,
    },
  }

  const { error: updateErr } = await sb
    .from("deals")
    .update({ klo_state: mergedState })
    .eq("id", deal.id)
  if (updateErr) {
    console.error("buyer_view persist failed", updateErr)
    await writeBuyerViewStatus(deal.id, "persist_failed", updateErr.message)
    return
  }

  console.log(JSON.stringify({
    event: "buyer_view_generated",
    deal_id: deal.id,
    reason: buyerView.generation_reason,
    momentum_score: buyerView.momentum_score,
  }))
}

async function runBuyerViewRefresh(args: {
  deal: DealContext["deal"]
  currentState: KloState
  sellerProfile: SellerProfile | null
}): Promise<BuyerView | null> {
  const { deal, currentState, sellerProfile } = args

  const buyerViewPrompt = buildBuyerViewPrompt({
    dealTitle: deal.title,
    buyerCompany: deal.buyer_company ?? "the buyer",
    sellerCompany: deal.seller_company ?? "the vendor",
    recipientLabel: "the buyer",
    currentState,
    sellerProfile,
    previousMomentumScore: currentState.buyer_view?.momentum_score ?? null,
  })

  const result = await callLlm<{ buyer_view: BuyerView }>({
    systemPrompt: buyerViewPrompt,
    messages: [{ role: "user", content: "Emit the buyer dashboard." }],
    tool: BUYER_VIEW_TOOL,
    maxTokens: 1500,
    temperature: 0.6,
  })
  if (!result.toolCalled) {
    console.warn("buyer_view manual refresh: tool not called")
    await writeBuyerViewStatus(deal.id, "tool_not_called")
    return null
  }
  if (!result.input?.buyer_view) {
    console.warn("buyer_view manual refresh: missing input")
    await writeBuyerViewStatus(deal.id, "missing_input")
    return null
  }
  const buyerView = result.input.buyer_view
  buyerView.generated_at = new Date().toISOString()
  buyerView.generation_reason = "manual_refresh"
  const prevHistory = currentState.buyer_view?.momentum_history ?? []
  const nextHistory = buyerView.momentum_score == null
    ? prevHistory
    : [...prevHistory, { date: buyerView.generated_at, score: buyerView.momentum_score }]
  buyerView.momentum_history = nextHistory.slice(-30)

  const { data: fresh } = await sb
    .from("deals")
    .select("klo_state")
    .eq("id", deal.id)
    .maybeSingle()
  const baseState = (fresh?.klo_state ?? currentState) as KloState
  const mergedState: KloState = {
    ...baseState,
    buyer_view: buyerView,
    buyer_view_status: {
      last_attempt_at: new Date().toISOString(),
      last_outcome: "success",
      last_error: null,
    },
  }
  const { error: updateErr } = await sb
    .from("deals")
    .update({ klo_state: mergedState })
    .eq("id", deal.id)
  if (updateErr) {
    console.error("buyer_view manual refresh persist failed", updateErr)
    await writeBuyerViewStatus(deal.id, "persist_failed", updateErr.message)
    return null
  }
  console.log(JSON.stringify({
    event: "buyer_view_generated",
    deal_id: deal.id,
    reason: "manual_refresh",
    momentum_score: buyerView.momentum_score,
  }))
  return buyerView
}

// Best-effort writer for buyer_view generation telemetry. Reads klo_state,
// merges in buyer_view_status, writes back. Never throws — a failure here
// must not break the chat turn.
async function writeBuyerViewStatus(
  dealId: string,
  outcome: BuyerViewOutcome,
  errorDetail?: string | null,
): Promise<void> {
  try {
    const { data: fresh } = await sb
      .from("deals")
      .select("klo_state")
      .eq("id", dealId)
      .maybeSingle()
    const baseState = (fresh?.klo_state ?? null) as KloState | null
    if (!baseState) return
    const merged: KloState = {
      ...baseState,
      buyer_view_status: {
        last_attempt_at: new Date().toISOString(),
        last_outcome: outcome,
        last_error: errorDetail ? errorDetail.slice(0, 240) : null,
      },
    }
    await sb.from("deals").update({ klo_state: merged }).eq("id", dealId)
  } catch (err) {
    console.error("writeBuyerViewStatus failed", err)
  }
}

async function countMessagesSince(dealId: string, sinceISO: string | null): Promise<number> {
  if (!sinceISO) return 999
  const { count } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId)
    .gt("created_at", sinceISO)
    .neq("sender_type", "klo")
  return count ?? 0
}

// --- Stubs (filled in step 07) ---

interface MessageRow {
  id: string
  sender_type: "seller" | "buyer" | "klo" | "system"
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
    seller_id: string
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
  recipientRole: "seller" | "buyer"
}

async function loadDealContext(deal_id: string): Promise<DealContext> {
  const [dealRes, contextRes, messagesRes] = await Promise.all([
    sb.from("deals").select("*").eq("id", deal_id).single(),
    sb.from("deal_context").select("*").eq("deal_id", deal_id).maybeSingle(),
    sb
      .from("messages")
      .select("id, sender_type, sender_name, content, created_at")
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: true })
      .limit(50),
  ])

  if (dealRes.error) throw dealRes.error
  const deal = dealRes.data as DealContext["deal"]
  const context = (contextRes.data ?? null) as DealContext["context"]
  const messages = (messagesRes.data ?? []) as MessageRow[]

  // recipientRole = role of the most recent non-Klo non-system message sender.
  // If the trigger was a system message (email/meeting), Klo's reply is for
  // the seller — buyers don't see inbox- or calendar-sourced content.
  const lastNonKloNonSystem = [...messages]
    .reverse()
    .find((m) => m.sender_type !== "klo" && m.sender_type !== "system")
  const recipientRole: "seller" | "buyer" =
    lastNonKloNonSystem?.sender_type === "buyer" ? "buyer" : "seller"

  return { deal, context, messages, recipientRole }
}

async function runBootstrap(
  ctx: DealContext,
  sellerProfile: SellerProfile | null,
): Promise<KloRespondOutput> {
  const system = buildBootstrapPrompt({
    dealTitle: ctx.deal.title,
    buyerCompany: ctx.deal.buyer_company ?? "",
    sellerCompany: ctx.deal.seller_company ?? "",
    dealValue: ctx.deal.value,
    dealDeadline: ctx.deal.deadline,
    stakeholders: (ctx.context?.stakeholders ?? []).map((s) => ({
      name: s.name ?? "",
      role: s.role ?? "",
      company: s.company ?? "",
    })),
    whatNeedsToHappen: ctx.context?.what_needs_to_happen ?? null,
    budgetNotes: ctx.context?.budget_notes ?? null,
    notes: ctx.context?.notes ?? null,
    sellerProfile,
  })

  return runLlm(system, ctx.messages, ctx.deal.id)
}

async function runExtraction(
  ctx: DealContext,
  _triggering_message_id: string | null,
  sellerProfile: SellerProfile | null,
): Promise<KloRespondOutput> {
  // currentState is non-null on the extraction path (skeleton routes on null).
  const currentState = ctx.deal.klo_state as KloState
  const system = buildExtractionPrompt({
    dealTitle: ctx.deal.title,
    buyerCompany: ctx.deal.buyer_company ?? "",
    sellerCompany: ctx.deal.seller_company ?? "",
    mode: ctx.deal.mode,
    recipientRole: ctx.recipientRole,
    currentState,
    sellerProfile,
  })

  return runLlm(system, ctx.messages, ctx.deal.id)
}

async function runLlm(
  systemPrompt: string,
  messages: MessageRow[],
  dealId: string,
): Promise<KloRespondOutput> {
  // Format messages for the API: tag each with id and sender so Klo can echo source_message_id.
  const apiMessages: LlmMessage[] = messages.map((m) => ({
    role: m.sender_type === "klo" ? "assistant" : "user",
    content: `[msg_id=${m.id} | ${m.sender_name ?? m.sender_type} (${m.sender_type}) | ${m.created_at}]\n${m.content}`,
  }))

  // Both providers require the conversation to start with a user turn. Drop
  // leading assistant turns rather than failing the call.
  while (apiMessages.length > 0 && apiMessages[0].role === "assistant") {
    apiMessages.shift()
  }
  if (apiMessages.length === 0) {
    apiMessages.push({ role: "user", content: "(no user messages yet — produce a fresh state from the deal context above.)" })
  }

  console.log(JSON.stringify({
    event: "prompt_size_breakdown",
    system_prompt_chars: systemPrompt.length,
    messages_chars: JSON.stringify(apiMessages).length,
    tool_schema_chars: JSON.stringify(KLO_OUTPUT_TOOL).length,
    total_chars: systemPrompt.length + JSON.stringify(apiMessages).length + JSON.stringify(KLO_OUTPUT_TOOL).length,
    deal_id: dealId,
  }))

  let result = await callLlm<KloRespondOutput>({
    systemPrompt,
    messages: apiMessages,
    tool: KLO_OUTPUT_TOOL,
    maxTokens: 4096,
    temperature: 0.7,
  })

  // Strategy A: Gemini Flash-Lite occasionally returns text instead of calling
  // the tool. Retry once with an explicit reminder.
  if (!result.toolCalled) {
    console.warn("Klo returned text instead of tool call, retrying once")
    result = await callLlm<KloRespondOutput>({
      systemPrompt,
      messages: [
        ...apiMessages,
        {
          role: "user",
          content: "You must call the emit_klo_response function. Do not respond with text.",
        },
      ],
      tool: KLO_OUTPUT_TOOL,
      maxTokens: 4096,
      temperature: 0.7,
    })
  }

  if (!result.toolCalled) {
    const preview = result.text.slice(0, 200)
    throw new Error(`Klo failed to emit tool call after retry. Got: ${preview}`)
  }

  const usage = extractUsage(result.rawResponse)
  console.log(JSON.stringify({
    event: "klo_respond_complete",
    model: USE_GEMINI ? KLO_MODEL_GEMINI : KLO_MODEL_ANTHROPIC,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    cached_tokens: usage.cachedTokens,
    deal_id: dealId,
  }))

  const parsed = result.input
  if (!parsed.klo_state || !parsed.chat_reply) {
    throw new Error("Tool input missing klo_state or chat_reply")
  }
  return parsed
}

function extractUsage(raw: unknown): { promptTokens?: number; completionTokens?: number; cachedTokens?: number } {
  const r = raw as Record<string, unknown> | null
  if (!r) return {}
  // Gemini: usageMetadata.{promptTokenCount, candidatesTokenCount, cachedContentTokenCount}
  const gemini = r.usageMetadata as Record<string, number> | undefined
  if (gemini) {
    return {
      promptTokens: gemini.promptTokenCount,
      completionTokens: gemini.candidatesTokenCount,
      cachedTokens: gemini.cachedContentTokenCount,
    }
  }
  // Anthropic: usage.{input_tokens, output_tokens, cache_read_input_tokens}
  const anthropic = r.usage as Record<string, number> | undefined
  if (anthropic) {
    return {
      promptTokens: anthropic.input_tokens,
      completionTokens: anthropic.output_tokens,
      cachedTokens: anthropic.cache_read_input_tokens,
    }
  }
  return {}
}

const NOISY_FIELDS = new Set([
  "summary",
  "klo_take_seller",
  "klo_take_buyer",
  "stage_reasoning",
])

async function writeHistory(
  deal_id: string,
  oldState: KloState | null,
  newState: KloState,
  triggering_message_id: string | null,
  triggered_by_role: "seller" | "buyer" | "system",
): Promise<void> {
  // Bootstrap case: one row, kind='extracted', field_path='bootstrap'.
  if (oldState == null) {
    const { error } = await sb.from("klo_state_history").insert({
      deal_id,
      triggered_by_message_id: triggering_message_id,
      triggered_by_role: "system",
      change_kind: "extracted",
      field_path: "bootstrap",
      before_value: null,
      after_value: newState,
    })
    if (error) throw error
    return
  }

  const rows: Array<Record<string, unknown>> = []
  const fields: Array<keyof KloState> = [
    "stage",
    "deal_value",
    "deadline",
    "people",
    "decisions",
    "blockers",
    "open_questions",
  ]

  for (const f of fields) {
    if (NOISY_FIELDS.has(f as string)) continue
    const before = (oldState as unknown as Record<string, unknown>)[f as string]
    const after = (newState as unknown as Record<string, unknown>)[f as string]
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      rows.push({
        deal_id,
        triggered_by_message_id: triggering_message_id,
        triggered_by_role,
        change_kind: "extracted",
        field_path: String(f),
        before_value: before ?? null,
        after_value: after ?? null,
      })
    }
  }

  if (rows.length > 0) {
    const { error } = await sb.from("klo_state_history").insert(rows)
    if (error) throw error
  }
}

async function updateDealState(deal_id: string, state: KloState): Promise<void> {
  // Sync legacy columns so existing UI keeps working as a rollback target.
  const update: Record<string, unknown> = {
    klo_state: state,
    summary: state.summary,
    stage: state.stage,
  }
  if (state.deal_value) update.value = state.deal_value.amount
  if (state.deadline) update.deadline = state.deadline.date

  const { error } = await sb.from("deals").update(update).eq("id", deal_id)
  if (error) throw error
}

async function postKloMessage(
  deal_id: string,
  content: string,
  visible_to: "seller" | "buyer",
): Promise<void> {
  const { error } = await sb.from("messages").insert({
    deal_id,
    sender_type: "klo",
    sender_name: "Klo",
    content,
    visible_to,
  })
  if (error) throw error
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
