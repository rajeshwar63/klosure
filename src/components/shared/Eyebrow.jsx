// Mono uppercase label with a glowing accent dot. One per section maximum.
// Use it as the "section title" on every page — Today's "Your day", Overview's
// "Klo's read", Forecast's "Reality check".

import './designLanguage.css'

export default function Eyebrow({ children, dot = true, className = '', ...rest }) {
  const cls = ['kl-eyebrow', dot ? '' : 'kl-eyebrow--plain', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  )
}
