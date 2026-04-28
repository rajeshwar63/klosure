// Klosure — Phase 8
// Detects whether a klo_state update warrants regenerating buyer_view.
// Pure function — no side effects, no DB calls.

import type { KloState } from './klo-state-types.ts'

export interface MaterialChangeResult {
  isMaterial: boolean
  reasons: string[] // for telemetry — why we decided to regenerate (or why not)
}

export function detectMaterialChange(args: {
  before: KloState | null
  after: KloState
  messagesSinceLastBuyerView: number
}): MaterialChangeResult {
  const reasons: string[] = []

  // First-ever generation
  if (!args.before || !args.before.buyer_view) {
    reasons.push('first_generation')
    return { isMaterial: true, reasons }
  }

  const b = args.before
  const a = args.after

  // 1. People changes (added or removed)
  const beforePeople = new Set((b.people ?? []).map((p) => p.name))
  const afterPeople = new Set((a.people ?? []).map((p) => p.name))
  if (afterPeople.size !== beforePeople.size) {
    reasons.push('people_count_changed')
  } else {
    for (const n of afterPeople) {
      if (!beforePeople.has(n)) {
        reasons.push('person_added')
        break
      }
    }
    for (const n of beforePeople) {
      if (!afterPeople.has(n)) {
        reasons.push('person_removed')
        break
      }
    }
  }

  // 2. Stage
  if (b.stage !== a.stage) reasons.push('stage_changed')

  // 3. Deadline
  // deno-lint-ignore no-explicit-any
  if ((b.deadline as any)?.date !== (a.deadline as any)?.date) reasons.push('deadline_changed')

  // 4. Deal value (≥ 10% change)
  // deno-lint-ignore no-explicit-any
  const beforeValue = (b.deal_value as any)?.amount ?? null
  // deno-lint-ignore no-explicit-any
  const afterValue = (a.deal_value as any)?.amount ?? null
  if (beforeValue !== afterValue) {
    if (beforeValue && afterValue) {
      const delta = Math.abs(afterValue - beforeValue) / beforeValue
      if (delta >= 0.1) reasons.push('deal_value_changed_significantly')
    } else {
      reasons.push('deal_value_set_or_cleared')
    }
  }

  // 5. Blockers
  const beforeBlockers = (b.blockers ?? []).length
  const afterBlockers = (a.blockers ?? []).length
  if (beforeBlockers !== afterBlockers) reasons.push('blockers_count_changed')

  // 6. Decisions
  const beforeDecisions = (b.decisions ?? []).length
  const afterDecisions = (a.decisions ?? []).length
  if (afterDecisions > beforeDecisions) reasons.push('decision_added')

  // 7. Next meeting
  // deno-lint-ignore no-explicit-any
  const beforeMeeting = (b as any).next_meeting?.date ?? null
  // deno-lint-ignore no-explicit-any
  const afterMeeting = (a as any).next_meeting?.date ?? null
  if (beforeMeeting !== afterMeeting) reasons.push('next_meeting_changed')

  // 8. Last meeting (newly populated)
  // deno-lint-ignore no-explicit-any
  const beforeLast = (b as any).last_meeting?.date ?? null
  // deno-lint-ignore no-explicit-any
  const afterLast = (a as any).last_meeting?.date ?? null
  if (!beforeLast && afterLast) reasons.push('meeting_just_happened')

  // 9. Confidence delta ≥ 10
  // deno-lint-ignore no-explicit-any
  const beforeConf = (b as any).confidence?.value ?? null
  // deno-lint-ignore no-explicit-any
  const afterConf = (a as any).confidence?.value ?? null
  if (beforeConf != null && afterConf != null) {
    if (Math.abs(afterConf - beforeConf) >= 10) reasons.push('confidence_shifted')
  }

  // 10. Slow-moving deal staleness
  if (args.messagesSinceLastBuyerView >= 5) {
    reasons.push('staleness_threshold')
  }

  return {
    isMaterial: reasons.length > 0,
    reasons,
  }
}
