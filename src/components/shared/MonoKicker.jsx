// Mono kicker / numbered feature label — "01 / Interrogation" style.
// Sits above an H3 anywhere you want to *index* something:
// pipeline filters, forecast columns, dashboard stat cards.

import './designLanguage.css'

export default function MonoKicker({ children, accent = false, className = '', ...rest }) {
  const cls = ['kl-kicker', accent ? 'kl-kicker--accent' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  )
}
