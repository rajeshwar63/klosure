import { useEffect } from 'react'
import { Link } from 'react-router-dom'

const PHONE_DISPLAY = '+91 93985 74255'
const PHONE_TEL = '+919398574255'
const PHONE_WA = 'https://wa.me/919398574255'
const EMAIL = 'raja@klosure.ai'
const LAUNCH_OFFER_END = 'June 30, 2026'

function scrollToId(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleAnchorClick(e, id) {
  e.preventDefault()
  scrollToId(id)
  history.replaceState(null, '', `#${id}`)
}

export default function LandingPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Klosure.ai — AI deal coach for B2B sales teams'
    const desc = document.querySelector('meta[name="description"]')
    const prevDesc = desc?.getAttribute('content')
    if (desc) {
      desc.setAttribute(
        'content',
        "See what's actually happening in every deal — not what your reps say is happening. Klosure is an AI deal coach for B2B sales teams in IT services, professional services, and high-value B2B."
      )
    }
    return () => {
      document.title = prevTitle
      if (desc && prevDesc != null) desc.setAttribute('content', prevDesc)
    }
  }, [])

  return (
    <div className="min-h-screen bg-navy text-white font-sans">
      <NavBar />
      <main>
        <Hero />
        <Problem />
        <HowItSolves />
        <WhoItsFor />
        <Pricing />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}

function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-navy/85 backdrop-blur supports-[backdrop-filter]:bg-navy/70">
      <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl tracking-tight">
          klosure<span className="text-klo">.ai</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4 text-sm">
          <Link to="/login" className="px-3 sm:px-4 py-2 text-white/80 hover:text-white">
            Log in
          </Link>
          <a
            href="#contact"
            onClick={(e) => handleAnchorClick(e, 'contact')}
            className="px-4 py-2 rounded-full bg-klo hover:bg-klo/90 font-medium"
          >
            Book a demo
          </a>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-5 pt-16 sm:pt-24 pb-20 sm:pb-28">
        <p className="text-klo text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase mb-5">
          Get closure on every deal.
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold leading-[1.05] tracking-tight max-w-4xl">
          See what's actually happening in every deal —{' '}
          <span className="text-white/70">not what your reps say is happening.</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-white/70 leading-relaxed max-w-3xl">
          Klosure is an AI deal coach that lives inside every deal. It tracks what's actually
          happening — commitments, blockers, stakeholder shifts — and gives sales managers the
          truth their CRM can't.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <a
            href="#contact"
            onClick={(e) => handleAnchorClick(e, 'contact')}
            className="px-6 py-3 rounded-full bg-klo hover:bg-klo/90 font-semibold text-center"
          >
            Book a 30-min demo
          </a>
          <a
            href="#how"
            onClick={(e) => handleAnchorClick(e, 'how')}
            className="px-6 py-3 rounded-full border border-white/20 hover:border-white/40 font-medium text-center"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <section className="py-16 sm:py-24 border-y border-klo/15">
      <div className="max-w-[700px] mx-auto px-5 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Your pipeline is a guess.
        </h2>
        <p className="mt-6 text-lg sm:text-xl text-white/70 leading-relaxed">
          Your reps' deal updates are optimistic. Your forecast is built on those updates. By the
          time you find out a deal is dead, it's already been dead for weeks — and you're
          explaining the gap to your CEO.
        </p>
      </div>
    </section>
  )
}

function HowItSolves() {
  return (
    <section id="how" className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Klosure gives you deal reality.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-white/65">
            Three things every B2B sales team needs but no CRM provides.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={<IconCoach />}
            title="Klo coaches every deal"
            body={
              <>An AI deal coach in every room. It listens to your reps, asks the hard questions
              they avoid, and surfaces the truth — "Has the buyer named who signs? Why hasn't the
              CFO joined the call yet?"</>
            }
          />
          <FeatureCard
            icon={<IconTrendingUp />}
            title="Pipeline that doesn't lie"
            body={
              <>Confidence scores based on actual deal signals — not rep optimism. See which deals
              are real, which are wishful thinking, and which are dying. In real time, on one
              dashboard.</>
            }
          />
          <FeatureCard
            icon={<IconUsers />}
            title="Buyers in the room"
            body={
              <>Optionally share a buyer link. The buyer sees what's pending on their side. Klo
              coaches them too. Deals stop dying in email silence between sides.</>
            }
          />
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ icon, title, body }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 flex flex-col h-full">
      <div className="h-10 w-10 rounded-lg bg-klo/15 text-klo flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-3 text-sm sm:text-[15px] text-white/70 leading-relaxed">{body}</p>
    </div>
  )
}

function WhoItsFor() {
  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-[700px] mx-auto px-5 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Built for B2B sales teams that close real deals.
        </h2>
        <p className="mt-6 text-lg text-white/70 leading-relaxed">
          Klosure is built for IT services, professional services, and high-value B2B sales teams
          with deal sizes of ₹8L+ and sales cycles of 30+ days. If your team's pipeline review is
          more guesswork than reporting, Klosure is for you.
        </p>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-5xl mx-auto px-5">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Simple pricing. Real value.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-white/65">
            14-day pilot, no credit card. Launch pricing ends {LAUNCH_OFFER_END}.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <PricingCard
            tag="For individual sellers"
            name="Pro"
            price="₹2,499"
            priceSuffix="/user/month"
            originalPrice="₹4,999/user/month"
            offer="Launch offer — 50% off for 12 months"
            features={[
              'Klo coaching on every deal',
              'Living deal record + confidence scoring',
              'Buyer view (optional shared mode)',
              'Unlimited deals',
              'Email + chat support',
            ]}
            ctaLabel="Book a demo"
            ctaVariant="outline"
          />
          <PricingCard
            tag="For sales teams up to 5 users"
            name="Team"
            price="₹9,999"
            priceSuffix="/month"
            originalPrice="₹19,999/month"
            offer="Launch offer — 50% off for 12 months"
            features={[
              'Everything in Pro',
              'Manager dashboard — see all team deals',
              'Manager talks to Klo — ask "which deals are at risk this week?"',
              'Real-time pipeline truth, not rep reports',
              'Priority support + onboarding call',
            ]}
            ctaLabel="Book a demo"
            ctaVariant="primary"
            highlighted
            badge="Most popular"
          />
        </div>

        <p className="mt-8 text-center text-sm text-white/55">
          Need more than 5 users? Custom pricing for larger teams. Talk to us.
        </p>
      </div>
    </section>
  )
}

function PricingCard({
  tag,
  name,
  price,
  priceSuffix,
  originalPrice,
  offer,
  features,
  ctaLabel,
  ctaVariant,
  highlighted,
  badge,
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 sm:p-8 flex flex-col h-full ${
        highlighted
          ? 'bg-klo/[0.06] border-2 border-klo/60'
          : 'bg-white/[0.04] border border-white/10'
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-klo text-white text-xs font-semibold tracking-wide">
          {badge}
        </span>
      )}
      <p className="text-xs uppercase tracking-[0.15em] text-white/55 font-medium">{tag}</p>
      <h3 className="mt-2 text-2xl font-bold">{name}</h3>

      <div className="mt-5">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl sm:text-5xl font-bold tracking-tight">{price}</span>
          <span className="text-sm text-white/60">{priceSuffix}</span>
        </div>
        <p className="mt-2 text-sm text-white/50">
          <span className="line-through">{originalPrice}</span>{' '}
          <span className="text-klo">· {offer}</span>
        </p>
      </div>

      <ul className="mt-6 space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex gap-3 text-sm sm:text-[15px] text-white/80">
            <IconCheck className="mt-0.5 h-4 w-4 text-klo flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <a
        href="#contact"
        onClick={(e) => handleAnchorClick(e, 'contact')}
        className={`mt-8 block text-center px-6 py-3 rounded-full font-semibold ${
          ctaVariant === 'primary'
            ? 'bg-klo hover:bg-klo/90 text-white'
            : 'border border-white/25 hover:border-white/50 text-white'
        }`}
      >
        {ctaLabel}
      </a>
    </div>
  )
}

function Contact() {
  return (
    <section id="contact" className="py-20 sm:py-28 border-t border-white/5">
      <div className="max-w-3xl mx-auto px-5 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
          See Klosure on a real deal.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed">
          30-minute call. We'll walk you through Klo on a live example, talk through your team's
          setup, and answer anything. No slides, no pressure.
        </p>

        <div className="mt-10 max-w-lg mx-auto rounded-2xl bg-white/[0.04] border border-white/10 p-6 sm:p-8 text-left">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-klo/15 text-klo flex items-center justify-center flex-shrink-0">
              <IconPhone />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.15em] text-white/55 font-medium">
                Call or WhatsApp
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="text-lg font-semibold text-white hover:text-klo"
                >
                  {PHONE_DISPLAY}
                </a>
                <a
                  href={PHONE_WA}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-klo hover:underline"
                >
                  WhatsApp →
                </a>
              </div>
            </div>
          </div>

          <div className="my-6 h-px bg-white/10" />

          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-klo/15 text-klo flex items-center justify-center flex-shrink-0">
              <IconMail />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.15em] text-white/55 font-medium">
                Email
              </p>
              <a
                href={`mailto:${EMAIL}`}
                className="mt-1 block text-lg font-semibold text-white hover:text-klo break-all"
              >
                {EMAIL}
              </a>
            </div>
          </div>
        </div>

        <p className="mt-8 italic text-white/55 text-sm sm:text-base">
          — Rajeshwar, Founder. 13 years in B2B sales. Built Klosure because I lived this problem.
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#14142a]">
      <div className="max-w-6xl mx-auto px-5 py-12 grid gap-10 md:grid-cols-3 text-sm">
        <div>
          <Link to="/" className="font-bold text-lg tracking-tight">
            klosure<span className="text-klo">.ai</span>
          </Link>
          <p className="mt-3 text-white/70">Get closure on every deal.</p>
          <p className="mt-2 text-white/45 text-xs leading-relaxed">
            Your deal data is never used to train any AI model.
          </p>
        </div>

        <div className="space-y-2 md:justify-self-center">
          <Link to="/privacy" className="block text-white/70 hover:text-white">
            Privacy policy
          </Link>
          <Link to="/terms" className="block text-white/70 hover:text-white">
            Terms of service
          </Link>
          <Link to="/refund" className="block text-white/70 hover:text-white">
            Refund policy
          </Link>
        </div>

        <div className="space-y-2 md:justify-self-end text-white/70">
          <p>
            Contact:{' '}
            <a href={`mailto:${EMAIL}`} className="hover:text-white">
              {EMAIL}
            </a>
          </p>
          <p>
            Phone:{' '}
            <a href={`tel:${PHONE_TEL}`} className="hover:text-white">
              {PHONE_DISPLAY}
            </a>
          </p>
          <p>Hyderabad, India</p>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-5 text-xs text-white/45">
          © 2026 Klosure.ai. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

/* -------------------------------- Icons -------------------------------- */

function IconCoach() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
      <path d="M19 14l.8 2.4L22 17l-2.2.6L19 20l-.8-2.4L16 17l2.2-.6L19 14z" />
    </svg>
  )
}

function IconTrendingUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  )
}

function IconCheck({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
