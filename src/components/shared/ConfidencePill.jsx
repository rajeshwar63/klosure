// Tone-coded confidence number. Uses the semantic palette (good/warn/bad)
// — the *number in the right tone color* IS the signal. No icons.
//
// Buyer view per §5.7 has no confidence pill — do not place this in the
// buyer-facing components.

import './designLanguage.css'

function toneFromValue(value) {
  if (value == null) return null
  if (value >= 65) return 'good'
  if (value >= 35) return 'warn'
  return 'bad'
}

export default function ConfidencePill({ value, tone, suffix = '%', delta, className = '', ...rest }) {
  const t = tone ?? toneFromValue(value)
  const cls = ['kl-pill', t ? `kl-pill--${t}` : '', className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...rest}>
      <span className="kl-pill__num">
        {value ?? '—'}
        {value != null && suffix}
      </span>
      {delta != null && delta !== 0 && (
        <span aria-hidden>{delta > 0 ? `+${delta}` : delta}</span>
      )}
    </span>
  )
}
