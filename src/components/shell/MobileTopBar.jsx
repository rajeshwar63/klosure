// Phase 6 — mobile-only top bar shown when the desktop sidebar is hidden.
// Hamburger opens the drawer; the centered title shows the current page
// (resolved by AppShell).

export default function MobileTopBar({ pageTitle, onMenuOpen }) {
  return (
    <div
      className="md:hidden flex items-center gap-2 px-2 h-12 bg-white border-b border-navy/10 shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <button
        type="button"
        onClick={onMenuOpen}
        aria-label="Open menu"
        className="w-11 h-11 flex items-center justify-center text-navy/70 hover:text-navy"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <span className="flex-1 text-center text-sm font-medium text-navy truncate">
        {pageTitle}
      </span>
      <span className="w-11" aria-hidden />
    </div>
  )
}
