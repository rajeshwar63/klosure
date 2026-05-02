// Shared shell for the public /privacy and /terms pages.
//
// Both pages render markdown sourced from docs/legal/*.md (imported via Vite's
// `?raw` loader so the markdown stays the single source of truth) and reuse
// the landing-page color and font tokens defined in LegalPage.css.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './LegalPage.css'

const LAST_UPDATED = 'Last updated: May 1, 2026'

const markdownComponents = {
  // Wrap tables so they horizontally scroll on narrow phones instead of
  // pushing the page width past 375px.
  table: ({ node, ...props }) => (
    <div className="klo-legal-table-wrap">
      <table {...props} />
    </div>
  ),
}

export default function LegalPage({ title, description, content }) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = `${title} — Klosure`
    const desc = document.querySelector('meta[name="description"]')
    const prevDesc = desc?.getAttribute('content')
    if (desc && description) desc.setAttribute('content', description)
    return () => {
      document.title = prevTitle
      if (desc && prevDesc != null) desc.setAttribute('content', prevDesc)
    }
  }, [title, description])

  return (
    <div className="klo-legal">
      <nav className="klo-legal-nav">
        <div className="klo-legal-nav-inner">
          <Link to="/" className="klo-legal-brand">
            Klosure
          </Link>
          <Link to="/" className="klo-legal-back">
            ← Back to home
          </Link>
        </div>
      </nav>
      <main className="klo-legal-shell">
        <p className="klo-legal-meta">{LAST_UPDATED}</p>
        <article className="klo-legal-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  )
}
