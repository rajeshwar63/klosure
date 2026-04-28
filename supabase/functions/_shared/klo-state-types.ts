// Klosure — Phase 4.5
// Shape of the running deal state Klo maintains on every turn.
// Stored in deals.klo_state (jsonb).

export type Confidence = 'definite' | 'tentative';
export type Severity = 'green' | 'amber' | 'red';
export type TriggeredByRole = 'seller' | 'buyer' | 'system';
export type ChangeKind = 'extracted' | 'removed' | 'corrected';

export interface DealValue {
  amount: number;
  currency: string;             // 'USD', 'AED', etc.
  confidence: Confidence;
  source_message_id?: string;
}

export interface Deadline {
  date: string;                 // ISO YYYY-MM-DD
  confidence: Confidence;
  previous?: string;            // last known date if this one is tentative
  note?: string;                // why it's tentative or what changed
  source_message_id?: string;
}

export interface Person {
  name: string;
  role: string;                 // 'L&D Manager', 'CFO', etc.
  company: string;
  first_seen_message_id?: string;
  added_at: string;             // ISO timestamp — used for "no remove in same turn" guard
}

export interface Decision {
  what: string;                 // "Budget approved at $25k"
  when: string;                 // ISO date
  source_message_id?: string;
}

export interface Blocker {
  text: string;
  since: string;                // ISO date when first noted
  severity: Severity;
  source_message_id?: string;
  added_at: string;
}

export interface OpenQuestion {
  text: string;
  source_message_id?: string;
  added_at: string;
}

export interface RemovedItem {
  kind: 'people' | 'blockers' | 'open_questions' | 'decisions';
  value: unknown;               // the removed item, structurally
  reason: string;               // required — collected from the user
  removed_at: string;           // ISO timestamp
}

export interface ConfidenceFactor {
  label: string;                // "Signing authority unknown" — short, scannable
  impact: number;               // signed integer percentage points (e.g., -22, +15, +8)
  // Negative values are dragging the score DOWN; positive are pushing UP
  // The frontend renders negatives in the explanation, positives in "what would move this up"
}

export interface NextMeeting {
  date: string;                 // ISO datetime when known, ISO date (YYYY-MM-DD) otherwise
  title: string;                // "Demo with Ahmed", "Budget review call"
  with: string[];               // names mentioned in the meeting context
  confidence: Confidence;       // 'definite' once both sides confirmed, else 'tentative'
  source_message_id?: string | null;
}

export interface LastMeeting {
  date: string;                 // ISO date when the meeting happened
  title: string;
  outcome_note?: string | null; // 1 sentence post-meeting summary, if available
  source_message_id?: string | null;
}

export interface ConfidenceScore {
  value: number;                // 0-100, integer
  trend: 'up' | 'down' | 'flat';   // since last computed
  delta: number;                // signed integer — points changed since previous turn
  factors_dragging_down: ConfidenceFactor[]; // 0-5 items, ordered worst-first
  factors_to_raise: ConfidenceFactor[];      // 0-5 items, ordered highest-impact first
  rationale: string;            // 1-2 sentence narrative — "Two things dragged this score: ..."
  computed_at: string;          // ISO timestamp
}

// =============================================================================
// Phase 8 — Buyer view structured shape
// =============================================================================

export type SignalLevel = 'strong' | 'mixed' | 'weak';

export interface BuyerSignal {
  // Three buyer-facing health indicators that sit under the Klo brief.
  // These are NOT the seller's confidence factors. Buyer-relevant only.
  kind: 'timeline_health' | 'stakeholder_alignment' | 'vendor_responsiveness';
  level: SignalLevel;
  one_line_why: string;        // ≤ 14 words explaining the level
}

export interface BuyerPlaybookItem {
  action: string;              // imperative, ≤ 12 words. "Loop in your CISO before Friday"
  why_it_matters: string;      // 1 sentence, Klo's voice
  who: 'you' | 'your_team' | 'vendor' | string; // free text — "your CFO", "your CISO", "vendor's SE"
  deadline: string | null;     // ISO date or null
  status: 'not_started' | 'in_flight' | 'done'; // server-side default 'not_started'
  source_message_id: string | null;
}

export interface BuyerStakeholderTake {
  // Buyer-side internal stakeholders only — vendor team is captured separately.
  name: string;
  role: string;                // "CFO", "CISO", "Procurement Lead", "End-user lead"
  engagement: 'aligned' | 'engaged' | 'quiet' | 'blocker' | 'unknown';
  klo_note: string | null;     // 1 sentence — what to do about this stakeholder
}

export interface BuyerRisk {
  label: string;               // ≤ 10 words. "Procurement timeline"
  why_it_matters: string;      // 1-2 sentences in Klo's voice, buyer-side framing
  mitigation: string;          // 1 sentence — what the buyer should do
}

export interface BuyerRecentMoment {
  // Buyer-friendly history feed. Last 3-5 important things from the seller's chat.
  date: string;                // ISO date
  text: string;                // ≤ 16 words. "Vendor sent SOC 2 report"
}

export interface BuyerView {
  // The buyer-facing brief — the hero card on the dashboard.
  // Written TO the buyer, not about them. 3-5 sentences. Klo's voice.
  // Action-oriented framing. Never reveals seller strategy or confidence.
  klo_brief_for_buyer: string;

  // Three signals shown under the brief. Always 3 — one of each kind.
  signals: BuyerSignal[];

  // 3-5 specific moves the buyer should make this week.
  playbook: BuyerPlaybookItem[];

  // Buyer's internal stakeholder map. 3-8 people max.
  stakeholder_takes: BuyerStakeholderTake[];

  // 2-3 risks Klo is watching, framed as opportunities to act.
  risks_klo_is_watching: BuyerRisk[];

  // Single number 0-100 — buyer-facing "deal momentum" signal.
  // NOT the seller's confidence score — different framing, different scale meaning.
  // High = deal is moving forward (commitments kept, stakeholders engaged).
  // Low = deal is stalling (commitments slipping, stakeholders quiet).
  momentum_score: number | null;

  // 'up' | 'down' | 'flat' — direction of momentum vs last update.
  momentum_trend: 'up' | 'down' | 'flat' | null;

  // 3-5 buyer-friendly history items, oldest to newest.
  recent_moments: BuyerRecentMoment[];

  // Bookkeeping
  generated_at: string;        // ISO timestamp — when this buyer_view was last written
  generation_reason: 'initial' | 'material_change' | 'manual_refresh';
}

export interface KloState {
  version: 1;
  summary: string;              // one-sentence present-tense status
  stage: string;                // 'discovery' | 'proposal' | 'negotiation' | 'legal' | 'closed'
  stage_reasoning?: string;
  deal_value?: DealValue;
  deadline?: Deadline;
  people: Person[];
  decisions: Decision[];
  blockers: Blocker[];
  open_questions: OpenQuestion[];
  removed_items: RemovedItem[]; // permanent — Klo reads this every turn and never re-adds
  klo_take_seller: string;      // 1-3 sentences, seller-side coaching
  klo_take_buyer: string;       // 1-3 sentences, buyer-side coaching
  confidence?: ConfidenceScore;             // optional — null on freshly-bootstrapped deals
  previous_confidence_value?: number;       // tracks the previous score so we can compute trend/delta
  next_meeting?: NextMeeting | null;        // most imminent future meeting, if any
  last_meeting?: LastMeeting | null;        // most recently completed meeting, if any

  // Phase 8 — buyer-facing dashboard projection. Written by a separate
  // gated LLM call (see klo-respond → buyer-view extraction). Optional
  // because existing rows do not have it; the UI must handle the missing case.
  buyer_view?: BuyerView | null;
}

export interface KloRespondOutput {
  klo_state: KloState;
  chat_reply: string;           // posted as a Klo message, role-scoped via visible_to
}

export interface KloHistoryRow {
  id: string;
  deal_id: string;
  changed_at: string;
  triggered_by_message_id: string | null;
  triggered_by_role: TriggeredByRole;
  change_kind: ChangeKind;
  field_path: string;           // 'people[name=Ahmed]', 'deadline', 'bootstrap', etc.
  before_value: unknown;
  after_value: unknown;
  reason: string | null;
}
