// Two-column "what was said vs. what Klo sees" pattern from the landing.
// The truth column carries the accent-soft top tint. Each row uses the
// tone tokens (good/warn/bad/dim) on the value side.
//
// Reused on the seller's Overview as "What you said" vs "What Klo sees",
// and on the manager's Forecast as rep-call vs Klo-call.

import './designLanguage.css'

function CompareStrip({ children, className = '', ...rest }) {
  return (
    <div className={['kl-compare', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}

function Column({ truth = false, head, tag, children, className = '', ...rest }) {
  const cls = [
    'kl-compare__col',
    truth ? 'kl-compare__col--truth' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} {...rest}>
      {(head || tag) && (
        <h4 className="kl-compare__head">
          <span>{head}</span>
          {tag && <span className="kl-compare__tag">{tag}</span>}
        </h4>
      )}
      {children}
    </div>
  )
}

function Row({ k, v, tone }) {
  const toneClass = tone ? ` kl-compare__v--${tone}` : ''
  return (
    <div className="kl-compare__row">
      <span className="kl-compare__k">{k}</span>
      <span className={`kl-compare__v${toneClass}`}>{v}</span>
    </div>
  )
}

CompareStrip.Column = Column
CompareStrip.Row = Row

export default CompareStrip
