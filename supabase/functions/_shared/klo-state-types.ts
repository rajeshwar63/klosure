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
