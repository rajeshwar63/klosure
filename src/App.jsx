import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import { useProfile } from './hooks/useProfile.jsx'
import LandingPage from './pages/LandingPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import DealsListPage from './pages/DealsListPage.jsx'
import BuyerJoinPage from './pages/BuyerJoinPage.jsx'
import SellerHomePage from './pages/SellerHomePage.jsx'
import ManagerHomePage from './pages/ManagerHomePage.jsx'
import RepsPlaceholderPage from './pages/RepsPlaceholderPage.jsx'
import ShellWrapper from './components/shell/ShellWrapper.jsx'

// Lazy-load the heavier flows so the dashboard ships in a smaller initial
// bundle — important on slow Gulf 4G (Phase 4 §10 deliverable).
const NewDealPage = lazy(() => import('./pages/NewDealPage.jsx'))
const DealroomPage = lazy(() => import('./components/deal/v2/DealroomPage.jsx'))
const BillingPage = lazy(() => import('./pages/BillingPage.jsx'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'))
const ForecastPage = lazy(() => import('./pages/ForecastPage.jsx'))
const AskKloPage = lazy(() => import('./pages/AskKloPage.jsx'))

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (user) return <Navigate to="/today" replace />
  return children
}

// Phase 6 — root redirect: managers land on /team, sellers on /today.
function RoleHomeRedirect() {
  const { user, loading: authLoading } = useAuth()
  const { isManager, loading: profileLoading } = useProfile()
  if (authLoading || profileLoading) return <FullPageSpinner />
  if (!user) return <LandingPage />
  return <Navigate to={isManager ? '/team' : '/today'} replace />
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
        <Route path="/" element={<RoleHomeRedirect />} />
        <Route path="/login" element={<RedirectIfAuthed><AuthPage mode="login" /></RedirectIfAuthed>} />
        <Route path="/signup" element={<RedirectIfAuthed><AuthPage mode="signup" /></RedirectIfAuthed>} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />

        {/* Phase 6 — every authenticated app page lives inside the AppShell. */}
        <Route element={<RequireAuth><ShellWrapper /></RequireAuth>}>
          <Route path="/today" element={<SellerHomePage />} />
          <Route path="/deals" element={<DealsListPage />} />
          <Route path="/deals/new" element={<NewDealPage />} />
          <Route path="/deals/:id" element={<DealroomPage />} />
          <Route path="/team" element={<ManagerHomePage />} />
          <Route path="/team/forecast" element={<ForecastPage />} />
          <Route path="/team/reps" element={<RepsPlaceholderPage />} />
          <Route path="/team/askklo" element={<AskKloPage />} />
          <Route path="/billing" element={<BillingPage />} />
        </Route>

        {/* Buyer flow stays outside the shell. */}
        <Route path="/join/:token" element={<BuyerJoinPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
