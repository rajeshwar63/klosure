import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PLANS, priceDisplayFor } from '../lib/plans.ts'
import './LandingPage.css'

// Phase A sprint 09: 3-tier pricing — Coach / Closer / Command.
const SHOWN_PLANS = ['coach', 'closer', 'command']
const CURRENCIES = ['USD', 'AED', 'INR']

const CURRENCY_LABELS = {
  USD: 'US Dollars',
  AED: 'UAE Dirhams',
  INR: 'Indian Rupees',
}

const EMAIL = 'support@klosure.ai'
const LINKEDIN = 

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
      <ManagerView />
      <Pricing />
      <Contact />
      <Footer />
    </div>
  )
}

function LogoMark() {
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="#1A1A2E" />
      <g transform="translate(32 32)">
        <polygon points="0,-22 22,0 0,22 -22,0" fill="#4F8EF7" />
        <polygon points="0,-11 11,0 0,11 -11,0" fill="#1A1A2E" />
      </g>
    </svg>
  )
}

function NavBar() {
  return (
    <nav className="klo-nav">
      <div className="container nav-inner">
        <Link to="/" className="logo" aria-label="Klosure">
          <LogoMark />
          <span>Klosure</span>
        </Link>
        <div className="nav-links">
          <a href="#features" onClick={(e) => handleAnchorClick(e, 'features')}>Product</a>
          <a href="#pricing" onClick={(e) => handleAnchorClick(e, 'pricing')}>Pricing</a>
          <a href="#contact" onClick={(e) => handleAnchorClick(e, 'contact')}>Contact</a>
          <Link to="/login" className="nav-login">Log in</Link>
          <Link to="/signup" className="btn btn-primary nav-cta">
            Sign up
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

function ManagerView() {
  return (
    <section id="manager-view" className="manager-view">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">For sales managers</span>
          <h2>How managers see their team's deals.</h2>
          <p>
            One screen. Every rep. Every deal. Klo flags what's slipping before the
            forecast call — so you walk in with answers, not surprises.
          </p>
        </div>

        <div className="mgr-stage">
          <div className="mgr-window">
            <div className="mgr-windowbar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="mgr-windowbar-title mono">/team — Acme Sales</span>
            </div>

            <div className="mgr-screen">
              <div className="mgr-header">
                <div className="mono mgr-eyebrow">This week · 27 APR – 03 MAY</div>
                <h3>Where the quarter is being made or lost.</h3>
                <p className="mgr-sub">Acme Sales · 6 reps · 23 active deals</p>
              </div>

              <div className="mgr-glance">
                <MgrBucket label="Likely close" amount="$412k" deals="7 deals" tone="good" />
                <MgrBucket label="In play" amount="$298k" deals="9 deals" tone="caution" />
                <MgrBucket label="Long shot" amount="$145k" deals="7 deals" tone="muted" />
              </div>

              <div className="mgr-row-eyebrow mono">By rep · this quarter</div>
              <div className="mgr-rollup">
                <RepRow
                  initial="P"
                  name="Priya"
                  active={6}
                  red={2}
                  pipeline="$182k"
                  risk="$48k at risk"
                />
                <RepRow
                  initial="A"
                  name="Arjun"
                  active={5}
                  red={0}
                  pipeline="$155k"
                  risk={null}
                />
                <RepRow
                  initial="M"
                  name="Meera"
                  active={4}
                  red={3}
                  pipeline="$210k"
                  risk="$120k at risk"
                  warn
                />
                <RepRow
                  initial="R"
                  name="Rohit"
                  active={5}
                  red={1}
                  pipeline="$98k"
                  risk="$22k at risk"
                />
              </div>

              <div className="mgr-row-eyebrow mono mgr-row-eyebrow-2">
                Klo flagged this morning
              </div>
              <div className="mgr-flags">
                <FlagRow
                  who="Meera · Vertex Corp"
                  what="Champion silent 11 days · CFO never invited"
                  tone="bad"
                />
                <FlagRow
                  who="Priya · Northwind"
                  what="Close date slipping +18 days vs. last forecast"
                  tone="warn"
                />
                <FlagRow
                  who="Rohit · Globex"
                  what="Buyer view unread for 6 days — nudge sent"
                  tone="warn"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mgr-bullets">
          <div className="mgr-bullet">
            <div className="mgr-bullet-num mono">01</div>
            <h4>One rollup, every rep</h4>
            <p>
              See active deals, pipeline, and what's at risk per rep — without
              chasing them on Slack.
            </p>
          </div>
          <div className="mgr-bullet">
            <div className="mgr-bullet-num mono">02</div>
            <h4>Klo flags slippage early</h4>
            <p>
              Stalled champions, missing CFOs, slipping close dates — surfaced
              before pipe review, not after the quarter.
            </p>
          </div>
          <div className="mgr-bullet">
            <div className="mgr-bullet-num mono">03</div>
            <h4>Ask Klo any question</h4>
            <p>
              "Which deals should I escalate this week?" Klo answers across the
              team with real signals, not gut feel.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function MgrBucket({ label, amount, deals, tone }) {
  return (
    <div className={`mgr-bucket mgr-bucket-${tone}`}>
      <div className="mgr-bucket-label mono">{label}</div>
      <div className="mgr-bucket-amount">{amount}</div>
      <div className="mgr-bucket-deals mono">{deals}</div>
    </div>
  )
}

function RepRow({ initial, name, active, red, pipeline, risk, warn }) {
  return (
    <div className={`rep-row${warn ? ' rep-row-warn' : ''}`}>
      <div className="rep-avatar">{initial}</div>
      <div className="rep-meta">
        <div className="rep-name">{name}</div>
        <div className="rep-counts mono">
          Active · {active}  ·  Red · {red}
        </div>
      </div>
      <div className="rep-numbers">
        <div className="rep-pipeline">{pipeline}</div>
        {risk && <div className="rep-risk mono">{risk}</div>}
      </div>
    </div>
  )
}

function FlagRow({ who, what, tone }) {
  return (
    <div className={`mgr-flag mgr-flag-${tone}`}>
      <span className={`flag-dot flag-dot-${tone}`} />
      <span className="flag-who">{who}</span>
      <span className="flag-sep">·</span>
      <span className="flag-what">{what}</span>
    </div>
  )
}

function Pricing() {
  // USD default — that's our anchor price. Toggle for INR/AED if local.
  const [currency, setCurrency] = useState('USD')

  return (
    <section id="pricing" className="pricing">
      <div className="container">
        <span className="eyebrow">Pricing</span>
        <h2>Simple pricing. Real value.</h2>
        <p className="pricing-kicker">
          If this saves even one deal this quarter, it pays for itself.
        </p>

        <div className="pricing-toolbar">
          <span className="pricing-currency-note mono">
            Prices shown in {CURRENCY_LABELS[currency] ?? currency}.
          </span>
          <div className="currency-toggle" role="tablist" aria-label="Select currency">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={currency === c}
                className={`currency-btn${currency === c ? ' active' : ''}`}
                onClick={() => setCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Two-card centered grid: Klosure + Enterprise. No slider — only two
            options, so a static layout is simpler and reads better. */}
        <div className="price-grid">
          {SHOWN_PLANS.map((slug) => (
            <PricingCard key={slug} plan={PLANS[slug]} currency={currency} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingCard({ plan, currency }) {
  // 'command' is the new enterprise/contact-sales tier.
  const isEnterprise = plan.slug === 'command'
  // 'closer' is the headline tier — Coach + Email + Notetaker.
  const isFeatured = plan.slug === 'closer'
  const priceInfo = priceDisplayFor(plan.slug, currency)

  return (
    <div className={`price-card${isFeatured ? ' featured' : ''}`}>
      <div className="price-tier mono">{plan.shortLabel}</div>
      <div className="price-name">{plan.label}</div>
      <p className="price-desc">{plan.description}</p>

      <div className="price-amount">
        {isEnterprise ? (
          <span className="num enterprise">Contact sales</span>
        ) : (
          <>
            <span className="num">{priceInfo.primary}</span>
            <span className="per">/mo</span>
          </>
        )}
      </div>
      {!isEnterprise && plan.isTeam && (
        <>
          <p className="price-seats mono">Per seat · scale to as many reps as you need</p>
          <p className="price-tax mono">Exclusive of applicable taxes</p>
        </>
      )}

      <ul className="price-list">
        {plan.highlights.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>

      {isEnterprise ? (
        <a href={`mailto:${EMAIL}`} className="btn btn-primary btn-lg">
          Talk to sales
        </a>
      ) : (
        <Link to="/signup" className="btn btn-primary btn-lg">
          Get started
        </Link>
      )}
    </div>
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
          </div>
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
        <div className="footer-tagline">
          Built for sales heads who want the truth.
        </div>
      </div>
      <div className="container footer-legal">
        <div className="footer-legal-links">
          <Link to="/privacy">Privacy Policy</Link>
          <span className="footer-legal-sep" aria-hidden>·</span>
          <Link to="/terms">Terms of Service</Link>
          <span className="footer-legal-sep" aria-hidden>·</span>
          <a href="mailto:rajeshwar63@gmail.com">rajeshwar63@gmail.com</a>
        </div>
        <div className="footer-legal-copy">
          © 2026 Klosure.ai. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
