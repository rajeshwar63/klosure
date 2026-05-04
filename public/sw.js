// =============================================================================
// Klosure service worker — Phase 4 (Week 7) "PWA ready"
// =============================================================================
// Goals:
//   - The shell loads while offline so a seller in a Gulf cell-coverage hole
//     can still open the app and see cached deals from the last successful
//     fetch (read-only).
//   - We never cache Supabase POST/PATCH writes, edge function calls, or the
//     auth token endpoint — those must always go to the network.
//
// Strategies:
//   - Static app shell (HTML / JS / CSS / icons) → cache-first with revalidate.
//   - Supabase /rest/v1 GET (deals, messages, commitments) → network-first.
//     We fall back to cache only when the network fails (Gulf cell-coverage
//     hole). Online users always see fresh rows. The earlier stale-while-
//     revalidate strategy returned the cached rows synchronously and threw
//     away the fresh network response, so users saw stale chats until they
//     hard-refreshed.
//   - Anything non-GET, anything to /auth/v1, anything to /functions/v1 → pass-
//     through. We refuse to cache writes or auth.
// =============================================================================

// Bump VERSION on cache strategy changes so old service workers get evicted.
const VERSION = 'klosure-v2'
const SHELL_CACHE = `${VERSION}-shell`
const DATA_CACHE = `${VERSION}-data`

const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/klosure.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => null)
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Never touch non-GET, auth flows, edge functions, or Stripe / Anthropic.
  if (req.method !== 'GET') return
  if (url.pathname.startsWith('/auth/v1')) return
  if (url.pathname.startsWith('/functions/v1')) return
  if (url.hostname.includes('stripe.com')) return
  if (url.hostname.includes('anthropic.com')) return
  // realtime websockets bypass fetch already, but be explicit.
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return

  const isSupabaseRest = url.pathname.includes('/rest/v1/')
  const isSameOrigin = url.origin === self.location.origin

  if (isSupabaseRest) {
    event.respondWith(networkFirst(req, DATA_CACHE))
    return
  }

  if (isSameOrigin) {
    // App shell + bundled assets. Network-first for navigations so a deploy
    // can be picked up immediately, falling back to cache when offline.
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(req, SHELL_CACHE))
      return
    }
    event.respondWith(cacheFirst(req, SHELL_CACHE))
    return
  }

  // Cross-origin GETs (fonts etc.) — cache-first with a graceful fallback.
  event.respondWith(cacheFirst(req, SHELL_CACHE))
})

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch (err) {
    return hit || new Response('', { status: 504, statusText: 'offline' })
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(req) || await cache.match('/')
    return hit || new Response('Offline', { status: 504 })
  }
}

// staleWhileRevalidate intentionally removed in v2 — it returned cached
// responses immediately AND threw away the fresh network response, so pages
// that fetch once on mount never saw the live data. networkFirst above gives
// us fresh-when-online + offline fallback, which is what we actually wanted.
