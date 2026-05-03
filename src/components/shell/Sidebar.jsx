// Phase 6 — app shell sidebar.
//
// Used identically by seller home, deal page, and manager home — same
// component, different content. 260px wide on desktop; collapses to a thin
// ~52px strip showing only the deal-health dots.
//
// Sort order: confidence ASCENDING (worst first). Inverted from the dashboard
// because the sidebar is a "what needs my attention" surface — the deals that
// need work float to the top.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SidebarNavItem from './SidebarNavItem.jsx'
import SidebarDealRow from './SidebarDealRow.jsx'
import TeamContextBadge from './TeamContextBadge.jsx'
import TrialCountdownBadge from '../billing/TrialCountdownBadge.jsx'

const REP_NAV = [
  { id: 'today', icon: '◆', label: 'Today' },
  { id: 'deals', icon: '≡', label: 'Deals' },
]

const MANAGER_NAV = [
  { id: 'this-week', icon: '◆', label: 'This week' },
  { id: 'forecast', icon: '↗', label: 'Forecast' },
  { id: 'reps', icon: '◎', label: 'Reps' },
  { id: 'team-deals', icon: '◫', label: 'Team Deals' },
  { id: 'askklo', icon: '✦', label: 'Ask Klo' },
]

const STORAGE_KEY_MANAGER_SECTION = 'klosure:sidebarManagerOpen'

function loadManagerSectionOpen() {
  if (typeof window === 'undefined') return true
  try {
    const v = window.localStorage.getItem(STORAGE_KEY_MANAGER_SECTION)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

function saveManagerSectionOpen(open) {
  try {
    window.localStorage.setItem(STORAGE_KEY_MANAGER_SECTION, open ? '1' : '0')
  } catch {
    // localStorage can throw in private mode; ignore
  }
}

function sortDealsForSidebar(deals) {
  return [...(deals || [])].sort((a, b) => {
    const ac = a?.klo_state?.confidence?.value
    const bc = b?.klo_state?.confidence?.value
    // Nulls sort to the bottom.
    if (ac == null && bc == null) {
      const at = new Date(a?.updated_at || a?.created_at || 0)
      const bt = new Date(b?.updated_at || b?.created_at || 0)
      return bt - at
    }
    if (ac == null) return 1
    if (bc == null) return -1
    if (ac !== bc) return ac - bc // ascending: worst first
    const at = new Date(a?.updated_at || a?.created_at || 0)
    const bt = new Date(b?.updated_at || b?.created_at || 0)
    return bt - at
  })
}

function userInitials(user) {
  const name = user?.name || user?.email || ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function activeDealId(activeView) {
  if (typeof activeView !== 'string') return null
  if (!activeView.startsWith('deal:')) return null
  return activeView.slice('deal:'.length)
}

function DealRowSkeleton() {
  return (
    <div className="px-2 py-1.5 flex items-center gap-2 animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-navy/15 shrink-0" />
      <span className="flex-1 h-3 bg-navy/10 rounded" />
      <span className="w-5 h-3 bg-navy/10 rounded" />
    </div>
  )
}

export default function Sidebar({
  role = 'seller',
  activeView = 'today',
  deals = [],
  loading = false,
  user,
  onNavigate,
  onNewDeal,
  onLogout,
  onProfileClick,
  collapsed = false,
  onCollapseToggle,
}) {
  const [query, setQuery] = useState('')
  const [managerOpen, setManagerOpen] = useState(loadManagerSectionOpen)
  const sorted = sortDealsForSidebar(deals)

  function toggleManagerSection() {
    setManagerOpen((open) => {
      const next = !open
      saveManagerSectionOpen(next)
      return next
    })
  }
  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((deal) => {
      const haystack = [
        deal?.title,
        deal?.buyer_company,
        deal?.seller_company,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [query, sorted])
  const currentDealId = activeDealId(activeView)
  const handle = (view) => () => onNavigate?.(view)

  // The shell sets the wrapper width via inline style (so the drag-resize
  // handle can update it live). We just fill 100% of whatever the parent
  // gives us — no responsibility for the width number lives here.
  return (
    <aside
      className="w-full h-full bg-[#fafafa] border-r border-navy/10 flex flex-col"
    >
      {/* Header — logo + collapse toggle */}
      <div
        className={`flex items-center ${
          collapsed ? 'justify-center' : 'justify-between'
        } px-3 h-12 border-b border-navy/5 shrink-0`}
      >
        {!collapsed && (
          <span className="font-semibold text-navy text-[15px] tracking-tight">
            Klosure
          </span>
        )}
        <button
          type="button"
          onClick={onCollapseToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-navy/50 hover:text-navy text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-navy/5"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Top nav — rep-level destinations, rendered as side-by-side tabs */}
      {!collapsed && (
        <nav
          role="tablist"
          aria-label="Primary"
          className="px-2 pt-3 pb-2 flex items-center gap-1"
        >
          {REP_NAV.map((item) => {
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={handle(item.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                  isActive
                    ? 'bg-[var(--color-background-info)] text-[var(--color-text-info)] font-semibold'
                    : 'text-navy/70 hover:bg-navy/5'
                }`}
              >
                {item.icon != null && (
                  <span className="text-[13px] leading-none" aria-hidden>
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}

      {/* Manager section — collapsible, pinned near the top so manager
          destinations (including Team Deals) are reachable without scrolling
          past the deal list. */}
      {!collapsed && role === 'manager' && (
        <div className="px-2 pt-1 pb-2">
          <button
            type="button"
            onClick={toggleManagerSection}
            aria-expanded={managerOpen}
            aria-controls="sidebar-manager-nav"
            className="w-full flex items-center justify-between px-1.5 py-1 rounded hover:bg-navy/5"
          >
            <span className="text-[10px] uppercase tracking-wider font-semibold text-navy/45">
              Manager
            </span>
            <span
              className={`text-navy/45 text-[10px] leading-none transition-transform ${
                managerOpen ? 'rotate-90' : ''
              }`}
              aria-hidden
            >
              ›
            </span>
          </button>
          {managerOpen && (
            <nav
              id="sidebar-manager-nav"
              className="mt-1 flex flex-col gap-0.5"
            >
              {MANAGER_NAV.map((item) => (
                <SidebarNavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={activeView === item.id}
                  onClick={handle(item.id)}
                />
              ))}
            </nav>
          )}
        </div>
      )}

      {/* My deals header — "+" creates a new deal */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-navy/45">
            My deals
          </span>
          {onNewDeal && (
            <button
              type="button"
              onClick={onNewDeal}
              aria-label="New deal"
              className="text-klo hover:bg-klo/10 rounded h-7 px-2 flex items-center gap-1 text-[12px] font-semibold leading-none"
            >
              <span className="text-[18px] leading-none">+</span>
              <span>Create New Deal</span>
            </button>
          )}
        </div>
      )}
      {!collapsed && (
        <div className="px-3 pb-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search deals…"
            className="w-full rounded-md border border-navy/15 bg-white px-2.5 py-1.5 text-[12px] text-navy placeholder:text-navy/35 focus:outline-none focus:ring-2 focus:ring-klo/20 focus:border-klo/35"
          />
        </div>
      )}

      {/* Deal list */}
      <div
        className={`flex-1 overflow-y-auto ${
          collapsed ? 'px-1.5 py-2' : 'px-2 pb-2'
        } flex flex-col gap-0.5`}
      >
        {loading && sorted.length === 0 ? (
          !collapsed && (
            <>
              <DealRowSkeleton />
              <DealRowSkeleton />
              <DealRowSkeleton />
            </>
          )
        ) : filteredDeals.length === 0 ? (
          !collapsed && (
            <div className="px-2 py-3 text-[12px] text-navy/50">
              <p>{query ? 'No deals match your search' : 'No active deals yet'}</p>
            </div>
          )
        ) : (
          filteredDeals.map((deal) => (
            <SidebarDealRow
              key={deal.id}
              deal={deal}
              isActive={deal.id === currentDealId}
              showSubtitle={deal.id === currentDealId}
              collapsed={collapsed}
              onClick={handle(`deal:${deal.id}`)}
            />
          ))
        )}
      </div>

      {/* Bottom utility nav — pinned above the trial/team badges.
          Settings is the unified hub: profile, integrations, train-klo,
          billing, account. Visible to all roles. */}
      {!collapsed && (
        <div className="border-t border-navy/5 px-2 pt-2 pb-1 shrink-0">
          <SidebarNavItem
            icon="⚙"
            label="Settings"
            active={activeView === 'settings'}
            onClick={handle('settings')}
          />
        </div>
      )}

      {/* Trial countdown — only renders while user is in trial_active */}
      {!collapsed && (
        <div className="px-3 pt-2 shrink-0">
          <TrialCountdownBadge />
        </div>
      )}

      {/* Team context — hidden for managers and unattached sellers */}
      {!collapsed && (
        <div className="px-3 pt-2 shrink-0">
          <TeamContextBadge />
        </div>
      )}

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-navy/5 px-3 py-2.5 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onProfileClick}
            disabled={!onProfileClick}
            className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-md px-1 py-1 -mx-1 hover:bg-navy/5 disabled:cursor-default disabled:hover:bg-transparent"
            aria-label="Open profile"
          >
            <div
              className="w-7 h-7 rounded-full bg-klo/15 text-klo text-[11px] font-semibold flex items-center justify-center shrink-0"
              aria-hidden
            >
              {userInitials(user)}
            </div>
            <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
              <p className="text-[12px] font-medium text-navy truncate">
                {user?.name || user?.email || 'You'}
              </p>
              {role === 'manager' && (
                <span className="text-[10px] uppercase tracking-wider font-semibold text-klo shrink-0">
                  Manager
                </span>
              )}
            </div>
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-[11px] text-navy/55 hover:text-klo hover:underline shrink-0"
            >
              Log out
            </button>
          )}
        </div>
      )}

      {/* Legal links — required by Google/Microsoft OAuth verification so
          authenticated users can find the policies from inside the app. */}
      {!collapsed && (
        <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px] text-navy/45 shrink-0">
          <Link to="/privacy" className="hover:text-klo hover:underline">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-klo hover:underline">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <a
            href="mailto:rajeshwar63@gmail.com"
            className="hover:text-klo hover:underline"
          >
            Contact
          </a>
        </div>
      )}
    </aside>
  )
}
