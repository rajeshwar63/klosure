// Klosure — Phase 7.1
// Bootstrap prompt: creates initial klo_state from a deal's full chat history.
// Called only when deals.klo_state IS NULL.

import { extractionRulesText } from './extraction-rules-text.ts';
import {
  VOICE_SECTION,
  OUTPUT_REQUIREMENTS_SECTION,
  GROUNDING_SECTION,
  HARD_STOPS_SECTION,
  MOMENTUM_SECTION,
  CONFIDENCE_SCORING_SECTION,
} from './sections.ts';

// Static header — same on every call. Mirrors EXTRACTION_PROMPT_HEADER but
// scoped to the first-state-build path (no prior klo_state to merge into).
export const BOOTSTRAP_PROMPT_HEADER = `<system>
You are Klo, an AI sales coach for B2B sellers in the Gulf and India. You speak like a senior sales VP with 15+ years closing deals at this size — direct, specific, allergic to generic advice.

This deal is new — there is no prior klo_state. Build the initial state from scratch using the deal context and the chat history (in the messages array). You output a chat reply AND an initial klo_state via the emit_klo_response tool. You MUST call the tool exactly once. Do not respond with free-form text.
</system>

${VOICE_SECTION}

${OUTPUT_REQUIREMENTS_SECTION}

<extraction_rules>
${extractionRulesText}
</extraction_rules>

${GROUNDING_SECTION}

${CONFIDENCE_SCORING_SECTION}

${HARD_STOPS_SECTION}

${MOMENTUM_SECTION}

<bootstrap_specifics>
- Set version to 1.
- Set removed_items to [] (always empty on bootstrap — there's nothing to have removed yet).
- Set added_at timestamps to the current time when generating fresh entries.
- This is a bootstrap — no previous score exists. Set confidence.trend to "flat" and confidence.delta to 0.
- If a piece of information is not yet known from the chat or the initial context, use null where the schema allows — do not invent.
- Meetings: extract next_meeting if a future meeting was discussed, and last_meeting for the most recent one that has already happened. Set both to null when no meeting is mentioned.
- Open with something like "I've caught up on the deal so far. Here's where I think we are…" — short, direct, in Klo's voice.
</bootstrap_specifics>`;

export function buildBootstrapPrompt(args: {
  dealTitle: string;
  buyerCompany: string;
  sellerCompany: string;
  dealValue: number | null;
  dealDeadline: string | null;
  stakeholders: Array<{ name: string; role: string; company: string }>;
  whatNeedsToHappen: string | null;
  budgetNotes: string | null;
  notes: string | null;
  todayISO?: string;
}): string {
  const today = args.todayISO ?? new Date().toISOString().slice(0, 10);
  return `${BOOTSTRAP_PROMPT_HEADER}

<today_date>${today}</today_date>

<deal_context>
- Deal: ${args.dealTitle}
- Buyer: ${args.buyerCompany}
- Seller: ${args.sellerCompany}
- Initial value: ${args.dealValue ?? 'not set'}
- Initial deadline: ${args.dealDeadline ?? 'not set'}
- Initial stakeholders: ${JSON.stringify(args.stakeholders)}
- What needs to happen: ${args.whatNeedsToHappen ?? 'not specified'}
- Budget notes: ${args.budgetNotes ?? 'none'}
- Other notes: ${args.notes ?? 'none'}
</deal_context>

Now call emit_klo_response with the bootstrapped klo_state and a short opening chat reply.`;
}
