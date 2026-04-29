import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const GRACE_DAYS = Number(Deno.env.get("ACCOUNT_DELETION_GRACE_DAYS") ?? "0")

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "use POST" }, 405)

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "not authorized" }, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json({ error: "not authorized" }, 401)
    const userId = userData.user.id

    const { error: signOutErr } = await sbAdmin.auth.admin.signOut(userId)
    if (signOutErr) throw signOutErr

    const graceUntil = GRACE_DAYS > 0
      ? new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null

    if (GRACE_DAYS > 0) {
      // Soft-delete mode: mark user and leave records until policy window ends.
      const { error: updateErr } = await sbAdmin
        .from("users")
        .update({
          name: "Deleted User",
          email: `deleted+${userId}@klosure.invalid`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
      if (updateErr) throw updateErr
    } else {
      // Hard-delete mode: remove auth user; downstream rows cascade.
      const { error: deleteErr } = await sbAdmin.auth.admin.deleteUser(userId)
      if (deleteErr) throw deleteErr
    }

    return json({ ok: true, grace_days: GRACE_DAYS, grace_until: graceUntil })
  } catch (err) {
    console.error("account-delete error", err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
