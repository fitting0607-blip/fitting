// Supabase Edge Function: delete-account
// - Auth required (expects Authorization: Bearer <user-jwt>)
// - Deletes public.users row first, then deletes auth user via Admin API
// - Returns 200 on success
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type Json = Record<string, unknown>

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
  if (!jwt) {
    return json(401, { error: 'Missing bearer token' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json(401, { error: 'Invalid token' })
  }

  const userId = userData.user.id

  // 1) public.users row delete
  const { error: profileErr } = await admin.from('users').delete().eq('id', userId)
  if (profileErr) {
    return json(400, { error: profileErr.message })
  }

  // 2) auth user delete (Admin API)
  const { error: authErr } = await admin.auth.admin.deleteUser(userId)
  if (authErr) {
    return json(400, { error: authErr.message })
  }

  return json(200, { ok: true })
})

