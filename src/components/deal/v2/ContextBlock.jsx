// Context — free-form deal description. Editable inline. Persists to
// deal_context.notes (the same column that the rest of the app already uses).

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase.js'

export default function ContextBlock({ deal, dealContext }) {
  const [notes, setNotes] = useState(dealContext?.notes ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    setNotes(dealContext?.notes ?? '')
  }, [dealContext?.notes])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  async function handleSave() {
    if (!deal?.id) return
    setSaving(true)
    if (dealContext?.id) {
      await supabase
        .from('deal_context')
        .update({ notes })
        .eq('id', dealContext.id)
    } else {
      await supabase.from('deal_context').insert({
        deal_id: deal.id,
        notes,
      })
    }
    setSaving(false)
    setEditing(false)
  }

  const placeholder =
    'Describe the deal in your own words — what you\'re selling, why it matters, what the buyer cares about, and any hard constraints. Klo reads from this.'

  return (
    <section className="dr-card mb-4">
      <div className="dr-card-head">
        <h3>What this deal is</h3>
        <div
          className="dr-mono"
          style={{ fontSize: 10.5, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {editing ? 'Editing' : 'Click to edit'}
        </div>
      </div>
      <div className="dr-card-body">
        {editing ? (
          <div>
            <textarea
              ref={textareaRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={placeholder}
              className="w-full"
              style={{
                minHeight: 120,
                background: 'var(--dr-bg)',
                border: '1px solid var(--dr-line)',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 13.5,
                lineHeight: 1.6,
                color: 'var(--dr-ink-2)',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div className="flex gap-2 mt-2 justify-end">
              <button
                type="button"
                className="dr-btn"
                onClick={() => {
                  setNotes(dealContext?.notes ?? '')
                  setEditing(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dr-btn dr-btn--primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="block w-full text-left"
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: notes ? 'var(--dr-ink-2)' : 'var(--dr-ink-3)',
              letterSpacing: '-0.005em',
              padding: '6px 0 4px',
              background: 'transparent',
              border: 'none',
              cursor: 'text',
            }}
          >
            {notes || placeholder}
          </button>
        )}
      </div>
    </section>
  )
}
