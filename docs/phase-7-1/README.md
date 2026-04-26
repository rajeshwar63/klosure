# Phase 7.1 — Prompt Tightening + Latency Reduction

This phase improves Klo's coaching quality on Gemini 3.1 Flash-Lite while reducing both cost AND latency. No new features. Just sharper prompts and a smaller output footprint.

## Three constraints

1. **Cost: same or lower than current.** Today's baseline: ~$0.0009 per chat message at 5,223 input + 1,022 output tokens.
2. **Latency: under 3 seconds end-to-end.** Today's measured: 2-4 seconds.
3. **Quality: noticeably more situated coaching, less generic templating.**

These three constraints align: tighter prompts and smaller outputs reduce cost AND latency simultaneously, while improving quality.

## What changes

### Things added (small input cost, big quality gain)
- XML-tag structure across all three prompt files
- Top-heavy ordering (rules first, deal context last)
- Senior VP voice section with concrete DO/DON'T pairs
- Strict grounding rules (null on unclear)
- Confidence hard-stop matrix (signatory + deadline + stage)
- Momentum decay rules (time-aware coaching)

### Things removed (big cost reduction)
- Verbose persona descriptions replaced with terse XML rules
- Redundant extraction guidance consolidated
- Output token reduction: smaller `klo_take_buyer` cap when buyer hasn't joined the deal
- Output token reduction: cap factors arrays at 3 items each (down from 5)
- Output token reduction: cap rationale at one tight sentence

### Things deferred (Phase 8)
- Internal monologue / chain-of-thought field — adds latency, dropped
- Multimodal handling — no file uploads built yet
- Buyer bureaucracy navigation section — no real buyer chat traffic yet
- Differential extraction (only emit changed fields) — too risky combined with prompt changes

## Net cost impact (estimated)

| Component | Before | After | Delta |
|---|---|---|---|
| Input tokens (system + history) | 5,223 | ~5,400 | +180 |
| Output tokens (klo_state + reply) | 1,022 | ~750 | -270 |
| Cost per call | $0.00094 | $0.00084 | -10% |
| Latency contribution from output | ~1.5s | ~1.1s | -0.4s |

Conservative estimate. The output reduction is the bigger win on both axes.

## Sprints

| Sprint | Days | What ships |
|---|---|---|
| A | ~0.5 | XML restructure + voice tightening (extraction-prompt.ts, bootstrap-prompt.ts) |
| B | ~0.5 | Hard stops + momentum rules (extraction-rules-text.ts) |
| C | ~0.25 | Output token reduction (tool schema + prompt caps) |
| D | ~0.25 | Acceptance + cost/latency verification |

Total: ~1.5 days. Each sprint independently shippable.

## Build order

1. `01-xml-restructure-extraction-prompt.md`
2. `02-xml-restructure-bootstrap-prompt.md`
3. `03-senior-vp-voice-section.md`
4. `04-strict-grounding-rules.md`
5. `05-confidence-hard-stops.md`
6. `06-momentum-decay-rules.md`
7. `07-output-token-reduction.md`
8. `08-acceptance-walkthrough.md`

## Rules for every step

- Commit after each step. Push after each commit.
- Test the latency + cost after Sprint A AND Sprint C. Don't wait until the end.
- If any step pushes latency above 3 seconds OR cost above $0.001 per call, stop and revert that step.
- Use the same 5 test messages throughout (defined in step 08) for consistent comparison.

## Why this approach

The temptation with prompt rewrites is to add more rules. More rules mean more input tokens means more cost AND more latency.

This spec inverts that: every added rule must be paired with a removal. Every cost in must come with a saving out. Net should be flat or negative on both cost and latency.

The quality gain comes from *signal density*, not *token volume*. A short, well-structured prompt with concrete DO/DON'T examples outperforms a long, vague prompt every time.
