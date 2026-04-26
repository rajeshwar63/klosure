// Phase 6 — slide-over drawer that hosts the Sidebar on screens < 768px.
//
// Drawer is always in the DOM and translated off-screen when closed so the
// open/close transition is smooth in both directions. Body scroll locks while
// open (otherwise scrolling the drawer leaks through to the page below).

import { useEffect } from 'react'

export default function MobileDrawer({ isOpen, onClose, children }) {
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ transitionDuration: '180ms' }}
      />
      <aside
        aria-hidden={!isOpen}
        className={`fixed left-0 top-0 bottom-0 w-[280px] bg-[#fafafa] z-50 md:hidden flex flex-col shadow-xl transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          transitionDuration: '220ms',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex justify-end px-2 pt-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-navy/60 hover:text-navy text-2xl leading-none w-9 h-9 flex items-center justify-center rounded hover:bg-navy/5"
          >
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </aside>
    </>
  )
}
