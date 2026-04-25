import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import LandingPage from './pages/LandingPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import DealsListPage from './pages/DealsListPage.jsx'
import BuyerJoinPage from './pages/BuyerJoinPage.jsx'

// Lazy-load the heavier flows so the dashboard ships in a smaller initial
// bundle — important on slow Gulf 4G (Phase 4 §10 deliverable).
const NewDealPage = lazy(() => import('./pages/NewDealPage.jsx'))
const DealRoomPage = lazy(() => import('./pages/DealRoomPage.jsx'))
const TeamPage = lazy(() => import('./pages/TeamPage.jsx'))
const BillingPage = lazy(() => import('./pages/BillingPage.jsx'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'))

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (user) return <Navigate to="/deals" replace />
  return children
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center text-navy/60 text-sm">
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<RedirectIfAuthed><AuthPage mode="login" /></RedirectIfAuthed>} />
        <Route path="/signup" element={<RedirectIfAuthed><AuthPage mode="signup" /></RedirectIfAuthed>} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/deals" element={<RequireAuth><DealsListPage /></RequireAuth>} />
        <Route path="/deals/new" element={<RequireAuth><NewDealPage /></RequireAuth>} />
        <Route path="/deals/:id" element={<RequireAuth><DealRoomPage /></RequireAuth>} />
        <Route path="/team" element={<RequireAuth><TeamPage /></RequireAuth>} />
        <Route path="/billing" element={<RequireAuth><BillingPage /></RequireAuth>} />
        <Route path="/join/:token" element={<BuyerJoinPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
