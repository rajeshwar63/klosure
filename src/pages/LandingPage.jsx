import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import './LandingPage.css'

const PHONE_DISPLAY = '+91 93985 74255'
const PHONE_TEL = '+919398574255'
const EMAIL = 'raja@klosure.ai'
const LINKEDIN = 'https://www.linkedin.com/in/rajeshwar'

function handleAnchorClick(e, id) {
  e.preventDefault()
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

export default function LandingPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = "Klosure — Stop guessing. Start closing."
    const desc = document.querySelector('meta[name="description"]')
    const prevDesc = desc?.getAttribute('content')
    if (desc) {
      desc.setAttribute(
        'content',
        "Klosure — Stop guessing. Start closing. An AI deal coach for B2B sales teams. Real signals, not rep updates — so you know what's actually moving, stuck, or dead."
      )
    }
    return () => {
      document.title = prevTitle
      if (desc && prevDesc != null) desc.setAttribute('content', prevDesc)
    }
  }, [])

  return (
    <div className="klo-landing">
      <NavBar />
      <Hero />
      <Problem />
      <Features />
      <Comparison />
      <Pricing />
      <Contact />
      <Footer />
    </div>
  )
}

function LogoMark({ withDefs = false }) {
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {withDefs && (
        <defs>
          <linearGradient id="kloGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7BA8FF" />
            <stop offset="100%" stopColor="#3B6FD9" />
          </linearGradient>
        </defs>
      )}
      <rect
        x="3.2"
        y="3.2"
        width="17.6"
        height="17.6"
        rx="3.6"
        transform="rotate(45 12 12)"
        stroke="url(#kloGrad)"
        strokeWidth="1.6"
      />
      <rect
        x="7.4"
        y="7.4"
        width="9.2"
        height="9.2"
        rx="1.6"
        transform="rotate(45 12 12)"
        fill="url(#kloGrad)"
      />
    </svg>
  )
}

function NavBar() {
  return (
    <nav className="klo-nav">
      <div className="container nav-inner">
        <Link to="/" className="logo" aria-label="Klosure">
          <LogoMark withDefs />
          <span>Klosure</span>
        </Link>
        <div className="nav-links">
          <a href="#features" onClick={(e) => handleAnchorClick(e, 'features')}>Product</a>
          <a href="#pricing" onClick={(e) => handleAnchorClick(e, 'pricing')}>Pricing</a>
          <a href="#contact" onClick={(e) => handleAnchorClick(e, 'contact')}>Contact</a>
          <Link to="/login" className="nav-login">Log in</Link>
          <Link to="/signup" className="btn btn-primary">
            Get started
          </Link>
        </div>
      </div>
    </nav>
  )
}

function ArrowIcon() {
  return (
    <svg className="arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M5 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Hero() {
  return (
    <section className="hero">
      <div className="container hero-inner">
        <span className="eyebrow">Stop guessing. Start closing.</span>
        <h1>
          Your reps don't know why deals are stuck.
          <br />
          Your CRM <span className="dim">definitely</span> doesn't.
          <br />
          <span className="accent">Klosure shows the truth — and gets you closure.</span>
        </h1>
        <p className="hero-sub">
          Klosure is an AI deal coach that sits inside every deal — tracking{' '}
          <strong>real signals</strong>, not rep updates — so you know what's actually moving,
          stuck, or dead.
        </p>
        <div className="hero-cta">
          <Link to="/signup" className="btn btn-primary btn-lg">
            Get started free
            <ArrowIcon />
          </Link>
          <a
            href="#contact"
            onClick={(e) => handleAnchorClick(e, 'contact')}
            className="btn btn-ghost btn-lg"
          >
            Book a 30-min demo
          </a>
        </div>
        <div className="hero-signin mono">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
        <div className="hero-tag mono">No more "this deal looks good" — without proof.</div>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <section className="problem">
      <div className="narrow">
        <div className="divider-line" />
        <h2>Your pipeline is fiction.</h2>
        <p>
          <span className="kicker">Deals look alive because reps say they are.</span> Not because
          buyers are actually moving. By the time reality shows up, the quarter is already gone.
        </p>
        <div className="divider-line" style={{ margin: '40px auto 0' }} />
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="features">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">What Klosure does</span>
          <h2>Three things your CRM will never tell you.</h2>
          <p>No dashboards begging for input. No rep optimism. Just the deal, exposed.</p>
        </div>

        <div className="feature-grid">
          <div className="feature">
            <div className="feature-num mono">01 / Interrogation</div>
            <h3>Klo interrogates every deal.</h3>
            <p>
              It doesn't trust your reps. It asks what they avoid. Who signs? What's blocked? Why
              is the CFO missing? If the answers aren't there — the deal isn't real.
            </p>
            <div className="glyph mono">→ Real questions, not status fields</div>
          </div>

          <div className="feature">
            <div className="feature-num mono">02 / Confidence</div>
            <h3>Your pipeline stops lying.</h3>
            <p>
              Every deal gets a confidence score based on real signals. Not updates. Not gut feel.
              Not optimism. You see what's real — instantly.
            </p>
            <div className="glyph mono">→ Forecast you can actually defend</div>
          </div>

          <div className="feature">
            <div className="feature-num mono">03 / Buyer view</div>
            <h3>Buyers stop disappearing.</h3>
            <p>
              Give buyers a shared view of what's pending. Klo nudges them too — politely,
              persistently. No more deals dying quietly in email threads.
            </p>
            <div className="glyph mono">→ Silence becomes a signal</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Comparison() {
  return (
    <section className="deal-strip">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Reality check</span>
          <h2>What your rep says vs. what Klo sees.</h2>
          <p>Same deal. Two stories. One of them closes.</p>
        </div>

        <div className="compare">
          <div className="compare-col">
            <h4>
              Rep update <span className="tag">CRM</span>
            </h4>
            <CompareRow k="Stage" v="Negotiation" />
            <CompareRow k="Forecast" v="Commit · 80%" tone="good" />
            <CompareRow k="Close date" v="This quarter" />
            <CompareRow k="Champion" v="Confirmed" />
            <CompareRow k="Last note" v={'"Looks good, just legal review"'} tone="dim" />
            <CompareRow k="Risk" v="None flagged" tone="dim" />
          </div>
          <div className="compare-col truth">
            <h4>
              Klo verdict <span className="tag">Real signals</span>
            </h4>
            <CompareRow k="Stage" v="Stalled · 18 days" tone="warn" />
            <CompareRow k="Confidence" v="22% · slipping" tone="bad" />
            <CompareRow k="Close date" v="+47 days realistic" tone="warn" />
            <CompareRow k="Champion" v="Disengaged · 11 days silent" tone="warn" />
            <CompareRow k="Buyer signal" v="CFO never invited" tone="bad" />
            <CompareRow k="Action" v="Escalate or write-off" />
          </div>
        </div>
      </div>
    </section>
  )
}

function CompareRow({ k, v, tone }) {
  const toneClass = tone ? ` ${tone}` : ''
  return (
    <div className="compare-row">
      <span className="k">{k}</span>
      <span className={`v${toneClass}`}>{v}</span>
    </div>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="pricing">
      <div className="container">
        <span className="eyebrow">Pricing</span>
        <h2>Simple pricing. Real value.</h2>
        <p className="pricing-kicker">
          If this saves even one deal this quarter, it pays for itself.
        </p>

        <div className="price-grid">
          <div className="price-card">
            <div className="price-tier mono">For individual sellers</div>
            <div className="price-name">Pro</div>
            <div className="price-amount">
              <span className="num">₹2,499</span>
              <span className="per">/ month</span>
            </div>
            <div className="price-was mono">₹4,999</div>
            <ul className="price-list">
              <li>AI deal coaching</li>
              <li>Confidence scoring</li>
              <li>Shared buyer view</li>
              <li>Email + Slack signals</li>
            </ul>
            <Link to="/signup" className="btn btn-ghost btn-lg">
              Start free
            </Link>
          </div>

          <div className="price-card featured">
            <span className="price-badge mono">Most popular</span>
            <div className="price-tier mono">For sales teams</div>
            <div className="price-name">Team</div>
            <div className="price-amount">
              <span className="num">₹9,999</span>
              <span className="per">/ month</span>
            </div>
            <div className="price-was mono">₹19,999</div>
            <ul className="price-list">
              <li>Everything in Pro</li>
              <li>Manager dashboard</li>
              <li>Pipeline reality reports</li>
              <li>Forecast you can defend</li>
              <li>Priority support</li>
            </ul>
            <Link to="/signup" className="btn btn-primary btn-lg">
              Get started
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function Contact() {
  return (
    <section id="contact" className="contact">
      <div className="container">
        <div className="contact-inner">
          <span className="eyebrow">The close</span>
          <h2>Bring one of your deals.</h2>
          <p>We'll show you exactly what's wrong with it. 30 minutes. No slides.</p>

          <div className="contact-line">
            <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" className="contact-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5V9h3zM6.5 7.7A1.7 1.7 0 1 1 8.2 6 1.7 1.7 0 0 1 6.5 7.7zM19 19h-3v-5.3c0-1.3-.5-2.2-1.7-2.2a1.8 1.8 0 0 0-1.7 1.2 2.3 2.3 0 0 0-.1.8V19h-3V9h3v1.3a3 3 0 0 1 2.7-1.5c2 0 3.5 1.3 3.5 4z" />
              </svg>
              <span>LinkedIn</span>
            </a>
            <span className="contact-sep">·</span>
            <a href={`mailto:${EMAIL}`} className="contact-pill">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="3" width="12" height="10" rx="1.5" />
                <path d="M2.5 4l5.5 4 5.5-4" />
              </svg>
              <span>{EMAIL}</span>
            </a>
            <span className="contact-sep">·</span>
            <a href={`tel:${PHONE_TEL}`} className="contact-pill">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 11.3v2a1.3 1.3 0 0 1-1.5 1.3 13 13 0 0 1-5.7-2 12.7 12.7 0 0 1-3.9-3.9 13 13 0 0 1-2-5.8A1.3 1.3 0 0 1 2.2 1.4h2A1.3 1.3 0 0 1 5.5 2.5c.1.7.2 1.3.5 2a1.3 1.3 0 0 1-.3 1.4l-.8.8a10.7 10.7 0 0 0 4 4l.8-.8a1.3 1.3 0 0 1 1.4-.3c.6.2 1.3.4 2 .5a1.3 1.3 0 0 1 1.1 1.3z" />
              </svg>
              <span>{PHONE_DISPLAY}</span>
            </a>
          </div>

          <div className="contact-foot">— Rajeshwar, Founder. 13 years in B2B sales.</div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="klo-footer">
      <div className="container footer-inner">
        <Link to="/" className="logo">
          <LogoMark />
          <span>Klosure</span>
        </Link>
        <div className="footer-links">
          <a href="#features" onClick={(e) => handleAnchorClick(e, 'features')}>Product</a>
          <a href="#pricing" onClick={(e) => handleAnchorClick(e, 'pricing')}>Pricing</a>
          <a href="#contact" onClick={(e) => handleAnchorClick(e, 'contact')}>Contact</a>
        </div>
        <div>© 2026 Klosure. Built for sales heads who want the truth.</div>
      </div>
    </footer>
  )
}
