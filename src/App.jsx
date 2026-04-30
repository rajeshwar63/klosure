import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import { useProfile } from './hooks/useProfile.jsx'
import LandingPage from './pages/LandingPage.jsx'
import ComingSoonPage from './pages/ComingSoonPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import DealsListPage from './pages/DealsListPage.jsx'
import BuyerJoinPage from './pages/BuyerJoinPage.jsx'
import SellerHomePage from './pages/SellerHomePage.jsx'
import ManagerHomePage from './pages/ManagerHomePage.jsx'
import RepsPlaceholderPage from './pages/RepsPlaceholderPage.jsx'
import TeamDealsPage from './pages/TeamDealsPage.jsx'
import ShellWrapper from './components/shell/ShellWrapper.jsx'

// Lazy-load the heavier flows so the dashboard ships in a smaller initial
// bundle — important on slow Gulf 4G (Phase 4 §10 deliverable).
const NewDealPage = lazy(() => import('./pages/NewDealPage.jsx'))
const DealRoomPage = lazy(() => import('./pages/DealRoomPage.jsx'))
const BillingPage = lazy(() => import('./pages/BillingPage.jsx'))
const BillingReturnPage = lazy(() => import('./pages/BillingReturnPage.jsx'))
const BillingManagePage = lazy(() => import('./pages/BillingManagePage.jsx'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'))
const ForecastPage = lazy(() => import('./pages/ForecastPage.jsx'))
const AskKloPage = lazy(() => import('./pages/AskKloPage.jsx'))
const TrainKloPage = lazy(() => import('./pages/TrainKloPage.jsx'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage.jsx'))
const JoinTeamPage = lazy(() => import('./pages/JoinTeamPage.jsx'))

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
          <Route path="/deals/:id" element={<DealRoomPage />} />
          <Route path="/team" element={<ManagerHomePage />} />
          <Route path="/team/forecast" element={<ForecastPage />} />
          <Route path="/team/reps" element={<RepsPlaceholderPage />} />
          <Route path="/team/deals" element={<TeamDealsPage />} />
          <Route path="/team/askklo" element={<AskKloPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/billing/manage" element={<BillingManagePage />} />
          <Route path="/settings/train-klo" element={<TrainKloPage />} />
          <Route path="/settings/password" element={<ChangePasswordPage />} />
        </Route>

        {/* Razorpay return — full-screen confirming-payment page outside the shell. */}
        <Route
          path="/billing/return"
          element={<RequireAuth><BillingReturnPage /></RequireAuth>}
        />

        {/* Marketing-only placeholder routes referenced from the homepage footer. */}
        <Route path="/privacy" element={<ComingSoonPage title="Privacy policy" />} />
        <Route path="/terms" element={<ComingSoonPage title="Terms of service" />} />
        <Route path="/refund" element={<ComingSoonPage title="Refund policy" />} />

        {/* Buyer flow stays outside the shell. */}
        <Route path="/join/:token" element={<BuyerJoinPage />} />
        <Route path="/join-team/:token" element={<JoinTeamPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
