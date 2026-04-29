import { Link } from 'react-router-dom'

export default function ComingSoonPage({ title }) {
  return (
    <div className="min-h-screen bg-navy text-white font-sans flex flex-col">
      <header className="px-5 py-4 border-b border-white/5">
        <div className="max-w-6xl mx-auto">
          <Link to="/" className="font-bold text-xl tracking-tight">
            klosure<span className="text-klo">.ai</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-5">
        <div className="text-center max-w-md">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-4 text-white/65">
            Coming soon. In the meantime, reach out at{' '}
            <a href="mailto:raja@klosure.ai" className="text-klo hover:underline">
              raja@klosure.ai
            </a>
            .
          </p>
          <Link
            to="/"
            className="mt-8 inline-block px-5 py-2.5 rounded-full border border-white/20 hover:border-white/40 text-sm font-medium"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}
