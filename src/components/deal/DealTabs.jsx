// Phase 6 step 08 — tab strip below the deal header. Active tab gets a 2px
// underline; inactive tabs are muted text. No background on either.

const STORAGE_KEY_PREFIX = 'klosure:dealTab:'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'chat', label: 'Chat' },
  { id: 'history', label: 'History' },
]

export function loadDealTab(dealId, fallback = 'overview') {
  if (!dealId) return fallback
  try {
    const v = localStorage.getItem(STORAGE_KEY_PREFIX + dealId)
    return v && TABS.some((t) => t.id === v) ? v : fallback
  } catch {
    return fallback
  }
}

export function saveDealTab(dealId, tab) {
  if (!dealId) return
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + dealId, tab)
  } catch {
    // ignore
  }
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 md:px-4 py-2.5 text-sm transition-colors ${
        active
          ? 'text-navy font-medium'
          : 'text-navy/55 hover:text-navy/80'
      }`}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute left-2 right-2 -bottom-px h-0.5 bg-navy"
        />
      )}
    </button>
  )
}

export default function DealTabs({ activeTab, onChange, chatCount }) {
  return (
    <div className="border-b border-navy/10 bg-white px-3 md:px-5 shrink-0">
      <div className="flex gap-1">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={activeTab === t.id}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.id === 'chat' && typeof chatCount === 'number' && (
              <span className="text-navy/40 text-[11px] ml-0.5">{chatCount}</span>
            )}
          </TabButton>
        ))}
      </div>
    </div>
  )
}
