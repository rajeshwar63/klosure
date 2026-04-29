// The signature card layout from the landing's feature row.
// Hairline 1px gap on a `--klo-line` background gives the editorial-spread
// look without per-card borders. Use for: Today's deal list, Deals pipeline,
// Team roster, manager This Week list, Forecast Reps grid.

import './designLanguage.css'

function HairlineGrid({ cols = 3, children, className = '', ...rest }) {
  const colClass = cols === 'rows' ? 'kl-grid--rows' : `kl-grid--cols-${cols}`
  return (
    <div className={['kl-grid', colClass, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}

function Cell({ as: Tag = 'div', interactive = false, className = '', children, ...rest }) {
  const cls = [
    'kl-grid__cell',
    interactive ? 'kl-grid__cell--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}

HairlineGrid.Cell = Cell

export default HairlineGrid
