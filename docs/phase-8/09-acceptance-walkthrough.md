# Step 09 — Acceptance walkthrough

**Sprint:** D
**Goal:** Validate Phase 8 end-to-end on a real deal. Three things must be true before the phase ships: (1) Klo's coaching is measurably more specific than before; (2) the buyer dashboard is visually impressive enough to justify the price; (3) cost per turn stays under $0.002.

This is a manual walkthrough. Do not skip steps even if they seem fine — the whole point of Phase 8 is improving real-world quality, which only shows up under real-world testing.

## Pre-checks

- [ ] All steps 01-08 committed and pushed
- [ ] All Edge Functions deployed: `klo-respond`, `klo-daily-focus`, `klo-manager`
- [ ] Phase 8 SQL migration applied to production
- [ ] At least one real test deal exists with 10+ chat messages (use one of Rajeshwar's actual sales conversations or set one up that mirrors a real one)

## Test 1 — Seller profile changes Klo's voice

**Setup:**
1. Pick a chat message Rajeshwar sent in a real deal where Klo's reply felt generic. Note Klo's reply.
2. Save a complete `seller_profiles` row via /settings/train-klo:
   - Role: `Founder & CEO`
   - What you sell: `AI-powered B2B sales deal coaching SaaS`
   - ICP: `Mid-market B2B SaaS revenue teams (50-500 reps) in the Gulf and India`
   - Region: `Gulf (UAE/KSA/Qatar) primary, India secondary`
   - Top personas: `CRO`, `Head of RevOps`, `VP Sales`, `Founder`
   - Common deal killer: `Procurement timelines drag past quarter-end and budget gets reallocated`
3. Re-run the same chat message in a fresh deal (or revert klo_state and re-send).

**Pass criteria:**
- [ ] Klo's reply references specifics that match the profile — Gulf market, RevOps personas, procurement timeline awareness, etc. Not necessarily naming them, but the advice is *situated*.
- [ ] Klo's reply is no longer generic enough to apply to any SaaS deal anywhere.
- [ ] Logs show `seller_profile_loaded` event with `has_profile: true`.

**If it fails:** Check that the profile is actually being injected — log the prompt sent to the LLM and grep for `<seller_profile>`.

## Test 2 — Buyer view extraction (gating works)

Send these messages in order on a test deal, watch logs after each:

1. **"Hey Klo"** — trivial greeting
   - Expected: `buyer_view_gating_decision` with `is_material: false`, no `buyer_view_generated`
2. **"Met with Sarah their CFO today, she's aligned on budget"** — material (new person + decision)
   - Expected: `is_material: true`, reasons include `person_added`, then `buyer_view_generated`
3. **"got it, thanks"** — trivial
   - Expected: `is_material: false`, no regeneration
4. **"Their CISO Mike still hasn't signed off on security review"** — material (blocker)
   - Expected: `is_material: true`, reasons include `person_added` or `blockers_count_changed`, then `buyer_view_generated`
5. **(send 5 trivial messages like "ok", "noted", etc.)**
   - Expected: 6th trivial message hits staleness threshold, triggers regeneration

**Pass criteria:**
- [ ] Trivial messages do NOT regenerate buyer view
- [ ] Material messages DO regenerate buyer view
- [ ] Staleness threshold (5 messages) triggers regeneration
- [ ] All gating decisions logged with reasons

## Test 3 — Buyer view content quality

After Test 2, open the deal as a buyer (incognito + buyer_token URL) and inspect the dashboard.

**Pass criteria for `klo_brief_for_buyer`:**
- [ ] Written to "you" (the buyer), not about them
- [ ] 3-5 sentences
- [ ] References specific stakeholders or moments from the chat
- [ ] Action-oriented — at least one concrete next step
- [ ] Does NOT mention seller's confidence, strategy, or pricing position
- [ ] Does NOT name competitors

**Pass criteria for `signals`:**
- [ ] Exactly 3 signals (timeline_health, stakeholder_alignment, vendor_responsiveness)
- [ ] Each `one_line_why` is ≤ 14 words and grounded in actual chat data

**Pass criteria for `playbook`:**
- [ ] 3-5 items
- [ ] Each action is imperative and ≤ 12 words
- [ ] Each `who` is specific (named person or role, not generic "the team")
- [ ] At least one item targets internal-buyer action (loop in CFO, push procurement, etc.)
- [ ] Status defaults to `not_started`

**Pass criteria for `stakeholder_takes`:**
- [ ] Includes the buyer-side people from the chat
- [ ] Engagement levels are reasonable (not all "engaged" — should reflect actual chat tone)
- [ ] `klo_note` for each is 1 sentence and actionable

**Pass criteria for `risks_klo_is_watching`:**
- [ ] 2-3 risks
- [ ] Each is framed as the BUYER's risk (their go-live, their procurement), not "the deal"
- [ ] Each has a concrete mitigation

**Pass criteria for `momentum_score`:**
- [ ] Number 0-100 OR null (with valid reason for null)
- [ ] `momentum_trend` set ('up' / 'down' / 'flat')

## Test 4 — Buyer dashboard visual quality

Open the dashboard on:

1. Desktop, full-width browser (1440px+)
2. Tablet (768px)
3. Mobile (375px — Chrome devtools iPhone SE preset)

**Pass criteria:**
- [ ] All 10 sections render correctly on all three sizes
- [ ] No horizontal scroll on mobile
- [ ] Two-column rows collapse to single column on mobile
- [ ] Typography hierarchy is clear — Klo brief feels like the centerpiece
- [ ] Color usage is restrained — accent only on Klo monogram, signal levels, status dots
- [ ] Hairline borders, soft shadows — no heavy/clunky styling
- [ ] Spacing is generous (24-32px between cards on desktop)
- [ ] BuyerStakeholderMap is visually distinctive — it's the "wow" moment, must land

**Subjective pass:** Show the dashboard to someone unfamiliar with Klosure (or Rajeshwar shows it to himself with fresh eyes). Their reaction should be "this looks like a real product" — not "this looks like an MVP."

## Test 5 — Seller preview tab + value moment

1. Open the same deal as a seller. Click "Buyer view" tab.
2. Verify the dashboard renders identically to the buyer's view, with the SellerPreviewBanner on top.
3. Click "Refresh now" — verify it regenerates within ~3-5 seconds and `generation_reason` becomes `manual_refresh` in the JSONB.
4. Switch back to chat. Send a material message. Switch to Buyer view tab — verify the ✨ banner appears for 4 seconds.
5. Go to seller dashboard (deals list). Verify the "✨ Buyer view updated" badge shows on the deal.

**Pass criteria:**
- [ ] All 5 sub-steps work as described
- [ ] No data leaks — the seller's chat content is NOT visible in the buyer view (open buyer URL incognito to compare)
- [ ] The Buyer view does NOT show seller's confidence score or factors

## Test 6 — Cost & latency

Run the cost telemetry script (or query logs):

```sql
-- Average cost per chat turn over last 24 hours
select
  count(*) as turn_count,
  avg(input_tokens) as avg_input,
  avg(output_tokens) as avg_output,
  -- Gemini 3.1 Flash-Lite: $0.10/1M input, $0.40/1M output
  avg((input_tokens * 0.0000001) + (output_tokens * 0.0000004)) as avg_cost_usd
from llm_call_log  -- or wherever telemetry lives
where created_at > now() - interval '24 hours'
  and fn_name = 'klo-respond';
```

**Pass criteria:**
- [ ] Average total cost per turn (main extraction + 30%-gated buyer view): under $0.002
- [ ] P95 chat reply latency (from user message to chat_reply visible): under 4 seconds
- [ ] Buyer view generation does NOT block chat reply — chat reply latency unchanged from pre-Phase-8 baseline
- [ ] No buyer-view generation rate alerts firing (>30/hr per seller)

## Test 7 — Honesty between seller and buyer takes

This is the architectural correctness check.

1. Pick a deal where the seller's coaching is critical or "this deal is in trouble" framing
2. Side-by-side compare:
   - `klo_state.klo_take_seller` (or whatever the post-Phase-7.1 seller field is)
   - `klo_state.buyer_view.klo_brief_for_buyer`

**Pass criteria:**
- [ ] The two are honestly different in tone
- [ ] Seller take may say "this deal is at risk", "push hard", "walk away" — buyer brief says "to keep your timeline on track" framing
- [ ] Underlying facts (deadlines, stakeholders, blockers) are consistent
- [ ] Buyer brief does NOT contain seller-strategic language
- [ ] Buyer brief never mentions competitors

If they sound similar, the buyer-view prompt is broken — go back to step 05 and tighten the voice/hard-stops sections.

## Test 8 — Empty / cold-start states

1. Create a brand-new deal with no chat messages yet. Open as buyer.
   - [ ] BuyerEmptyState renders with the "building your dashboard" copy
2. Save a deal where chat exists but seller_profile is missing. Open as seller.
   - [ ] Dashboard shows the "Train Klo" empty-state banner
   - [ ] Klo coaching still works, just generic
3. Resume an existing deal with klo_state but no buyer_view yet (legacy from before Phase 8).
   - [ ] First chat turn after Phase 8 ships generates buyer_view (gating: `first_generation`)
   - [ ] Buyer dashboard renders correctly after that

## Telemetry to keep watching for 7 days

After ship, monitor:

- Average cost per turn (target: <$0.002)
- Buyer-view generation rate (target: 30-40% of turns)
- Chat reply P95 latency (target: <4s, no regression vs pre-Phase-8)
- Seller profile fill-out rate (target: 50%+ of active sellers fill within 7 days)
- Manual refresh button click rate (target: <5 per seller per week — high rate suggests staleness gating is too lazy)

## What this step does NOT do

- Does NOT generate test data — uses real deals
- Does NOT include load testing — Klosure is single-tenant solo for now, defer
- Does NOT cover billing/Stripe flows — those are unchanged in Phase 8

## Claude Code instructions

```
1. Walk through each test in order on production.
2. For any failed test, file an issue in the repo with:
   - Test number
   - Pass criteria that failed
   - Logs or screenshots
   - Hypothesis for what's wrong
3. Do NOT mark Phase 8 complete until all tests pass.
4. After all tests pass, update the project document /mnt/project/Klosure_Project_Document_v2.md with a brief Phase 8 ship note (3-5 lines).
5. Tag the release: `git tag phase-8-shipped && git push --tags`
```

## Acceptance

- [ ] Tests 1-8 all pass
- [ ] Cost/latency targets met
- [ ] Project document updated
- [ ] Release tagged and pushed
- [ ] Rajeshwar uses the product on a real deal for 2+ days post-ship before Phase 8.4 is reconsidered

→ Next: `10-phase-8-4-deferred.md`
