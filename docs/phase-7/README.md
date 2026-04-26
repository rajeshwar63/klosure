# Phase 7 — Migrate to Gemini 3.1 Flash-Lite

This folder contains the spec for Phase 7: switching Klosure's LLM from Claude Sonnet 4.5 to Gemini 3.1 Flash-Lite Preview, across all six Edge Functions that call AI.

## Why this matters

At realistic usage (3,000 chat messages/month per active seller), Klosure's per-seller Claude cost is ~$110/month. That's incompatible with $5-30/month pricing tiers, especially for the India market.

Gemini 3.1 Flash-Lite is roughly 30x cheaper at $0.10/1M input and $0.40/1M output. Migrating brings per-seller cost from ~$110/month to ~$3/month — which makes both India SMB pricing AND healthy margins on the Gulf market viable.

## What changes

Six Edge Functions currently call Anthropic's API:

1. `klo-respond` — chat reply + state extraction (the big one)
2. `klo-daily-focus` — seller's morning briefing paragraph
3. `klo-manager` — manager chat + quarter take
4. `klo-watcher` — overdue commitment nudges
5. `klo-removal` — handles removal reasons
6. `klo-patterns` — pattern detection (Phase 5 deferred — not yet built)

All migrate to Gemini. The migration is mechanical — same prompts, same tool schemas, different API endpoint and slight syntax differences.

## What does NOT change

- The system prompts and extraction rules (mostly — minor adjustments for Gemini's behavior)
- The tool schemas / function-calling structure (semantically identical)
- Database structure (no schema changes)
- Frontend code (entirely unchanged)
- The user experience (this is invisible to the user, IF quality holds)

## Sprints

| Sprint | Days | What ships |
|---|---|---|
| A | ~0.5 | Shared Gemini client + abstraction layer |
| B | ~0.5 | Migrate `klo-respond` (the high-traffic, high-risk one) |
| C | ~0.5 | Migrate the other five functions |
| D | ~0.5 | Acceptance testing + quality calibration |

Total: ~2 days. Each sprint is independently shippable.

## Build order

### Sprint A — Shared infrastructure
- `01-shared-gemini-client.md` — abstraction layer + env vars

### Sprint B — Migrate klo-respond
- `02-klo-respond-tool-schema.md` — translate Anthropic tool schema to Gemini function declarations
- `03-klo-respond-call.md` — replace the API call
- `04-klo-respond-prompt-tweaks.md` — small prompt adjustments for Gemini behavior

### Sprint C — Migrate everything else
- `05-klo-daily-focus.md`
- `06-klo-manager.md`
- `07-klo-watcher-and-removal.md`

### Sprint D — Acceptance
- `08-quality-calibration.md` — what to test, when to roll back
- `09-acceptance-walkthrough.md`

## Critical principle — the swappable abstraction

After this migration, **the model must remain swappable.** A new file `_shared/llm-client.ts` becomes the single point where the AI provider is chosen. If Gemini quality disappoints in production, swapping back to Claude is a one-config change, not a 6-function rewrite.

This is the architectural protection against "we picked the wrong model."

## Risks I'm flagging

### Risk 1 — Tool-use behavior is not identical

Anthropic's tool-use forces the model to call exactly the tool you specify. Gemini's function-calling is similar but the model can sometimes return text instead of a function call when it's uncertain. Need to handle that.

### Risk 2 — Coaching paragraph quality may drop

`klo_take_seller` and `klo_take_buyer` are the user-facing voice. Flash-Lite is a small model. The voice MIGHT get more generic.

The mitigation: in the abstraction layer, allow per-call model overrides. We can keep coaching on a Pro model if Flash-Lite voice degrades. We won't know until we test.

### Risk 3 — 3.1 Flash-Lite is in Preview

Google can change behavior, rate limits, or pricing without notice. The `KLO_MODEL` env var means we can switch to 2.5 Flash-Lite (stable) instantly if needed.

## Rollback plan

If Gemini quality turns out to be insufficient:

1. `supabase secrets set USE_GEMINI=false`
2. The abstraction layer falls back to Anthropic
3. Five seconds later, all functions are back on Claude
4. Zero data loss, zero downtime

This rollback path is built into the abstraction in step 01.

## What's deliberately out of scope

- **Hybrid model strategy** (Gemini for extraction, Claude for coaching) — Phase 7.5 if Flash-Lite voice is too generic
- **Differential extraction** (only output what changed) — Phase 8, after we know the new cost baseline
- **Trivial-message gating** — Phase 8
- **Prompt caching for Gemini** — Gemini handles this differently than Anthropic; explore in Phase 8 once stable

These are all real wins, but they pile up risk if combined with the model migration. One change at a time. Phase 7 is the model swap. Phase 8 is the optimization pass.
