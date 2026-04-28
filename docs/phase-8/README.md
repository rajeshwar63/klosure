# Phase 8 — Seller profile + Buyer dashboard

This phase shifts Klosure from a **chat-first coaching tool** to a **two-surface product**:

1. **Seller surface** — same chat with Klo, but every Klo response is now grounded in the seller's own context (role, ICP, region, personas, deal-killers). Fixes the "too generic" feedback from real-deal usage on Apr 27.
2. **Buyer surface** — a premium dashboard that Klo writes *for* the buyer (no chat). Klo coaches the buyer on internal moves, stakeholder alignment, and asks for the vendor. Generated entirely from the seller's private chat with Klo. Seller can preview it — that preview is the value moment that justifies $99-199/mo Gulf pricing.

The seller chat stays the **single source of truth**. The buyer dashboard is a derived projection — buyers never see the seller's chat content, only what Klo coaches them to do on their side.

---

## What changes

### New product surfaces
- **Seller settings → "Train Klo"** page (5 fields, one screen)
- **Buyer dashboard** — premium, multi-section, read-only, Stripe/Linear/Notion aesthetic
- **Seller's "Buyer view" tab** on the deal page — preview of what the buyer sees, with "updated X mins ago"

### New data
- `seller_profiles` table — 5 fields per seller, injected into every seller-facing LLM call
- `klo_state.buyer_view` JSONB blob — Klo's structured coaching for the buyer (brief, signals, playbook, stakeholder takes, risks, momentum, recent moments)

### New LLM calls
- **Buyer view extraction** — second LLM call after main `klo-respond`, gated to "regenerate only on material state change" so trivial messages don't pay the cost twice
- Existing prompts updated to inject seller profile context

### What does NOT change
- The chat experience itself (still seller ↔ Klo)
- The Living Deal Record / `klo_state` shape (we extend it, don't break it)
- Existing manager view, daily focus, watcher, archive flows
- The LLM provider abstraction — buyer-view calls go through the same `callLlm` layer

---

## Sprints

| Sprint | Days | What ships |
|---|---|---|
| A | ~0.5 | Seller profile — DB, settings UI, prompt injection (8.1) |
| B | ~1.0 | Buyer-view extraction — schema, second LLM call, prompt, gating logic (8.2) |
| C | ~2.0 | Buyer dashboard UI + seller preview tab (8.3) |
| D | ~0.25 | Acceptance walkthrough — both real-deal usage and visual QA |

**Total: ~3.75 days.** Each sprint is independently shippable. After Sprint A you already get measurably less generic Klo coaching. After Sprint B the buyer view exists in DB. Sprint C makes it visible.

A fifth sub-phase, **8.4 — Seller honesty pass**, is intentionally deferred. Sprint A's profile injection will resolve most of the "too generic" feedback on its own; revisit only after 2-3 days of real use show what's left.

---

## Build order

1. **`01-seller-profile-schema.md`** — `seller_profiles` table, RLS, migration SQL
2. **`02-seller-profile-ui.md`** — Settings → Train Klo page, 5 fields
3. **`03-seller-profile-prompt-injection.md`** — inject profile into extraction-prompt, bootstrap-prompt, daily-focus, manager
4. **`04-buyer-view-schema.md`** — extend `klo_state` with `buyer_view` shape, types, tool schema
5. **`05-buyer-view-prompt.md`** — new BUYER_VIEW_PROMPT, voice rules, hard-stops
6. **`06-buyer-view-extraction-call.md`** — second LLM call in klo-respond, gating logic, cost ceiling
7. **`07-buyer-dashboard-ui.md`** — full dashboard component spec, all 10 sections
8. **`08-seller-preview-tab.md`** — "Buyer view" tab on seller deal page + "updated X mins ago"
9. **`09-acceptance-walkthrough.md`** — real-deal test, visual QA, cost/latency check
10. **`10-phase-8-4-deferred.md`** — placeholder for seller honesty pass with trigger conditions

---

## Critical principles (locked, do not change)

These are non-negotiable architectural rules for this phase. They derive from the founding principles of Klosure (Klo records what was said, seller never overrides; LLM stays swappable; buyer view is honestly different).

1. **Seller chat is the only input.** Buyer dashboard is generated from seller's chat + LDR + seller profile. Buyer never has a chat with Klo.
2. **Buyer never sees seller-side artifacts.** No confidence score, no factors, no "deal is dying" framing. Same underlying truth, action-oriented framing only.
3. **Buyer dashboard never reveals seller strategy.** Klo's buyer voice never says "the seller is trying to..." or "your vendor wants you to..." It coaches the buyer's internal motion as if Klo is on the buyer's side.
4. **Seller profile is 5 fields max.** Resist adding fields. Onboarding friction kills adoption. Klo learns more from the chat itself over time anyway.
5. **Buyer view extraction is gated.** A trivial seller message ("got it, thanks") does NOT trigger a buyer-view regeneration. Only material state changes do.
6. **Cost ceiling: $0.002 per turn.** With profile injection (~+50 tokens) + buyer view extraction on ~30% of turns, total cost per turn must stay under $0.002. Verify in Sprint D.
7. **The seller's "Buyer view" preview is the conversion surface.** Treat it as the premium product moment. Visual polish here matters more than anywhere else in the app.

---

## Cost model (estimated)

Today (post Phase 7.1.1): ~$0.0011/call fresh, ~$0.0014/call aged.

After Phase 8, per turn:
- Main extraction: ~$0.0011 (unchanged) + ~$0.00005 for profile injection = **~$0.00115**
- Buyer view extraction: ~$0.0006 per call, runs on ~30% of turns = **~$0.00018 amortized**
- **Total per turn: ~$0.00133** — under the $0.002 ceiling

At 3,000 chat messages/month per active seller: ~$4/month per seller. Pricing math still works at $99-199/mo Gulf, ₹400-1500/mo India SMB.

---

## Rules for every step

- Commit after each step. Push after each commit.
- Follow existing project conventions: XML-tag prompt sections (Phase 7.1), `LlmToolDefinition` typing (Phase 7), per-deal `klosure:*:{dealId}` localStorage pattern (Phase 6).
- Never bypass the LLM abstraction. All new LLM calls go through `_shared/llm-client.ts`.
- Never store sensitive data in `seller_profiles` — no API keys, no customer PII beyond what the seller chooses to put there.
- After each Sprint, sanity-check on a real deal before moving to the next.
