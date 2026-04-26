// Phase 4.5: provenance lookups. Renders source-message snippets in tooltips
// on Overview items. Cached process-wide so hovering the same person twice
// doesn't refetch.

import { supabase } from '../lib/supabase.js'

const cache = new Map()

export async function getMessageSnippet(messageId) {
  if (!messageId) return null
  if (cache.has(messageId)) return cache.get(messageId)

  const { data } = await supabase
    .from('messages')
    .select('content, sender_name, sender_type, created_at')
    .eq('id', messageId)
    .single()

  if (!data) {
    cache.set(messageId, null)
    return null
  }
  const snippet = {
    text: data.content.length > 200 ? data.content.slice(0, 200) + '…' : data.content,
    sender: data.sender_name,
    role: data.sender_type,
    when: new Date(data.created_at).toLocaleDateString(),
  }
  cache.set(messageId, snippet)
  return snippet
}

// Bulk prefetch — fires the requests but lets the cache absorb duplicates.
// Returns a Map<messageId, snippet|null>.
export async function prefetchMessageSnippets(ids) {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const results = await Promise.all(unique.map((id) => getMessageSnippet(id)))
  const map = new Map()
  unique.forEach((id, i) => map.set(id, results[i]))
  return map
}

// Synchronous cache read for render-time use (no fetch). Returns null if the
// id hasn't been prefetched yet — callers should treat null as "no tooltip".
export function getCachedSnippet(messageId) {
  if (!messageId) return null
  return cache.get(messageId) ?? null
}
