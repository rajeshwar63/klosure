// Phase 9 step 08 — quiet danger-zone footer at the bottom of the deal
// page. Archive and Delete used to live in the deal header; they're
// destructive enough that they should sit far from the everyday actions.

export default function DangerZoneFooter({ onArchive, onDelete, locked }) {
  function handleArchive() {
    if (locked) return
    if (!window.confirm('Archive this deal? It becomes read-only but stays in your archive.')) return
    onArchive?.()
  }

  function handleDelete() {
    if (
      !window.confirm(
        'Permanently delete this deal? All messages will be lost. This cannot be undone.',
      )
    ) {
      return
    }
    onDelete?.()
  }

  return (
    <footer className="border-t border-navy/10 mt-12 py-6 px-4 md:px-6">
      <div className="max-w-[1080px] mx-auto">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
          Danger zone
        </p>
        <div className="flex flex-wrap gap-3 mb-2">
          {!locked && (
            <button
              type="button"
              onClick={handleArchive}
              className="text-[13px] font-medium text-red-700/80 hover:text-red-700 hover:underline"
            >
              Archive deal
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="text-[13px] font-medium text-red-700/80 hover:text-red-700 hover:underline"
          >
            Delete deal
          </button>
        </div>
        <p className="text-[11px] text-navy/45 leading-snug max-w-md">
          Archiving locks the deal as read-only. Deleting removes it permanently.
        </p>
      </div>
    </footer>
  )
}
