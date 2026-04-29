// The page hero on every seller-facing surface.
// 1–3 sentences, accent left-border, no shadow. Stats and chrome live below.
// Per §4 of the design brief: Klo speaks in 1–3 sentences, never paragraphs.

import './designLanguage.css'

export default function KloBriefCard({
  label = 'Klo · Your deal coach',
  children,
  updatedAt,
  className = '',
  ...rest
}) {
  return (
    <section className={['kl-brief', className].filter(Boolean).join(' ')} {...rest}>
      <header className="kl-brief__head">
        <span className="kl-brief__mark" aria-hidden />
        <span className="kl-brief__label">{label}</span>
      </header>
      <div className="kl-brief__body">{children}</div>
      {updatedAt && <div className="kl-brief__foot">{updatedAt}</div>}
    </section>
  )
}
