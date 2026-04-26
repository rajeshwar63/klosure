# Step 11 — Pattern detection: what Klo looks for

**Sprint:** 5 (DEFERRABLE — only build when team has ≥5 closed deals)

**Goal:** Define the patterns Klo will mine from closed deals. This step is just the spec, not code yet.

## When to build Sprint 5

Don't start this until your team has at least 5 closed deals (won or lost) in the database. With fewer, Klo will hallucinate patterns, which is worse than no patterns.

If the team doesn't have 5 closed yet, skip Sprints 5 entirely and ship Phase 5 with Sprints 1-4. Add a placeholder on the manager forecast tab:

> *"Klo will start finding patterns once you've closed 5+ deals. ({N} closed so far.)"*

This keeps expectations honest.

## What "patterns" means here

Klo looks across all closed deals (won and lost) for the team and identifies signals that correlate strongly with closing or losing.

Examples (these are illustrative — actual patterns are derived per team, not hard-coded):

- "Deals where signatory is identified by week 2 close 70% of the time. Deals where signatory is unknown past week 3 close 22%."
- "Deals where the buyer goes silent for 5+ days after a proposal close 18%."
- "Deals where the seller has more than one buyer-side stakeholder by week 3 close 65%."
- "Deals that hit Negotiation stage with a tentative budget close 35%; deals that hit it with a confirmed budget close 78%."

Each pattern has:
- A trigger condition (what Klo looks for in `klo_state` / `klo_state_history`)
- A close rate among matching deals
- A sample size (so the manager can judge reliability)

## What Klo looks at to find patterns

For each closed deal, Klo can examine:

1. **Stage trajectory** — how long it spent in each stage
2. **Stakeholder coverage** — how many people were tracked, when each was added
3. **Specific role coverage** — was the signatory ever identified? CFO? Champion?
4. **Commitment patterns** — how many were proposed, confirmed, missed
5. **Confidence trajectory** — did the score steadily rise, oscillate, drop sharply?
6. **Buyer engagement** — buyer message frequency, longest silent gaps
7. **Klo's own coaching themes** — what blockers Klo flagged repeatedly

## What Klo does NOT do

- Klo doesn't do statistical regression. We're not training a model. Klo reads the deal histories and extracts qualitative patterns it sees with quantitative anchoring.
- Klo doesn't make individual-deal predictions based on patterns. That's already Sprint 1's job (per-deal confidence). Patterns are aggregate insight for the manager.
- Klo doesn't surface patterns from < 5 supporting deals. The denominator must be visible.

## Output shape

```typescript
export interface TeamPattern {
  text: string;              // human-readable pattern statement
  close_rate: number;        // 0-100 percentage of matching deals that closed won
  sample_size: number;       // how many closed deals match the trigger
  category: 'stakeholders' | 'commitments' | 'engagement' | 'stage' | 'confidence';
}
```

Stored in a new table `team_patterns` (one row per pattern, scoped to a team_id).

## Refresh strategy

Patterns update when a deal closes (won or lost). On every Won/Lost transition:
- Trigger: re-run pattern detection for the team
- Cost: one Claude call (~$0.01-0.02)
- Frequency: very low (once per closed deal)

We don't recompute on every active-deal change because patterns are about closed deals — active deals don't shift the math.

## Confidence floor

A pattern is shown to the manager only if:
- Sample size ≥ 5
- Close rate is meaningfully different from the team's overall close rate (≥10 pts away in either direction)

Below those thresholds, Klo doesn't surface the pattern. Better to show 2 strong patterns than 8 weak ones.

## Acceptance for this step

- Spec exists (this file)
- A `team_patterns` table is defined in `phase5_patterns.sql` (next step)
- No code yet

→ Next: `12-pattern-detection-function.md`
