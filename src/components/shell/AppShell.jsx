// Phase 6 — app shell. Wraps every authenticated page with the sidebar on the
// left and content on the right. On screens < 768px the sidebar disappears
// from the grid entirely; the hamburger top bar opens it as a slide-over.
//
// The shell is unopinionated about page chrome — pages render their own
// headers (the deal page has the dark deal bar; home pages have a lighter
// "Good morning" header). The shell is just the frame.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import MobileTopBar from './MobileTopBar.jsx'
import MobileDrawer from './MobileDrawer.jsx'

const STORAGE_KEY_COLLAPSED = 'klosure:sidebarCollapsed'

function loadCollapsed() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1'
  } catch {
    return false
  }
}

function saveCollapsed(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY_COLLAPSED, value ? '1' : '0')
  } catch {
    // localStorage can throw in private mode; ignore
  }
}

export default function AppShell({
  role = 'seller',
  activeView,
  pageTitle,
  deals = [],
  dealsLoading = false,
  user,
  children,
}) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleNavigate(view) {
    setMobileOpen(false)
    if (!view) return
    if (view.startsWith('deal:')) {
      navigate(`/deals/${view.slice('deal:'.length)}`)
      return
    }
    if (view === 'today') {
      navigate(role === 'manager' ? '/team' : '/today')
      return
    }
    if (view === 'deals') {
      navigate('/deals')
      return
    }
    if (view === 'forecast') {
      navigate('/team/forecast')
      return
    }
    if (view === 'reps') {
      navigate('/team/reps')
      return
    }
    if (view === 'askklo') {
      navigate('/team/askklo')
      return
    }
    if (view === 'team') {
      navigate('/team')
      return
    }
    if (view === 'train-klo') {
      navigate('/settings/train-klo')
      return
    }
  }

  function handleNewDeal() {
    setMobileOpen(false)
    navigate('/deals/new')
  }

  function handleCollapseToggle() {
    setCollapsed((c) => {
      const next = !c
      saveCollapsed(next)
      return next
    })
  }

  const sidebarColsClass = collapsed
    ? 'lg:grid-cols-[52px_1fr] md:grid-cols-[52px_1fr]'
    : 'lg:grid-cols-[260px_1fr] md:grid-cols-[200px_1fr]'

  return (
    <div className={`grid h-dvh overflow-hidden grid-cols-1 ${sidebarColsClass}`}>
      <div className="hidden md:block min-h-0 overflow-hidden">
        <Sidebar
          role={role}
          activeView={activeView}
          deals={deals}
          loading={dealsLoading}
          user={user}
          collapsed={collapsed}
          onCollapseToggle={handleCollapseToggle}
          onNavigate={handleNavigate}
          onNewDeal={handleNewDeal}
        />
      </div>

      <main className="flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#f5f6f8]">
        <MobileTopBar
          pageTitle={pageTitle}
          onMenuOpen={() => setMobileOpen(true)}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </main>

      <MobileDrawer isOpen={mobileOpen} onClose={() => setMobileOpen(false)}>
        <Sidebar
          role={role}
          activeView={activeView}
          deals={deals}
          loading={dealsLoading}
          user={user}
          onNavigate={handleNavigate}
          onNewDeal={handleNewDeal}
        />
      </MobileDrawer>
    </div>
  )
}
