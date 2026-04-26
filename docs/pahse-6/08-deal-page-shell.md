# Step 08 — Deal page shell

**Sprint:** C (Deal page redesign)
**Goal:** Replace the Phase 5.5 deal room with the new desktop-first layout. Dark header with deal title + stuck-for chip + Share + Open in chat. Tabs below: Overview / Chat / History. The page lives inside `AppShell` so the sidebar is always visible.

## File

- `src/pages/DealRoomPage.jsx` — replaces `src/components/DealRoom.jsx`
- The old `DealRoom.jsx` stays in the codebase for now (deleted at the end of the spec)

## Page structure

```jsx
import { useParams } from 'react-router-dom';
import { useDeal } from '../hooks/useDeal';
import DealHeader from '../components/deal/DealHeader';
import DealTabs from '../components/deal/DealTabs';
import OverviewTab from '../components/deal/OverviewTab';
import ChatTab from '../components/deal/ChatTab';
import HistoryTab from '../components/deal/HistoryTab';

export default function DealRoomPage() {
  const { id } = useParams();
  const { deal, viewerRole, loading } = useDeal(id);
  const [activeTab, setActiveTab] = useTabState(id, 'overview');

  if (loading) return <DealPageSkeleton />;
  if (!deal) return <DealNotFound />;

  return (
    <div className="deal-room-page flex flex-col h-full min-h-0">
      <DealHeader deal={deal} viewerRole={viewerRole} onShare={...} onOpenChat={() => setActiveTab('chat')} />
      <DealTabs activeTab={activeTab} onChange={setActiveTab} chatCount={deal.message_count} />
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'overview' && <OverviewTab deal={deal} viewerRole={viewerRole} />}
        {activeTab === 'chat' && <ChatTab deal={deal} viewerRole={viewerRole} />}
        {activeTab === 'history' && <HistoryTab deal={deal} viewerRole={viewerRole} />}
      </div>
    </div>
  );
}
```

## Header — DealHeader.jsx

The dark navy bar at the top of the deal page.

```jsx
<header className="bg-[#2C2C2A] text-white px-5 py-3.5">
  <div className="flex items-center gap-3 flex-wrap">
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${dotColor(deal.health)}`} />
      <span className="text-base font-medium">{deal.title}</span>
    </div>

    {deal.stuck_for_weeks >= 2 && (
      <span className="bg-[#FAC775] text-[#412402] px-2.5 py-0.5 rounded-full text-xs font-medium">
        ⚠ Stuck · {deal.stuck_for_weeks}w
      </span>
    )}

    <div className="ml-auto flex gap-2">
      {viewerRole === 'seller' && (
        <button className="px-3 py-1 rounded-md text-xs border border-white/30 bg-transparent text-white" onClick={onShare}>
          Share
        </button>
      )}
      <button className="px-3 py-1 rounded-md text-xs bg-white text-[#2C2C2A] font-medium" onClick={onOpenChat}>
        Open in chat
      </button>
    </div>
  </div>
  <div className="text-xs text-white/60 mt-1">
    {deal.buyer_company} · {capitalize(deal.stage)} · {formatCurrency(deal.value)} · Deadline {deal.deadline}
  </div>
</header>
```

`stuck_for_weeks` is derived: how long since the deal's last status change to "stuck/amber" or last meaningful message. If less than 2 weeks, hide the chip. Use existing health/state data.

## Tabs — DealTabs.jsx

```jsx
<div className="border-b border-tertiary px-5">
  <div className="flex gap-1">
    <TabButton active={activeTab === 'overview'} onClick={() => onChange('overview')}>
      Overview
    </TabButton>
    <TabButton active={activeTab === 'chat'} onClick={() => onChange('chat')}>
      Chat <span className="text-tertiary text-[11px] ml-0.5">{chatCount}</span>
    </TabButton>
    <TabButton active={activeTab === 'history'} onClick={() => onChange('history')}>
      History
    </TabButton>
  </div>
</div>
```

Active tab gets a 2px solid bottom border in the primary text color, matching the mockup. Inactive tabs are secondary text color. No background on either.

## Tab persistence

Use `localStorage` keyed per deal (same pattern as Phase 3.5):

```javascript
const STORAGE_KEY_PREFIX = 'klosure:dealTab:';
function useTabState(dealId, defaultTab) {
  const [tab, setTab] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_PREFIX + dealId) ?? defaultTab;
  });
  function setAndPersist(t) {
    localStorage.setItem(STORAGE_KEY_PREFIX + dealId, t);
    setTab(t);
  }
  return [tab, setAndPersist];
}
```

When the user opens DIB and clicks "Chat", then leaves and returns, they land on Chat. Same per-deal pattern as Phase 5.5.

## "Open in chat" button behavior

The header's "Open in chat" button is just a shortcut to switching tabs. It calls `onOpenChat()` which sets `activeTab = 'chat'`. The button is more discoverable than the tab itself for users who think of chat as the action.

When already on Chat tab, the button stays visible — but it does nothing (or you can hide it; either is fine).

## History tab

For Phase 6, History is a placeholder. Use the existing `klo_state_history` data — render a chronological list of state changes. Lower priority than Overview and Chat. A simple skeleton:

```jsx
export default function HistoryTab({ deal }) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    fetchKloStateHistory(deal.id).then(setHistory);
  }, [deal.id]);
  if (!history) return <div className="p-6 text-secondary">Loading…</div>;
  if (history.length === 0) return <div className="p-6 text-secondary">No history yet — Klo hasn't made any updates to this deal record.</div>;
  return (
    <div className="p-6">
      {history.map(h => <HistoryRow key={h.id} entry={h} />)}
    </div>
  );
}
```

`HistoryRow` shows the date, what changed (field path), before → after values. Simple but useful — user can answer "when did we add Khalid as a stakeholder?"

## Loading and not-found states

```jsx
function DealPageSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-[#2C2C2A] h-16 animate-pulse" />
      <div className="border-b border-tertiary h-10 animate-pulse" />
      <div className="flex-1 p-6">
        <div className="h-32 rounded-xl bg-secondary mb-4 animate-pulse" />
        <div className="h-48 rounded-xl bg-secondary animate-pulse" />
      </div>
    </div>
  );
}

function DealNotFound() {
  return (
    <div className="p-12 text-center">
      <h2 className="text-xl font-medium mb-2">Deal not found</h2>
      <p className="text-secondary mb-4">It may have been archived or deleted.</p>
      <button onClick={() => navigate('/deals')}>← Back to deals</button>
    </div>
  );
}
```

## Acceptance

- [ ] Visit `/deals/{id}` → see new dark header, tab strip, page content
- [ ] Header shows deal title, color dot for health, "Stuck · Nw" chip if applicable, Share + Open in chat buttons
- [ ] Below header: deal subtitle line with company, stage, value, deadline
- [ ] Tab strip with Overview / Chat / History; click switches tabs
- [ ] Active tab persists per deal via localStorage
- [ ] Chat tab still uses the existing ChatView from Phase 5.5 — no chat regression
- [ ] History tab shows chronological entries from `klo_state_history`
- [ ] Loading skeleton appears while deal data loads
- [ ] Navigating to a non-existent deal shows "Deal not found"
- [ ] Sidebar stays visible at all times (provided by AppShell)

→ Next: `09-klo-recommends-card.md`
