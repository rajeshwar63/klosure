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
import SidebarNavItem from './SidebarNavItem.jsx'
import SidebarDealRow from './SidebarDealRow.jsx'

const REP_NAV = [
  { id: 'today', icon: '◆', label: 'Today' },
  { id: 'deals', icon: '≡', label: 'Deals' },
  { id: 'train-klo', icon: '✦', label: 'Train Klo' },
]

const MANAGER_NAV = [
  { id: 'this-week', icon: '◆', label: 'This week' },
  { id: 'forecast', icon: '↗', label: 'Forecast' },
  { id: 'reps', icon: '◎', label: 'Reps' },
  { id: 'askklo', icon: '✦', label: 'Ask Klo' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
]

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
  const sorted = sortDealsForSidebar(deals)
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

  const widthClass = collapsed ? 'w-[52px]' : 'w-[260px]'

  return (
    <aside
      className={`shrink-0 ${widthClass} h-full bg-[#fafafa] border-r border-navy/10 flex flex-col`}
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

      {/* Top nav — rep-level destinations, always visible regardless of role */}
      {!collapsed && (
        <nav className="px-2 pt-3 pb-2 flex flex-col gap-0.5">
          {REP_NAV.map((item) => (
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

      {/* My deals header — "+" creates a new deal */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2">
          <span className="text-[13px] uppercase tracking-wider font-semibold text-navy/45">
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

      {/* Manager nav — pinned above the user profile, only when acting as manager */}
      {!collapsed && role === 'manager' && (
        <div className="border-t border-navy/5 px-2 pt-2 pb-2 shrink-0">
          <div className="px-1.5 pb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-navy/45">
              Manager
            </span>
          </div>
          <nav className="flex flex-col gap-0.5">
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
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-navy truncate">
                {user?.name || user?.email || 'You'}
              </p>
              {role === 'manager' && (
                <span className="text-[10px] uppercase tracking-wider font-semibold text-klo mt-0.5 inline-block">
                  Mgr
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
    </aside>
  )
}
