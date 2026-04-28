// Klosure — Phase 8
// Tool schema for the buyer-view extraction call. Lives separate from the
// main KLO_OUTPUT_TOOL because the call is independent and gated.

import type { LlmToolDefinition } from './llm-types.ts'

export const BUYER_VIEW_TOOL: LlmToolDefinition = {
  name: 'emit_buyer_view',
  description: `Emit the structured buyer dashboard. You MUST call this tool exactly once.

Every field must be present. Use empty arrays / null where appropriate. Do not omit fields.

The output is rendered directly to the buyer's dashboard. The buyer will read every word. Be specific, action-oriented, and never reveal seller-side strategy.`,
  parameters: {
    type: 'object',
    properties: {
      buyer_view: {
        type: 'object',
        properties: {
          klo_brief_for_buyer: {
            type: 'string',
            description: '3-5 sentences. Hero card. Written to the buyer ("you"). Action-oriented.',
          },
          signals: {
            type: 'array',
            description:
              'Exactly 3 items: timeline_health, stakeholder_alignment, vendor_responsiveness — one of each kind.',
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['timeline_health', 'stakeholder_alignment', 'vendor_responsiveness'],
                },
                level: {
                  type: 'string',
                  enum: ['strong', 'mixed', 'weak'],
                },
                one_line_why: {
                  type: 'string',
                  description: '≤ 14 words explaining the level.',
                },
              },
              required: ['kind', 'level', 'one_line_why'],
            },
            minItems: 3,
            maxItems: 3,
          },
          playbook: {
            type: 'array',
            description: '3-5 specific moves for the buyer this week.',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', description: 'Imperative, ≤ 12 words.' },
                why_it_matters: { type: 'string', description: '1 sentence.' },
                who: {
                  type: 'string',
                  description: '"you", "your_team", "vendor", or free text like "your CFO".',
                },
                deadline: { type: ['string', 'null'], description: 'ISO date or null.' },
                status: {
                  type: 'string',
                  enum: ['not_started', 'in_flight', 'done'],
                },
                source_message_id: { type: ['string', 'null'] },
              },
              required: [
                'action',
                'why_it_matters',
                'who',
                'deadline',
                'status',
                'source_message_id',
              ],
            },
            minItems: 0,
            maxItems: 5,
          },
          stakeholder_takes: {
            type: 'array',
            description: 'Buyer-side internal stakeholders. 0-8 items.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string' },
                engagement: {
                  type: 'string',
                  enum: ['aligned', 'engaged', 'quiet', 'blocker', 'unknown'],
                },
                klo_note: {
                  type: ['string', 'null'],
                  description: '1 sentence — what to do about this stakeholder.',
                },
              },
              required: ['name', 'role', 'engagement', 'klo_note'],
            },
            minItems: 0,
            maxItems: 8,
          },
          risks_klo_is_watching: {
            type: 'array',
            description: '2-3 buyer-facing risks framed as things to act on.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '≤ 10 words.' },
                why_it_matters: { type: 'string', description: '1-2 sentences.' },
                mitigation: { type: 'string', description: '1 sentence.' },
              },
              required: ['label', 'why_it_matters', 'mitigation'],
            },
            minItems: 0,
            maxItems: 3,
          },
          momentum_score: {
            type: ['number', 'null'],
            description: 'Buyer-facing momentum 0-100. null if cannot assess.',
          },
          momentum_trend: {
            type: ['string', 'null'],
            enum: ['up', 'down', 'flat', null],
          },
          recent_moments: {
            type: 'array',
            description: '3-5 buyer-friendly history items, oldest to newest.',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'ISO date.' },
                text: { type: 'string', description: '≤ 16 words.' },
              },
              required: ['date', 'text'],
            },
            minItems: 0,
            maxItems: 5,
          },
          generation_reason: {
            type: 'string',
            enum: ['initial', 'material_change', 'manual_refresh'],
          },
        },
        required: [
          'klo_brief_for_buyer',
          'signals',
          'playbook',
          'stakeholder_takes',
          'risks_klo_is_watching',
          'momentum_score',
          'momentum_trend',
          'recent_moments',
          'generation_reason',
        ],
      },
    },
    required: ['buyer_view'],
  },
}
