// Phase 6 step 15 — reusable empty state. Centered icon, title, description,
// and up to two CTAs. Used wherever a page or panel has no data to show.

export default function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}) {
  return (
    <div className="text-center py-12 px-6">
      {icon && (
        <div className="text-3xl mb-3 opacity-40" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-navy mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-navy/55 mb-4 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      <div className="flex gap-2 justify-center flex-wrap">
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="px-4 py-2 rounded-md text-sm font-medium bg-navy text-white"
          >
            {primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="px-4 py-2 rounded-md text-sm text-navy/80"
            style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.18)' }}
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}
