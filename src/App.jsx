import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import LandingPage from './pages/LandingPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import DealsListPage from './pages/DealsListPage.jsx'
import NewDealPage from './pages/NewDealPage.jsx'
import DealRoomPage from './pages/DealRoomPage.jsx'
import BuyerJoinPage from './pages/BuyerJoinPage.jsx'

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
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<RedirectIfAuthed><AuthPage mode="login" /></RedirectIfAuthed>} />
      <Route path="/signup" element={<RedirectIfAuthed><AuthPage mode="signup" /></RedirectIfAuthed>} />
      <Route path="/deals" element={<RequireAuth><DealsListPage /></RequireAuth>} />
      <Route path="/deals/new" element={<RequireAuth><NewDealPage /></RequireAuth>} />
      <Route path="/deals/:id" element={<RequireAuth><DealRoomPage /></RequireAuth>} />
      <Route path="/join/:token" element={<BuyerJoinPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
