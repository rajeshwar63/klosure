# Step 03 — Remove the History tab

**Sprint:** A
**Goal:** Delete the History tab and its component. Anyone who needs to see what changed has the chat to ask Klo.

## Files

- `src/components/deal/DealTabs.jsx` — remove History from the tab list
- `src/pages/DealRoomPage.jsx` — remove the History case
- `src/components/deal/HistoryTab.jsx` — delete the file entirely
- Any imports referencing HistoryTab — clean them up

## DealTabs.jsx change

Remove the History tab from the tab strip:

```jsx
<div className="border-b border-tertiary px-5">
  <div className="flex gap-1">
    <TabButton active={activeTab === 'overview'} onClick={() => onChange('overview')}>
      Overview
    </TabButton>
    <TabButton active={activeTab === 'chat'} onClick={() => onChange('chat')}>
      Chat <span className="text-tertiary text-[12px] ml-0.5">{chatCount}</span>
    </TabButton>
    {/* History tab removed */}
  </div>
</div>
```

## DealRoomPage.jsx change

Remove the History case from the tab content rendering:

```jsx
{activeTab === 'overview' && <OverviewTab deal={deal} viewerRole={viewerRole} />}
{activeTab === 'chat' && <ChatTab deal={deal} viewerRole={viewerRole} />}
{/* History case removed */}
```

## Tab persistence migration

The Phase 6 tab state used localStorage with `klosure:dealTab:{dealId}`. If a user has `'history'` stored from previous use, on the next page load it will load and try to render History — which no longer exists.

Add a fallback in the `useTabState` hook:

```javascript
function useTabState(dealId, defaultTab) {
  const [tab, setTab] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + dealId);
    // Migration: history tab no longer exists
    if (stored === 'history') return defaultTab;
    return stored ?? defaultTab;
  });
  // ...
}
```

## Delete HistoryTab.jsx

Remove the file entirely:

```powershell
Remove-Item src\components\deal\HistoryTab.jsx
```

Confirm no other files import it. If they do, fix the imports (they should already be confined to `DealRoomPage.jsx`).

## What we're NOT removing

- The `klo_state_history` database table — keep it. Klo still uses history internally for "what changed" questions in chat.
- The `klo_state_history` queries — they're used by the chat extraction prompt. Keep those.

We're only removing the *tab UI* that exposed history as a top-level navigation. The data layer is unchanged.

## Where users now see history-equivalent info

When a user wants to know "what changed in this deal recently" they ask in chat:
- "What did we discuss about budget?"
- "When did Ahmed first say something about the demo?"
- "What's changed in the last week?"

Klo answers from `klo_state` + `klo_state_history` (already wired in Phase 4.5). This is the better UX anyway — natural language vs. raw history rows.

## Acceptance

- [ ] Visit any deal page
- [ ] Tab strip shows only Overview and Chat (no History tab)
- [ ] If a user previously had "history" persisted in localStorage, they land on Overview instead of crashing
- [ ] No console errors about missing HistoryTab imports
- [ ] Asking Klo "what's changed?" in chat still works (data layer untouched)
- [ ] Chat tab still has its message count badge

→ Next (Sprint B): `04-fix-stuck-for-calculation.md`
