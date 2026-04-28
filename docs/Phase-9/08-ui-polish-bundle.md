# Step 08 — UI polish bundle

**Goal:** Five small UI changes bundled into one step. Each is independent, fast, and visible.

## What changes

1. Replace "Refresh now" button on Buyer view with passive "Updated {timestamp}"
2. Chat background goes white (no bubble-chat aesthetic)
3. "+ New deal" button below My Deals in sidebar
4. Move Archive / Delete to bottom of deal room as danger-zone footer
5. Remove "Open in chat" button from deal room header

## Change 1 — Refresh → timestamp

### File: `src/components/seller/BuyerViewPreview.jsx` (or wherever the SellerPreviewBanner lives)

Remove the `<button>Refresh now</button>` element entirely.

Replace the banner's right side with a passive timestamp:

```jsx
<div className="seller-preview-banner">
  <div className="banner-left">
    <Eye className="icon" />
    <div>
      <strong>This is what {deal.buyer_company} sees</strong>
      <div className="banner-meta">
        Updated {formatRelativeTime(buyerView?.generated_at)} by Klo · based on your conversations
      </div>
    </div>
  </div>
  {/* No right-side button. Empty. */}
</div>
```

`formatRelativeTime`: returns "just now", "4 minutes ago", "2 hours ago", etc.

### Edge function: keep the regenerate flag, just don't expose UI for it

In `supabase/functions/klo-respond/index.ts`, the `regenerate_buyer_view` flag stays — for future use (manager-driven refreshes, debug, etc.). We just stop calling it from the UI.

### CSS: remove the button styling, add subtle "live" indicator

When buyer_view auto-updates via realtime, the timestamp briefly pulses (opacity 1 → 0.6 → 1 over 800ms) to signal freshness. Subtle, not bouncy.

## Change 2 — Chat background to white

### Files: chat container CSS

Find the chat message container and message bubbles. Change:

```css
/* Before */
.chat-container {
  background: #f3f4f6; /* or whatever the current bg is */
}
.message.seller {
  background: #d4edda;
  border-radius: 16px;
  padding: 12px 16px;
}
.message.klo {
  background: #cfe2ff;
  border-radius: 16px;
  padding: 12px 16px;
}

/* After */
.chat-container {
  background: #ffffff;
}
.message {
  background: transparent;
  border-radius: 0;
  padding: 16px 20px;
  border-bottom: 1px solid var(--hairline);
}
.message:last-child {
  border-bottom: none;
}
.message.seller .author { color: var(--text-primary); }
.message.klo .author { color: var(--accent); }
```

Result: a flat document-style chat where messages are stacked rows separated by hairline dividers, with the author name in different color (accent for Klo, neutral for seller).

Keep the timestamp inline on the right side of each row, muted.

### What stays

- Klo's monogram next to its messages
- Author name on each message
- Timestamp
- The input bar at the bottom (white, with thin border-top to separate from messages)

### What goes

- Bubble shapes
- Coloured backgrounds on individual messages
- Tail/pointer on bubbles

## Change 3 — "+ New deal" in sidebar

### File: sidebar component (likely `src/components/Sidebar.jsx` or similar)

After the My Deals list, add:

```jsx
<button className="sidebar-new-deal" onClick={() => navigate('/deal/new')}>
  + New deal
</button>
```

Styling:
- Subtle, not loud
- Match existing sidebar item styling (left-aligned, padding to match)
- Accent color for the `+` icon and text
- On hover: subtle background tint

Place it directly below the deals list, separated by a 16-24px gap.

If the deals list is empty, this button is the only call-to-action visible — that's correct, it doubles as the empty-state CTA.

## Change 4 — Archive / Delete to bottom of deal room

### File: `src/pages/DealRoomPage.jsx` and the deal room header component

**Remove from top of deal room:**
- `Archive` button
- `Delete` button

**Keep at top:**
- Win
- Lost
- Share

**Add to bottom of deal room (after all tab content):**

```jsx
<footer className="deal-room-danger-zone">
  <div className="danger-zone-header">Danger zone</div>
  <div className="danger-zone-actions">
    <button className="btn-ghost-danger" onClick={handleArchive}>
      Archive deal
    </button>
    <button className="btn-ghost-danger" onClick={handleDelete}>
      Delete deal
    </button>
  </div>
  <p className="danger-zone-note">
    Archiving locks the deal as read-only. Deleting removes it permanently.
  </p>
</footer>
```

Styling:
- Subtle red text on the buttons (not red backgrounds — too aggressive)
- Hairline border above the section
- Generous top margin (48-64px) so it sits clearly below the deal content

Both buttons get a confirmation modal before action ("Archive this deal? It will be locked as read-only.").

## Change 5 — Remove "Open in chat" button

### File: deal room header

Find the `Open in chat` button in the deal room header. Delete it. The Chat tab handles the same job.

Also check any references in routing or analytics — clean those up too.

## What this step does NOT do

- Does NOT change the chat input bar styling beyond removing bubbles
- Does NOT add a chat search or filter (out of scope)
- Does NOT redesign the sidebar beyond adding the New deal button

## Claude Code instructions

```
1. Open src/components/seller/BuyerViewPreview.jsx (or wherever SellerPreviewBanner is). Remove Refresh now button. Add passive timestamp.
2. Open chat CSS (likely in src/styles/ or component-scoped). Change background to white, remove bubble styling, add hairline dividers between messages.
3. Open sidebar component. Add "+ New deal" button below deals list.
4. Open deal room page. Remove Archive/Delete from top. Add danger-zone footer at bottom with both buttons and a note.
5. Open deal room header. Remove "Open in chat" button.
6. Verify nothing's broken: run `npm run build`, open the app, click through all surfaces.
7. Commit: "Phase 9 step 08: UI polish bundle (5 changes)"
8. Push.
```

## Acceptance

- [ ] Buyer view banner shows "Updated X minutes ago" with no button
- [ ] Realtime updates pulse the timestamp briefly
- [ ] Chat background is white, no bubbles, hairline dividers between messages
- [ ] Sidebar shows "+ New deal" below My Deals
- [ ] Deal room header has Win/Lost/Share only
- [ ] Bottom of deal room has danger zone with Archive and Delete
- [ ] No "Open in chat" anywhere
- [ ] Mobile (375px): all changes render cleanly

→ Next: `09-acceptance-walkthrough.md`
