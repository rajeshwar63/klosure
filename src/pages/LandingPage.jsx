import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy to-[#0f0f1f] text-white">
      <header className="px-5 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <Link to="/" className="font-bold text-xl tracking-tight">
          klosure<span className="text-klo">.ai</span>
        </Link>
        <nav className="text-sm">
          {user ? (
            <Link to="/deals" className="px-4 py-2 rounded-full bg-klo hover:bg-klo/90 font-medium">
              Open app
            </Link>
          ) : (
            <>
              <Link to="/login" className="px-4 py-2 text-white/80 hover:text-white">
                Log in
              </Link>
              <Link to="/signup" className="px-4 py-2 rounded-full bg-klo hover:bg-klo/90 font-medium">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-5 pt-12 pb-20 sm:pt-20">
        <p className="text-klo text-sm font-medium tracking-wide uppercase mb-4">
          Get closure on every deal.
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight">
          The first deal room with both sides in it.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-white/70 leading-relaxed">
          Klosure is an AI-powered deal room. Your sales manager finally sees what's actually
          happening in every deal — not what the sales guy thinks is happening.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link
            to={user ? '/deals' : '/signup'}
            className="px-6 py-3 rounded-full bg-klo hover:bg-klo/90 font-semibold text-center"
          >
            {user ? 'Open your deals' : 'Start free — solo mode'}
          </Link>
          <a
            href="#how"
            className="px-6 py-3 rounded-full border border-white/20 hover:border-white/40 font-medium text-center"
          >
            How it works
          </a>
        </div>

        <section id="how" className="mt-20 grid gap-8 sm:grid-cols-3">
          <Feature
            title="Solo mode"
            body="Create a deal room and start talking to Klo. Your private deal coach — no buyer needed."
          />
          <Feature
            title="Shared mode"
            body="Send the buyer a link. They open it on their phone. No signup. No app. Just the deal."
          />
          <Feature
            title="Klo coaches both sides"
            body="Direct, brief, role-aware. The deal can't go silent because Klo won't let it."
          />
        </section>
      </main>

      <footer className="border-t border-white/10 text-white/50 text-sm">
        <div className="max-w-5xl mx-auto px-5 py-6 flex flex-col sm:flex-row justify-between gap-2">
          <span>© Klosure.ai — Get closure on every deal.</span>
          <span>Your deal data is never used to train any AI model.</span>
        </div>
      </footer>
    </div>
  )
}

function Feature({ title, body }) {
  return (
    <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-sm text-white/70 mt-2 leading-relaxed">{body}</p>
    </div>
  )
}
