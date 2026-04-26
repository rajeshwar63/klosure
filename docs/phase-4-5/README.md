# Phase 4.5 — The Living Deal Record

This folder contains the spec for Phase 4.5, broken into small steps. Each step is independently committable and small enough to avoid stream timeouts.

## Core principle (read this every step)

**Klo records what was said. The seller cannot edit the record — they can only continue the conversation.**

Every design decision in this phase serves that principle. If during the build something tempts you to add a "confirm before changing" gate, a "lock this field" toggle, or a "private seller note" — that's principle erosion. Refuse it. The whole point of Phase 4.5 is to remove the seller's ability to bend deal reality.

## Build order — do these strictly in sequence

Each file is a single step. Read it, complete it, commit, move to the next. Do not start step N+1 until step N is committed and pushed.

1. `01-schema-migration.md` — `phase4_5.sql` (already done; included for reference)
2. `02-klo-state-shape.md` — Define the `klo_state` JSON shape
3. `03-extraction-rules.md` — How Klo treats different kinds of statements
4. `04-bootstrap-prompt.md` — The one-time prompt that creates initial state from chat history
5. `05-extraction-prompt.md` — The main per-turn prompt
6. `06-klo-respond-skeleton.md` — Function structure with prompt placeholders
7. `07-klo-respond-wireup.md` — Wire the prompts in, add diff-and-history logic
8. `08-klo-removal-function.md` — New Edge Function for × removals
9. `09-overview-rewrite.md` — Render Overview from `klo_state`
10. `10-provenance-tooltips.md` — Hover/long-press to see source message
11. `11-remove-button-flow.md` — × button + reason prompt + call to klo-removal
12. `12-buyer-view-differences.md` — Role-aware Overview rendering
13. `13-klo-manager-update.md` — Update manager Klo to use klo_state + history
14. `14-what-changed-handling.md` — Klo answers "what changed?" from history
15. `15-mobile-pass.md` — 375px sanity check
16. `16-acceptance-walkthrough.md` — Manual verification checklist

## Rules for every step

- Commit after each step. Push after each commit.
- If any single step still hits a stream timeout, ask: "split this step into two commits."
- Do not deviate from the principle. If something feels awkward, don't add a permission gate — fix the prompt.
- Do not modify files outside what each step specifies. No scope creep.
- Preserve the legacy field paths on `deals` (`stage`, `value`, `deadline`, `summary`) and continue updating them in parallel during this phase. They are the rollback target.
