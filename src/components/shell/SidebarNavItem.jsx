// Phase 6 — sidebar primary nav row. One per top-level destination
// (Today, Deals, Forecast, etc.). Hidden when the sidebar is collapsed; only
// the deal-list dots remain in collapsed mode (per spec 01).

export default function SidebarNavItem({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-left transition-colors ${
        active
          ? 'bg-[var(--color-background-info)] text-[var(--color-text-info)] font-semibold'
          : 'text-navy/70 hover:bg-navy/5'
      }`}
    >
      {icon != null && (
        <span className="text-[13px] leading-none w-4 text-center shrink-0" aria-hidden>
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}
