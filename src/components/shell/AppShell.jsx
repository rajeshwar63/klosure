// Phase 6 — app shell. Wraps every authenticated page with the sidebar on the
// left and content on the right. On screens < 768px the sidebar disappears
// from the grid entirely; the hamburger top bar opens it as a slide-over.
//
// The shell is unopinionated about page chrome — pages render their own
// headers (the deal page has the dark deal bar; home pages have a lighter
// "Good morning" header). The shell is just the frame.
//
// Phase 14 — the sidebar is drag-resizable. The user can drag the divider
// between the sidebar and the main pane to set their preferred width; the
// width persists across sessions in localStorage. Collapse still works as a
// shortcut to/from the thin 52px strip.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import MobileTopBar from './MobileTopBar.jsx'
import MobileDrawer from './MobileDrawer.jsx'
import ReadOnlyBanner from '../billing/ReadOnlyBanner.jsx'

const STORAGE_KEY_COLLAPSED = 'klosure:sidebarCollapsed'
const STORAGE_KEY_WIDTH = 'klosure:sidebarWidth'
const SIDEBAR_DEFAULT_WIDTH = 260
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_COLLAPSED_WIDTH = 52

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

function loadWidth() {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_WIDTH)
    if (!raw) return SIDEBAR_DEFAULT_WIDTH
    const parsed = parseInt(raw, 10)
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_WIDTH
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed))
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

function saveWidth(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY_WIDTH, String(value))
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
  onLogout,
  onProfileClick,
  children,
}) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [width, setWidth] = useState(loadWidth)
  const [dragging, setDragging] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const dragStateRef = useRef(null)

  function handleNavigate(view) {
    setMobileOpen(false)
    if (!view) return
    if (view.startsWith('deal:')) {
      navigate(`/deals/${view.slice('deal:'.length)}`)
      return
    }
    if (view === 'today') {
      navigate('/today')
      return
    }
    if (view === 'deals') {
      navigate('/deals')
      return
    }
    if (view === 'me-askklo') {
      navigate('/askklo')
      return
    }
    if (view === 'this-week') {
      navigate('/team')
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
    if (view === 'team-deals') {
      navigate('/team/deals')
      return
    }
    if (view === 'askklo') {
      navigate('/team/askklo')
      return
    }
    if (view === 'train-klo') {
      navigate('/settings/train-klo')
      return
    }
    if (view === 'settings') {
      // /settings index redirects to /settings/profile.
      navigate('/settings')
      return
    }
    if (view === 'billing') {
      // Keep the legacy /billing top-level URL for now; it lives inside the
      // Settings layout via the same BillingPage component at
      // /settings/billing too.
      navigate('/billing')
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

  // Pointer events handle mouse, pen, and touch with the same callbacks. The
  // listeners attach to window during a drag so the cursor can leave the
  // 6px-wide handle without interrupting the drag.
  const handleResizeStart = useCallback((e) => {
    if (collapsed) return
    e.preventDefault()
    dragStateRef.current = {
      startX: e.clientX,
      startWidth: width,
    }
    setDragging(true)
  }, [collapsed, width])

  useEffect(() => {
    if (!dragging) return
    function onMove(e) {
      const state = dragStateRef.current
      if (!state) return
      const delta = e.clientX - state.startX
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, state.startWidth + delta),
      )
      setWidth(next)
    }
    function onEnd() {
      setDragging(false)
      dragStateRef.current = null
      // Persist after the drag finishes so we don't pummel localStorage on
      // every pointermove tick.
      // The setter in onMove already updated React state; capture the latest
      // by reading it at the next animation frame.
      requestAnimationFrame(() => {
        // Read directly from state via setter form to avoid stale closure.
        setWidth((w) => {
          saveWidth(w)
          return w
        })
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    // While dragging, prevent text selection on the rest of the page.
    const prevUserSelect = document.body.style.userSelect
    const prevCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor = prevCursor
    }
  }, [dragging])

  // Keyboard support — left/right arrows nudge the width when the resize
  // handle is focused. Aligns with WAI-ARIA separator pattern.
  function handleResizeKeyDown(e) {
    if (collapsed) return
    let next = width
    if (e.key === 'ArrowLeft') next = width - 16
    else if (e.key === 'ArrowRight') next = width + 16
    else if (e.key === 'Home') next = SIDEBAR_MIN_WIDTH
    else if (e.key === 'End') next = SIDEBAR_MAX_WIDTH
    else return
    e.preventDefault()
    next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next))
    setWidth(next)
    saveWidth(next)
  }

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar — hidden on mobile; width driven by inline style so
          the drag updates instantly without a Tailwind class swap. */}
      <div
        className="hidden md:block min-h-0 overflow-hidden relative shrink-0"
        style={{ width: `${sidebarWidth}px` }}
      >
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
          onLogout={onLogout}
          onProfileClick={onProfileClick}
        />
        {/* Drag handle. Sits flush against the right edge of the sidebar
            and bleeds 3px into the main pane so it has a real hit area
            without a visible bump. The visual indicator only appears on
            hover/active so the chrome stays calm. */}
        {!collapsed && (
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={width}
            onPointerDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
            className="absolute top-0 right-0 h-full w-1.5 -mr-[3px] cursor-col-resize z-10 group"
            style={{ touchAction: 'none' }}
          >
            <div
              className={`absolute top-0 left-1/2 -translate-x-1/2 h-full w-px transition-colors ${
                dragging
                  ? 'bg-klo'
                  : 'bg-transparent group-hover:bg-klo/40 group-focus:bg-klo/60'
              }`}
            />
          </div>
        )}
      </div>

      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#f5f6f8]">
        <ReadOnlyBanner />
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
          onLogout={onLogout}
          onProfileClick={onProfileClick}
        />
      </MobileDrawer>
    </div>
  )
}
