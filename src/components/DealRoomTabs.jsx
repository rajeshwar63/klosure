// Segmented Chat / Overview switcher for the deal room. Lives just below the
// KloSummaryBar so the navy header reads as one unit. The active tab is
// persisted per-deal in localStorage so a seller who prefers Overview for a
// given deal stays on it across sessions (spec §1).
export default function DealRoomTabs({ active, onChange }) {
  return (
    <div className="bg-chat-bg border-b border-navy/10 shrink-0">
      <div className="max-w-2xl mx-auto px-3 py-2 flex gap-1">
        <TabButton active={active === 'chat'} onClick={() => onChange('chat')}>
          Chat
        </TabButton>
        <TabButton active={active === 'overview'} onClick={() => onChange('overview')}>
          Overview
        </TabButton>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 sm:flex-none sm:px-5 py-1.5 text-[13px] font-semibold rounded-md transition ${
        active
          ? 'bg-white text-navy shadow-sm border border-navy/10'
          : 'text-navy/50 hover:text-navy/80'
      }`}
    >
      {children}
    </button>
  )
}

export function loadLastTab(dealId) {
  if (!dealId) return 'chat'
  try {
    const v = localStorage.getItem(`klosure:lastTab:${dealId}`)
    return v === 'overview' ? 'overview' : 'chat'
  } catch {
    return 'chat'
  }
}

export function saveLastTab(dealId, tab) {
  if (!dealId) return
  try {
    localStorage.setItem(`klosure:lastTab:${dealId}`, tab)
  } catch {
    // ignore
  }
}
