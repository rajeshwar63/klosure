// Phase 6 — thin wrapper that resolves activeView + pageTitle from the URL
// and feeds them into the shell. Used as a layout route so every page below
// renders inside the same shell.

import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.jsx'
import { useShellDeals } from '../../hooks/useShellDeals.jsx'
import AppShell from './AppShell.jsx'
import AppPromptModal from '../ui/AppPromptModal.jsx'
import LogoutChoiceModal from '../ui/LogoutChoiceModal.jsx'
import ProfileModal from '../ui/ProfileModal.jsx'

export function resolveActiveView(pathname) {
  if (pathname === '/today') return 'today'
  if (pathname === '/deals') return 'deals'
  if (pathname.startsWith('/deals/')) {
    const id = pathname.split('/')[2]
    if (id && id !== 'new') return `deal:${id}`
  }
  if (pathname === '/team') return 'this-week'
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
  const [logoutChoiceOpen, setLogoutChoiceOpen] = useState(false)
  const [allDevicesConfirmOpen, setAllDevicesConfirmOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const role = isManager ? 'manager' : 'seller'
  const activeView = resolveActiveView(location.pathname)
  const pageTitle = resolvePageTitle(location.pathname, deals)

  useEffect(() => {
    const tagline = 'Klosure — Stop guessing. Start closing.'
    document.title = pageTitle && pageTitle !== 'Klosure' ? `${pageTitle} · ${tagline}` : tagline
  }, [pageTitle])

  const userForShell = {
    name: profile?.name || user?.email?.split('@')[0] || 'You',
    email: user?.email,
  }

  async function runLogout({ allDevices = false } = {}) {
    setLogoutBusy(true)
    try {
      await signOut({ allDevices })
      setLogoutChoiceOpen(false)
      setAllDevicesConfirmOpen(false)
      navigate('/login', { replace: true, state: null })
    } finally {
      setLogoutBusy(false)
    }
  }

  function handleOpenLogoutChoice() {
    setLogoutChoiceOpen(true)
  }

  function handleRequestLogoutAllDevices() {
    setLogoutChoiceOpen(false)
    setAllDevicesConfirmOpen(true)
  }

  return (
    <AppShell
      role={role}
      activeView={activeView}
      pageTitle={pageTitle}
      deals={deals}
      dealsLoading={dealsLoading}
      user={userForShell}
      onLogout={handleOpenLogoutChoice}
      onProfileClick={() => setProfileOpen(true)}
    >
      <Outlet />
      <LogoutChoiceModal
        open={logoutChoiceOpen}
        canLogoutAllDevices
        busy={logoutBusy}
        onLogoutThisDevice={() => runLogout({ allDevices: false })}
        onLogoutAllDevices={handleRequestLogoutAllDevices}
        onCancel={() => setLogoutChoiceOpen(false)}
      />
      <AppPromptModal
        open={allDevicesConfirmOpen}
        tone="danger"
        title="Log out of all devices?"
        message="This signs you out everywhere this account is currently active. You will need to log in again on each device."
        confirmLabel="Log out of all devices"
        cancelLabel="Cancel"
        onConfirm={() => runLogout({ allDevices: true })}
        onCancel={() => setAllDevicesConfirmOpen(false)}
        busy={logoutBusy}
      />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </AppShell>
  )
}
