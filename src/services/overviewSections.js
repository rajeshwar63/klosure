// Phase 5.5 step 07: per-deal persistence for collapsed/expanded section
// state on the Overview tab. Same pattern as Phase 3.5's
// `klosure:lastTab:{dealId}` — each deal has its own preferences so a
// people-heavy deal can stay expanded without affecting a quieter one.
//
// Stored value: a JSON object mapping section keys to bools. Only sections
// the user has explicitly touched are stored; untouched sections fall back to
// the default expansion from CollapsibleSection's `defaultExpanded`.

const PREFIX = 'klosure:overviewSections:'

export function loadSectionState(dealId) {
  if (!dealId || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PREFIX + dealId)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveSectionState(dealId, state) {
  if (!dealId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + dealId, JSON.stringify(state))
  } catch {
    // localStorage might be full or disabled — non-critical, give up silently.
  }
}

export function setSectionExpanded(dealId, sectionKey, expanded) {
  const current = loadSectionState(dealId)
  current[sectionKey] = expanded
  saveSectionState(dealId, current)
}

export function getSectionExpanded(dealId, sectionKey, defaultValue) {
  const state = loadSectionState(dealId)
  return sectionKey in state ? state[sectionKey] : defaultValue
}
