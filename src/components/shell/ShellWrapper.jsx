// Phase 6 — thin wrapper that resolves activeView + pageTitle from the URL
// and feeds them into the shell. Used as a layout route so every page below
// renders inside the same shell.

import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.jsx'
import { useShellDeals } from '../../hooks/useShellDeals.jsx'
import AppShell from './AppShell.jsx'

export function resolveActiveView(pathname, role) {
  if (pathname === '/today') return 'today'
  if (pathname === '/deals') return 'deals'
  if (pathname.startsWith('/deals/')) {
    const id = pathname.split('/')[2]
    if (id && id !== 'new') return `deal:${id}`
  }
  if (pathname === '/team') return role === 'manager' ? 'today' : 'team'
  if (pathname === '/team/forecast') return 'forecast'
  if (pathname === '/team/reps') return 'reps'
  if (pathname === '/team/askklo') return 'askklo'
  if (pathname === '/settings/train-klo') return 'train-klo'
  return null
}

export function resolvePageTitle(pathname, deals) {
  if (pathname === '/today') return 'Today'
  if (pathname === '/deals') return 'Deals'
  if (pathname === '/deals/new') return 'New deal'
  if (pathname.startsWith('/deals/')) {
    const id = pathname.split('/')[2]
    const deal = (deals || []).find((d) => d.id === id)
    return deal?.title ?? 'Deal'
  }
  if (pathname === '/team') return 'This week'
  if (pathname === '/team/forecast') return 'Forecast'
  if (pathname === '/team/reps') return 'Reps'
  if (pathname === '/team/askklo') return 'Ask Klo'
  if (pathname === '/billing') return 'Billing'
  return 'Klosure'
}

export default function ShellWrapper() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { profile, isManager } = useProfile()
  const { deals, loading: dealsLoading } = useShellDeals()

  const role = location.pathname.startsWith('/team') && isManager ? 'manager' : 'seller'
  const activeView = resolveActiveView(location.pathname, role)
  const pageTitle = resolvePageTitle(location.pathname, deals)

  const userForShell = {
    name: profile?.name || user?.email?.split('@')[0] || 'You',
    email: user?.email,
  }

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <AppShell
      role={role}
      activeView={activeView}
      pageTitle={pageTitle}
      deals={deals}
      dealsLoading={dealsLoading}
      user={userForShell}
      onLogout={handleLogout}
    >
      <Outlet />
    </AppShell>
  )
}
