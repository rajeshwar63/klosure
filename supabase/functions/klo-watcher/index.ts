// =============================================================================
// Klosure.ai — Klo Watcher (Phase 9 stub)
// =============================================================================
// Phase 9 dropped the commitments table. The watcher used to flip overdue
// commitments and email nudges; that responsibility moves to client-side
// derivation from `klo_state.pending_on_*` arrays (extracted by Klo every
// material turn — see Phase 9 step 03).
//
// We keep this function deployed so any cron job pointing at it still gets a
// 200 instead of 404. It is intentionally a no-op until pending-task watching
// gets ported back here in a future phase.
// =============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  return new Response(
    JSON.stringify({ ok: true, processed: 0, message: "klo-watcher is a no-op since Phase 9" }),
    { status: 200, headers: { "content-type": "application/json", ...CORS } },
  )
})
